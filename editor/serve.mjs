// Serves the repo for the map editor and writes editor/world.json on save.
//   npm run edit   (from source/)
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'world.json');
const src = path.join(root, 'source');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

// npm run build, from source/; saves are serialized so two quick clicks cannot interleave
let queue = Promise.resolve();
const build = () => (queue = queue.then(() => new Promise((resolve) => {
  const p = spawn(process.execPath, ['build.mjs'], { cwd: src });
  let log = '';
  p.stdout.on('data', (d) => (log += d));
  p.stderr.on('data', (d) => (log += d));
  p.on('error', (e) => { console.error('[build] ' + e.message); resolve({ code: -1, log: e.message }); });
  p.on('close', (code) => {
    const last = log.trim().split('\n').pop() || '';
    console.log(code === 0 ? '[build] ' + last : '[build failed] ' + last);
    resolve({ code, log: last });
  });
})));

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/save') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        JSON.parse(body);
        await writeFile(out, body);
        const r = await build();
        res.writeHead(r.code === 0 ? 200 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(r.code === 0 ? 'ok ' + r.log : 'build failed: ' + r.log);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(String(e));
      }
    });
    return;
  }
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(root, url === '/' ? '/editor/index.html' : url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
}).listen(8765, () => {
  const url = 'http://127.0.0.1:8765/editor/';
  console.log('map editor: ' + url + '  (saving rebuilds index.html)');
  // open the editor once the port is up, so the browser never hits a refused connection
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
});

