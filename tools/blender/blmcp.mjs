/**
 * Minimal local client for the BlenderMCP add-on socket (127.0.0.1:9876).
 * The Codex session has no blender-mcp tool registered, but the add-on is
 * listening, so drive the same protocol directly. Localhost only.
 *
 * Usage:
 *   node .cache/blmcp.mjs scene
 *   node .cache/blmcp.mjs shot out.png
 *   node .cache/blmcp.mjs code 'print(1)'
 *   node .cache/blmcp.mjs file path/to/script.py
 */
import net from 'node:net';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const HOST = '127.0.0.1';
const PORT = 9876;

function send(payload, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: HOST, port: PORT });
    let buf = '';
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    sock.on('connect', () => sock.write(JSON.stringify(payload)));
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      try {
        const json = JSON.parse(buf);
        clearTimeout(timer);
        sock.end();
        resolve(json);
      } catch {
        /* keep buffering */
      }
    });
    sock.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

const mode = process.argv[2] ?? 'scene';
let payload;

if (mode === 'scene') {
  payload = { type: 'get_scene_info', params: {} };
} else if (mode === 'shot') {
  // Blender's own CWD is not this workspace, so a relative filepath lands
  // somewhere unreachable. Always hand it an absolute path.
  const out = process.argv[3] ?? '.cache/shot.png';
  payload = { type: 'get_viewport_screenshot', params: { filepath: resolve(out), max_size: 1400 } };
} else if (mode === 'code') {
  payload = { type: 'execute_code', params: { code: process.argv[3] } };
} else if (mode === 'file') {
  // KEY=VALUE args become a Python preamble so one script can be re-run with
  // different parameters instead of editing it each time.
  const kv = process.argv.slice(4).filter((a) => /^[A-Z_][A-Z0-9_]*=/.test(a));
  const pre = kv.map((a) => {
    const i = a.indexOf('=');
    return `${a.slice(0, i)} = ${JSON.stringify(a.slice(i + 1))}`;
  }).join('\n');
  payload = { type: 'execute_code', params: { code: (pre ? pre + '\n' : '') + readFileSync(process.argv[3], 'utf8') } };
} else {
  throw new Error(`unknown mode ${mode}`);
}

const res = await send(payload);
const result = res?.result ?? res;

if (mode === 'shot' && typeof result === 'string' && result.startsWith('data:image')) {
  const b64 = result.split(',')[1];
  writeFileSync(process.argv[3] ?? '.cache/shot.png', Buffer.from(b64, 'base64'));
  console.log(`saved ${process.argv[3] ?? '.cache/shot.png'}`);
} else {
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}
