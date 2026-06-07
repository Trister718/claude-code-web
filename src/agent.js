const Anthropic = require('@anthropic-ai/sdk');
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
    this.withTools = options.withTools !== false;

    this._stopped = false;
    this._stream = null; // Reference to SDK MessageStream for abort

    // SDK client — created once per agent instance
    this._client = new Anthropic({
      apiKey: API_TOKEN,
      baseURL: API_BASE,
    });
  }

  stop() {
    this._stopped = true;
    if (this._stream) {
      try { this._stream.abort(); } catch {}
      this._stream = null;
    }
  }

  _isAborted() {
    return this._stopped;
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

        // Execute tools and feed results back
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
      this._stream = null;
    }
  }

  // ── Streaming call using SDK MessageStream ──
  _streamCall(messages, useTools) {
    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      messages,
    };
    if (useTools) {
      params.tools = this.tools;
    }

    return new Promise((resolve, reject) => {
      const stream = this._client.messages.stream(params);
      this._stream = stream; // store for abort

      const allBlocks = [];
      let havingThinking = false;
      let stopReason = null;
      let usage = null;

      stream.on('streamEvent', (event) => {
        switch (event.type) {
          case 'message_start':
            usage = event.message?.usage;
            break;

          case 'content_block_start': {
            const block = event.content_block;
            const entry = { index: event.index, type: block.type };
            if (block.type === 'tool_use') {
              entry.id = block.id;
              entry.name = block.name;
              entry.input_json_str = '';
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
      });

      stream.on('error', (error) => {
        // Detect tools-not-supported errors
        const msg = error.message || '';
        if (msg.includes('tool') || msg.includes('function')) {
          reject(Object.assign(new Error(msg), { code: 'TOOLS_NOT_SUPPORTED' }));
          return;
        }
        reject(error);
      });

      stream.on('abort', () => {
        // Stream was aborted via stop() — handled by run() loop
      });

      stream.on('end', () => {
        // Build assistant content from accumulated blocks
        const assistantContent = [];
        const toolUses = [];

        for (const block of allBlocks) {
          if (block.type === 'text' && block.text) {
            assistantContent.push({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            let input = {};
            try { input = JSON.parse(block.input_json_str || '{}'); } catch {}
            assistantContent.push({ type: 'tool_use', id: block.id, name: block.name, input });
            toolUses.push({ id: block.id, name: block.name, input });
          }
        }

        if (assistantContent.length === 0 && stopReason === 'end_turn') {
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
    });
  }

  // ── Non-streaming chat (no tools) using SDK ──
  async chat(messages) {
    try {
      const response = await this._client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.systemPrompt,
        messages,
      });
      return response;
    } catch (err) {
      throw new Error(err.message || 'API error');
    }
  }
}

module.exports = { Agent, SYSTEM_PROMPT };
