const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

function safePath(filePath) {
  const resolved = path.resolve(filePath);
  // For simplicity, allow paths relative to workspace
  return resolved;
}

// ==================== Tool Definitions ====================

const TOOL_DEFINITIONS = [
  {
    name: "Read",
    description: "Reads a file from the local filesystem. You can access any file directly by using this tool.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The absolute path to the file to read"
        },
        offset: {
          type: "number",
          description: "The line number to start reading from"
        },
        limit: {
          type: "number",
          description: "The number of lines to read"
        }
      },
      required: ["file_path"]
    }
  },
  {
    name: "Write",
    description: "Writes a file to the local filesystem. This tool will overwrite the existing file if there is one at the provided path.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The absolute path to the file to write"
        },
        content: {
          type: "string",
          description: "The content to write to the file"
        }
      },
      required: ["file_path", "content"]
    }
  },
  {
    name: "Edit",
    description: "Performs exact string replacements in files.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The absolute path to the file to modify"
        },
        old_string: {
          type: "string",
          description: "The text to replace"
        },
        new_string: {
          type: "string",
          description: "The text to replace it with"
        },
        replace_all: {
          type: "boolean",
          description: "Replace all occurrences of old_string (default false)",
          default: false
        }
      },
      required: ["file_path", "old_string", "new_string"]
    }
  },
  {
    name: "Bash",
    description: "Executes a given bash command and returns its output. Use this for shell commands like ls, mkdir, git, npm, etc.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The command to execute"
        },
        description: {
          type: "string",
          description: "Clear, concise description of what this command does"
        },
        timeout: {
          type: "number",
          description: "Optional timeout in milliseconds (max 600000)",
          default: 120000
        }
      },
      required: ["command"]
    }
  },
  {
    name: "Glob",
    description: "Find files matching a glob pattern.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The glob pattern to match files against"
        },
        path: {
          type: "string",
          description: "The directory to search in. Defaults to current working directory."
        }
      },
      required: ["pattern"]
    }
  },
  {
    name: "Grep",
    description: "Search file contents using regex patterns.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The regular expression pattern to search for in file contents"
        },
        path: {
          type: "string",
          description: "File or directory to search in. Defaults to current working directory."
        },
        glob: {
          type: "string",
          description: "Glob pattern to filter files (e.g. \"*.js\")"
        },
        output_mode: {
          type: "string",
          enum: ["content", "files_with_matches", "count"],
          description: "Output mode: \"content\" shows matching lines, \"files_with_matches\" shows file paths (default), \"count\" shows match counts"
        },
        "-i": {
          type: "boolean",
          description: "Case insensitive search"
        },
        head_limit: {
          type: "number",
          description: "Limit output to first N lines/entries"
        }
      },
      required: ["pattern"]
    }
  },
  {
    name: "WebSearch",
    description: "Search the web for information.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to use"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "WebFetch",
    description: "Fetch content from a URL.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch content from"
        },
        prompt: {
          type: "string",
          description: "The prompt to run on the fetched content"
        }
      },
      required: ["url"]
    }
  }
];

// ==================== Tool Executors ====================

async function executeRead(args) {
  const filePath = safePath(args.file_path);
  if (!fs.existsSync(filePath)) {
    return `Error: File not found: ${filePath}`;
  }
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(filePath).slice(0, 100);
    return `Directory listing of ${filePath}:\n${files.join('\n')}`;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const offset = args.offset || 0;
  const limit = args.limit || lines.length;
  const sliced = lines.slice(offset, offset + limit);
  return sliced.map((l, i) => `${offset + i + 1}\t${l}`).join('\n');
}

async function executeWrite(args) {
  const filePath = safePath(args.file_path);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, args.content, 'utf8');
  return `File written successfully: ${filePath}`;
}

