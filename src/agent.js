const https = require('https');
const http = require('http');
const { EventEmitter } = require('events');
const { TOOL_DEFINITIONS, TOOL_EXECUTORS, WORKSPACE_ROOT } = require('./tools');

require('dotenv').config();

const API_BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const API_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '8192');
const MAX_LOOP = parseInt(process.env.MAX_AGENT_LOOP || '30');

const SYSTEM_PROMPT = `You are Claude Code, Anthropic's official CLI for Claude.

You are an interactive agent helping users with software engineering tasks. You have access to tools for reading/writing files, executing commands, searching code, and more.

Always respond in the user's language. Be concise and direct.
Working directory: ${WORKSPACE_ROOT}`;

class Agent extends EventEmitter {
  constructor(options = {}) {
    super();
    this.model = options.model || MODEL;
    this.maxTokens = options.maxTokens || MAX_TOKENS;
    this.systemPrompt = options.systemPrompt || SYSTEM_PROMPT;
    this.tools = options.tools || TOOL_DEFINITIONS;
    this.withTools = options.withTools !== false; // default: use tools
    this._stopped = false;
    this._currentReq = null; // Reference to current HTTP request for abort
  }

  stop() {
    this._stopped = true;
    if (this._currentReq) {
      try { this._currentReq.destroy(); } catch {}
      this._currentReq = null;
    }
  }

  _isAborted() {
    return this._stopped;
  }

  _checkAborted() {
    if (this._stopped) {
      throw { name: 'AbortError', message: 'Agent was stopped' };
    }
  }

  async run(messages) {
    this._stopped = false;
    let loopCount = 0;
    let useTools = this.withTools;

    this.emit('agent_start', {});

    try {
      while (loopCount < MAX_LOOP) {
        loopCount++;
        if (this._isAborted()) throw { name: 'AbortError' };

        let result;
        try {
          result = await this._streamCall(messages, useTools);
        } catch (err) {
          if (err.code === 'TOOLS_NOT_SUPPORTED' && useTools) {
            useTools = false;
            this.emit('thinking_delta', { text: '(Tools not supported by this API, switching to text-only mode)' });
            this.emit('thinking_done', {});
            continue;
          }
          throw err;
        }

        if (this._isAborted()) throw { name: 'AbortError' };

        if (result.done) {
          this.emit('agent_done', { usage: result.usage, stopReason: result.stopReason, loops: loopCount });
          return messages;
        }

        const toolResults = [];
        for (const tool of result.toolUses) {
          if (this._isAborted()) throw { name: 'AbortError' };

          const executor = TOOL_EXECUTORS[tool.name];
          let execResult;
          if (!executor) {
            execResult = { content: `Unknown tool: ${tool.name}`, isError: true };
          } else {
            try {
              const raw = await executor(tool.input);
              const content = typeof raw === 'string'
                ? (raw.length > 3000 ? raw.substring(0, 3000) + '\n...(truncated)' : raw)
                : JSON.stringify(raw);
              execResult = { content, isError: false };
            } catch (err) {
              execResult = { content: err.message, isError: true };
            }
          }

          this.emit('tool_result', {
            tool_use_id: tool.id,
            name: tool.name,
            content: execResult.content,
            isError: execResult.isError
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: execResult.content,
            is_error: execResult.isError
          });
        }

        messages.push({ role: 'user', content: toolResults });
      }

      this.emit('agent_done', { stopReason: 'max_loops', loops: loopCount });
      return messages;
    } catch (err) {
      console.error('[Agent Error]', err.name, err.message, err.code);
      if (err.name === 'AbortError' || err.code === 'ABORT_ERR' || err.code === 'ECONNRESET') {
        this.emit('agent_done', { stopReason: 'user_stop', error: err.message });
        return messages;
      }
      this.emit('agent_error', { message: err.message });
      return messages;
    } finally {
      this._currentReq = null;
    }
  }

  // Streaming call — emits events AND returns full tool_use blocks
  _streamCall(messages, useTools) {
    const url = new URL(API_BASE);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const apiPath = url.pathname.replace(/\/$/, '') + '/v1/messages';

    const bodyObj = {
      model: this.model,
      max_tokens: this.maxTokens,
      stream: true,
      system: this.systemPrompt,
      messages
    };
    if (useTools) {
      bodyObj.tools = this.tools;
    }

    const body = JSON.stringify(bodyObj);

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: apiPath,
      method: 'POST',
      headers: {
        'x-api-key': API_TOKEN,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'accept': 'text/event-stream'
      },
    };

    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        this._currentReq = req;
        if (res.statusCode >= 400) {
          let errBody = '';
          res.on('data', chunk => errBody += chunk);
          res.on('end', () => {
            let msg = `API error ${res.statusCode}`;
            try {
              const parsed = JSON.parse(errBody);
              msg = parsed.error?.message || msg;
              // Detect if tools aren't supported
              if (msg.includes('tool') || msg.includes('function')) {
                reject(Object.assign(new Error(msg), { code: 'TOOLS_NOT_SUPPORTED' }));
                return;
              }
            } catch {}
            reject(new Error(msg));
          });
          return;
        }

