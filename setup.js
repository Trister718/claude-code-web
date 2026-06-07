const fs = require('fs');
const path = require('path');

const settingsPath = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'settings.json');
const envPath = path.join(__dirname, '.env');

let env = {};

// Try to read existing .env first
if (fs.existsSync(envPath)) {
  const existing = fs.readFileSync(envPath, 'utf8');
  existing.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) env[key.trim()] = rest.join('=').trim();
  });
}

// Read Claude Code settings
if (fs.existsSync(settingsPath)) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (settings.env) {
    if (settings.env.ANTHROPIC_AUTH_TOKEN) env.ANTHROPIC_AUTH_TOKEN = settings.env.ANTHROPIC_AUTH_TOKEN;
    if (settings.env.ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = settings.env.ANTHROPIC_BASE_URL;
    if (settings.env.ANTHROPIC_MODEL) env.ANTHROPIC_MODEL = settings.env.ANTHROPIC_MODEL;
  }
}

env.PORT = env.PORT || '3000';

const content = Object.entries(env)
  .map(([k, v]) => `${k}=${v}`)
  .join('\n') + '\n';

fs.writeFileSync(envPath, content);
console.log('.env file generated successfully.');
console.log(`Model: ${env.ANTHROPIC_MODEL}`);
console.log(`Port: ${env.PORT}`);
