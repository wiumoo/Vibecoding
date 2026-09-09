/**
 * llm.mjs — isolated `claude -p` invocation (plan §7.6). Shared by the draft
 * pipeline and the M1 llm-verify gate.
 *
 * Isolation (all required for the "no tools" guarantee to hold):
 *   - empty temp cwd            → no project CLAUDE.md / .claude pickup
 *   - --allowedTools ""         → no tool use
 *   - --strict-mcp-config +     → no MCP servers
 *     --mcp-config {}
 *   - pinned --model            → no env model drift
 *   - launchd-like minimal env  → PATH + HOME + USER/LOGNAME/TMPDIR (the last
 *     three are required for claude's Keychain auth lookup — M1 finding)
 * Mail bodies are passed only inside the MAIL_DATA delimiters and the system
 * prompt says never to obey instructions within them.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLAUDE_CANDIDATES = [
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  path.join(os.homedir(), '.local', 'bin', 'claude'),
  path.join(os.homedir(), '.claude', 'local', 'claude'),
];

export async function resolveClaude(settings) {
  const list = settings.llm?.claudePath ? [settings.llm.claudePath, ...CLAUDE_CANDIDATES] : CLAUDE_CANDIDATES;
  for (const p of list) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  throw new Error(`claude CLI not found (tried: ${list.join(', ')}) — set settings.llm.claudePath`);
}

export const ISOLATION_ARGS = ['--allowedTools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];

function minimalEnv() {
  return {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: os.homedir(),
    USER: os.userInfo().username,
    LOGNAME: os.userInfo().username,
    TMPDIR: os.tmpdir().endsWith('/') ? os.tmpdir() : os.tmpdir() + '/',
    TERM: 'dumb',
  };
}

/** Wrap untrusted mail content as data (plan §7.6). */
export function wrapMailData(content) {
  return ['<<<MAIL_DATA', content, 'MAIL_DATA>>>'].join('\n');
}

/**
 * Run one isolated prompt. Returns the parsed claude JSON result object
 * (with .result, .usage/.modelUsage, ...). Throws on is_error / parse failure.
 * Creates and removes its own temp cwd unless one is supplied.
 */
export async function runIsolated({ claudePath, model, prompt, cwd }) {
  const ownCwd = !cwd;
  if (ownCwd) cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'njusmail-llm-'));
  const args = ['-p', prompt, '--output-format', 'json', ...ISOLATION_ARGS, '--model', model];
  try {
    return await new Promise((resolve, reject) => {
      const child = execFile(
        claudePath,
        args,
        { cwd, env: minimalEnv(), timeout: 180_000, maxBuffer: 16 * 1024 * 1024 },
        (err, stdout) => {
          if (err) return reject(err);
          let res;
          try {
            res = JSON.parse(stdout);
          } catch (e) {
            return reject(new Error(`could not parse claude JSON: ${e.message}`));
          }
          if (res.is_error) return reject(new Error(`claude is_error: ${String(res.result).slice(0, 200)}`));
          resolve(res);
        }
      );
      if (child.stdin) child.stdin.end();
    });
  } finally {
    if (ownCwd) await fs.rm(cwd, { recursive: true, force: true });
  }
}

/** Normalize usage fields from a claude result into a compact record (plan §6.5). */
export function usageOf(res, { mailId } = {}) {
  const u = res.usage || {};
  const mu = res.modelUsage || {};
  const modelName = Object.keys(mu)[0] || null;
  const m = modelName ? mu[modelName] : {};
  return {
    at: new Date().toISOString(),
    mailId: mailId || null,
    model: modelName,
    inputTokens: m.inputTokens ?? u.input_tokens ?? 0,
    outputTokens: m.outputTokens ?? u.output_tokens ?? 0,
    cacheReadTokens: m.cacheReadInputTokens ?? u.cache_read_input_tokens ?? 0,
    costUsd: typeof res.total_cost_usd === 'number' ? res.total_cost_usd : (m.costUSD ?? null),
    estimated: typeof res.total_cost_usd !== 'number',
  };
}