        let buffer = '';
        let currentData = '';
        let currentBlockIdx = -1;
        let currentBlockType = null;

        // Accumulated state
        const allBlocks = []; // { type, id?, name?, input_json_str?, text? }
        let havingThinking = false;
        let stopReason = null;
        let usage = null;

        const flushEvent = () => {
          if (!currentData) return;
          try {
            const event = JSON.parse(currentData);
            processEvent(event);
          } catch {}
          currentData = '';
        };

        const processEvent = (event) => {
          switch (event.type) {
            case 'message_start':
              usage = event.message?.usage;
              break;

            case 'content_block_start': {
              const block = event.content_block;
              currentBlockIdx = event.index;
              currentBlockType = block.type;
              const entry = { index: event.index, type: block.type };

              if (block.type === 'tool_use') {
                entry.id = block.id;
                entry.name = block.name;
                entry.input_json_str = '';
                // Defer tool_call emission until content_block_stop when input is complete
              } else if (block.type === 'thinking') {
                havingThinking = true;
              } else if (block.type === 'text') {
                entry.text = block.text || '';
              }
              allBlocks.push(entry);
              break;
            }

            case 'content_block_delta': {
              const idx = event.index;
              const block = allBlocks.find(b => b.index === idx);
              if (!block) break;

              if (event.delta.type === 'text_delta') {
                block.text = (block.text || '') + event.delta.text;
                this.emit('text_delta', { text: event.delta.text });
              } else if (event.delta.type === 'input_json_delta') {
                block.input_json_str = (block.input_json_str || '') + event.delta.partial_json;
              } else if (event.delta.type === 'thinking_delta') {
                this.emit('thinking_delta', { text: event.delta.thinking });
              }
              break;
            }

            case 'content_block_stop': {
              const endedBlock = allBlocks.find(b => b.index === event.index);
              if (endedBlock) {
                if (endedBlock.type === 'thinking' && havingThinking) {
                  havingThinking = false;
                  this.emit('thinking_done', {});
                } else if (endedBlock.type === 'tool_use') {
                  // Input JSON is now complete, parse and emit
                  let input = {};
                  try { input = JSON.parse(endedBlock.input_json_str || '{}'); } catch {}
                  this.emit('tool_call', { id: endedBlock.id, name: endedBlock.name, input });
                }
              }
              break;
            }

            case 'message_delta':
              stopReason = event.delta?.stop_reason;
              usage = event.usage || usage;
              break;

            case 'message_stop':
              break;
          }
        };

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          // Process complete SSE events (separated by \n\n)
          const parts = buffer.split('\n\n');
          buffer = parts.pop(); // Keep incomplete part
          for (const part of parts) {
            const lines = part.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                currentData += line.slice(6);
              }
            }
            flushEvent();
          }
        });

        res.on('end', () => {
          // Process remaining
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                currentData += line.slice(6);
              }
            }
            flushEvent();
          }

          // Build assistant content from accumulated blocks
          const assistantContent = [];
          const toolUses = [];

          for (const block of allBlocks) {
            if (block.type === 'text' && block.text) {
              assistantContent.push({ type: 'text', text: block.text });
            } else if (block.type === 'tool_use') {
              let input = {};
              try {
                input = JSON.parse(block.input_json_str || '{}');
              } catch {}
              assistantContent.push({
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input
              });
              toolUses.push({ id: block.id, name: block.name, input });
            }
          }

          if (assistantContent.length === 0 && stopReason === 'end_turn') {
            // Empty response
            assistantContent.push({ type: 'text', text: '' });
          }

          messages.push({ role: 'assistant', content: assistantContent });

          if (toolUses.length > 0) {
            resolve({ done: false, toolUses });
          } else {
            this.emit('text_done', {});
            resolve({ done: true, usage, stopReason });
          }
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // Simple non-streaming for basic chat (no tools)
  async chat(messages) {
    const url = new URL(API_BASE);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const apiPath = url.pathname.replace(/\/$/, '') + '/v1/messages';

    return new Promise((resolve, reject) => {
      const req = client.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: apiPath,
        method: 'POST',
        headers: {
          'x-api-key': API_TOKEN,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            try {
              const err = JSON.parse(body);
              reject(new Error(err.error?.message || `API error ${res.statusCode}`));
            } catch { reject(new Error(`API error ${res.statusCode}: ${body}`)); }
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch { reject(new Error(`Parse error: ${body}`)); }
        });
      });
      req.on('error', reject);
      req.write(JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.systemPrompt,
        messages
      }));
      req.end();
    });
  }
}

module.exports = { Agent, SYSTEM_PROMPT };
