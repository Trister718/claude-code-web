const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Agent } = require('./agent');
const { TOOL_DEFINITIONS } = require('./tools');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONV_FILE = path.join(DATA_DIR, 'conversations.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CONV_FILE)) fs.writeFileSync(CONV_FILE, '[]');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Store active agents so we can stop them
const activeAgents = {};

// ==================== Conversation CRUD ====================

function readConversations() {
  try {
    return JSON.parse(fs.readFileSync(CONV_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeConversations(convs) {
  fs.writeFileSync(CONV_FILE, JSON.stringify(convs, null, 2));
}

app.get('/api/conversations', (req, res) => {
  const convs = readConversations();
  // Return summary (without full messages)
  res.json(convs.map(c => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messages ? c.messages.length : 0
  })));
});

app.get('/api/conversations/:id', (req, res) => {
  const convs = readConversations();
  const conv = convs.find(c => c.id === req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  res.json(conv);
});

app.post('/api/conversations', (req, res) => {
  const convs = readConversations();
  const conv = {
    id: 'conv_' + Date.now(),
    title: req.body.title || 'New Conversation',
    messages: req.body.messages || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  convs.push(conv);
  writeConversations(convs);
  res.json(conv);
});

app.put('/api/conversations/:id', (req, res) => {
  const convs = readConversations();
  const idx = convs.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  convs[idx] = { ...convs[idx], ...req.body, updatedAt: new Date().toISOString() };
  writeConversations(convs);
  res.json(convs[idx]);
});

app.delete('/api/conversations/:id', (req, res) => {
  const convs = readConversations();
  const filtered = convs.filter(c => c.id !== req.params.id);
  writeConversations(filtered);
  res.json({ ok: true });
});

// ==================== Agent Streaming ====================

app.post('/api/agent/stream', (req, res) => {
  const { messages, conversationId } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  let closed = false;

  function sendSSE(event, data) {
    if (closed) return;
    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      res.write(`event: ${event}\ndata: ${payload}\n\n`);
    } catch {
      closed = true;
    }
  }

  const agent = new Agent();

  // Track this agent so we can stop it
  const agentId = conversationId || 'default';
  activeAgents[agentId] = agent;

  // Forward all agent events to SSE
  agent.on('agent_start', (data) => sendSSE('agent_start', data));
  agent.on('thinking_delta', (data) => sendSSE('thinking_delta', data));
  agent.on('thinking_done', (data) => sendSSE('thinking_done', data));
  agent.on('tool_call', (data) => sendSSE('tool_call', data));
  agent.on('tool_result', (data) => sendSSE('tool_result', data));
  agent.on('text_delta', (data) => sendSSE('text_delta', data));
  agent.on('text_done', (data) => sendSSE('text_done', data));
  agent.on('agent_error', (data) => sendSSE('agent_error', data));
  agent.on('agent_done', (data) => {
    sendSSE('agent_done', data);
    closed = true;
    if (!res.writableEnded) res.end();
    delete activeAgents[agentId];
  });

  // Client disconnect — clean up agent from active list
  req.on('close', () => {
    delete activeAgents[agentId];
  });

  // Start the agent loop
  agent.run(messages).catch(err => {
    sendSSE('agent_error', { message: err.message });
    closed = true;
    if (!res.writableEnded) res.end();
    delete activeAgents[agentId];
  });

  // Save conversation after agent finishes
  agent.on('agent_done', (data) => {
    if (conversationId) {
      const convs = readConversations();
      const idx = convs.findIndex(c => c.id === conversationId);
      if (idx !== -1) {
        convs[idx].messages = messages;
        convs[idx].updatedAt = new Date().toISOString();
        // Auto-title from first user message
        if (convs[idx].title === 'New Conversation') {
          const firstUserMsg = messages.find(m => m.role === 'user');
          if (firstUserMsg) {
            const text = firstUserMsg.content;
            const title = typeof text === 'string'
              ? text.substring(0, 50)
              : (Array.isArray(text) ? text.find(b => b.type === 'text')?.text?.substring(0, 50) || '' : '');
            convs[idx].title = title || 'New Conversation';
          }
        }
        writeConversations(convs);
      }
    }
  });
});

// ==================== Stop Agent ====================

app.post('/api/agent/stop/:conversationId', (req, res) => {
  const agent = activeAgents[req.params.conversationId];
  if (agent) {
    agent.stop();
    res.json({ ok: true });
  } else {
    res.json({ ok: false, message: 'No active agent' });
  }
});

// ==================== Simple Chat (no tools) ====================

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: 'messages required' });

  try {
    const agent = new Agent({ withTools: false });
    const result = await agent.chat(messages);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Start Server ====================

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Claude Code Web running at http://localhost:${PORT}`);
  console.log(`Model: ${process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'}`);
  console.log(`API: ${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}`);
  console.log(`Tools: ${TOOL_DEFINITIONS.map(t => t.name).join(', ')}`);
});
