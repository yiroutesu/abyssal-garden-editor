// Serves the repo for the map editor and writes editor/world.json on save.
//   npm run edit   (from source/)
//
// 端口从 8765 开始找空闲端口；探测同时覆盖 127.0.0.1 和 ::1。
// Windows 允许 ::/0.0.0.0 与 127.0.0.1 绑同一端口，残留的 http.server 会抢走 localhost 请求，
// 导致编辑器打不开或读到旧文件，所以必须先确认端口上不是别的进程。
import { createServer } from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = 'abyssal-garden-editor';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'world.json');
const src = path.join(root, 'source');
const urlFile = path.join(root, '.dev-url');
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

const server = createServer(async (req, res) => {
  if (req.url === '/__ping' || req.url === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ app: APP, root, port: server.address()?.port ?? null }));
    return;
  }
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
});

const listening = (host, port) => new Promise((resolve) => {
  const sock = net.connect({ host, port });
  const done = (v) => { sock.destroy(); resolve(v); };
  sock.once('connect', () => done(true));
  sock.once('error', () => done(false));
  sock.setTimeout(400, () => done(false));
});

const probe = async (port) => {
  for (const host of ['127.0.0.1', '[::1]']) {
    try {
      const r = await fetch(`http://${host}:${port}/__ping`, { signal: AbortSignal.timeout(600) });
      const meta = await r.json();
      if (meta.app === APP) return meta;
    } catch { /* 该协议族上没有本服务 */ }
  }
  return null;
};

const announce = async (port, reused) => {
  const url = `http://127.0.0.1:${port}/editor/`;
  await writeFile(urlFile, url + '\n');
  console.log(`${APP}: ${url}${reused ? '  (已有一个实例在跑，直接复用)' : '  (saving rebuilds index.html)'}`);
  console.log(`URL=${url}`);
  // 端口已经在监听后再开浏览器，避免浏览器撞上 connection refused
  if (!process.env.NO_OPEN && process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
};

const start = async (port, left) => {
  if (await listening('127.0.0.1', port) || await listening('::1', port)) {
    if (await probe(port)) { await announce(port, true); return; }
    if (left > 0) return start(port + 1, left - 1);
    console.error(`port ${port} 被其他程序占用（不是编辑器服务），请释放端口或设置 EDIT_PORT 环境变量`);
    process.exit(1);
  }

  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && left > 0) return start(port + 1, left - 1);
    console.error(e.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => announce(port, false));
};

start(Number(process.env.EDIT_PORT) || 8765, 10);