async function executeEdit(args) {
  const filePath = safePath(args.file_path);
  if (!fs.existsSync(filePath)) {
    return `Error: File not found: ${filePath}`;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  const count = args.replace_all
    ? content.split(args.old_string).length - 1
    : (content.includes(args.old_string) ? 1 : 0);
  if (count === 0) {
    return `Error: old_string not found in file.`;
  }
  if (args.replace_all) {
    content = content.split(args.old_string).join(args.new_string);
  } else {
    content = content.replace(args.old_string, args.new_string);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  return `Edit applied to ${filePath}. ${count} replacement(s) made.`;
}

async function executeBash(args) {
  const timeout = Math.min(args.timeout || 120000, 600000);
  const command = args.command;
  // Use bash if available, fallback to default shell
  const isWin = process.platform === 'win32';
  const shell = isWin ? (process.env.SHELL || 'bash') : '/bin/bash';

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(`Error: Command timed out after ${timeout}ms\n${outStr || ''}\n${errStr || ''}`);
        if (child) child.kill('SIGTERM');
      }
    }, timeout);

    let outStr = '';
    let errStr = '';

    const child = exec(command, {
      cwd: WORKSPACE_ROOT,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8',
      shell: shell,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outStr = stdout || '';
      errStr = stderr || '';
      if (error) {
        resolve(`Error: ${error.message}\n${errStr}\n${outStr}`);
      } else {
        resolve(outStr.trim() || '(command completed with no output)');
      }
    });
  });
}

async function executeGlob(args) {
  const searchPath = args.path || WORKSPACE_ROOT;
  const pattern = args.pattern;
  // Simple glob implementation using recursive readdir
  const results = [];
  const globToRegex = (pat) => {
    let regex = pat
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp('^' + regex + '$');
  };
  const regex = globToRegex(pattern);
  function walk(dir, base) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(base, fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (pattern.includes('**')) walk(fullPath, base);
      } else if (regex.test(relativePath) || regex.test(entry.name)) {
        results.push(relativePath);
      }
    }
  }
  walk(searchPath, searchPath);
  return results.length > 0
    ? `Found ${results.length} file(s):\n${results.slice(0, 200).join('\n')}`
    : `No files matching "${pattern}" found.`;
}

async function executeGrep(args) {
  const searchPath = args.path || WORKSPACE_ROOT;
  const outputMode = args.output_mode || 'files_with_matches';
  const caseInsensitive = args['-i'] || false;
  const headLimit = args.head_limit || 250;
  let regex;
  try {
    regex = new RegExp(args.pattern, caseInsensitive ? 'gi' : 'g');
  } catch {
    // Treat as literal string
    regex = new RegExp(args.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseInsensitive ? 'gi' : 'g');
  }
  const results = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', '.claude', '__pycache__'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const binaryExts = ['.exe', '.dll', '.so', '.dylib', '.bin', '.jpg', '.png', '.gif', '.pdf', '.zip'];
        if (binaryExts.includes(ext)) return;
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(regex);
            if (match) {
              if (outputMode === 'files_with_matches') {
                results.push(fullPath);
                return; // Move to next file
              } else if (outputMode === 'count') {
                // Will handle at end
              } else {
                results.push(`${fullPath}:${i + 1}: ${line.trim()}`);
              }
            }
          }
        } catch { /* skip unreadable files */ }
      }
    }
  }
  const stat = fs.statSync(searchPath);
  if (stat.isFile()) {
    // Search single file
    const content = fs.readFileSync(searchPath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(regex)) {
        results.push(`${i + 1}: ${lines[i].trim()}`);
      }
    }
  } else {
    walk(searchPath);
  }
  if (results.length === 0) return 'No matches found.';
  const unique = [...new Set(results)];
  const limited = unique.slice(0, headLimit);
  let output = limited.join('\n');
  if (unique.length > headLimit) {
    output += `\n... and ${unique.length - headLimit} more results.`;
  }
  return output;
}

async function executeWebSearch(args) {
  return `WebSearch for "${args.query}" is not available in local mode. Please use the knowledge you have been trained with, or ask the user to provide relevant information.`;
}

async function executeWebFetch(args) {
  return `WebFetch for "${args.url}" is not available in local mode. Please use the knowledge you have been trained with, or ask the user to provide the content.`;
}

const TOOL_EXECUTORS = {
  Read: executeRead,
  Write: executeWrite,
  Edit: executeEdit,
  Bash: executeBash,
  Glob: executeGlob,
  Grep: executeGrep,
  WebSearch: executeWebSearch,
  WebFetch: executeWebFetch
};

module.exports = { TOOL_DEFINITIONS, TOOL_EXECUTORS, WORKSPACE_ROOT };
