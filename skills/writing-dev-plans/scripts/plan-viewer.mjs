// @ts-check
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { readPlanDir, knownFormat } from './lib/parse-plan.mjs';
import { lintPlanDir } from './lib/lint.mjs';
import { visualStatus } from './lib/visual.mjs';

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const foreground = args.includes('--foreground'), noOpen = args.includes('--no-open');
const dirArg = value('--dir'), tab = value('--tab');
const portArg = value('--port'), idle = Number(value('--idle-minutes') ?? 120);
if ((tab && !['plan', 'impl', 'progress', 'visual'].includes(tab)) || !Number.isFinite(idle) || idle <= 0 || (portArg !== undefined && (!/^\d+$/.test(portArg) || Number(portArg) > 65535)) || (args.includes('--dir') && !dirArg)) {
  console.error('Invalid arguments'); process.exit(2);
}
const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const root = git.status === 0 ? git.stdout.trim() : process.cwd();
const plans = path.join(root, '.plans'), stateFile = path.join(plans, '.viewer.json'), lockFile = path.join(plans, '.viewer.lock');
const assets = decodeURIComponent(new URL('../assets/', import.meta.url).pathname);
if (!fs.existsSync(plans) || !fs.statSync(plans).isDirectory()) { console.error('Run new-plan.sh first to create .plans/'); process.exit(2); }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return null; } };
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
function health(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 1000 }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(null));
  });
}
async function valid(s) { if (!s || !Number.isInteger(s.pid) || !Number.isInteger(s.port) || !alive(s.pid)) return false; const h = await health(s.port); return !!h && h.root === root && h.pid === s.pid; }
function url(port) { return `http://127.0.0.1:${port}/${dirArg ? `p/${encodeURIComponent(dirArg)}` : ''}${tab ? `#${tab}` : ''}`; }
function openBrowser(address) {
  if (noOpen) return;
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const child = spawn(command, process.platform === 'win32' ? ['/c', 'start', '', address] : [address], { detached: true, stdio: 'ignore' });
  child.on('error', () => {}); child.unref();
}
function output(s, reused) { const address = url(s.port); openBrowser(address); console.log(JSON.stringify({ url: address, reused, pid: s.pid })); }
async function lock() {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    try { const fd = fs.openSync(lockFile, 'wx'); fs.closeSync(fd); return; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try { if (Date.now() - fs.statSync(lockFile).mtimeMs > 10000) { fs.unlinkSync(lockFile); continue; } } catch (e) { if (e.code !== 'ENOENT') throw e; }
      await pause(100);
    }
  }
  throw new Error('Timed out acquiring viewer lock');
}
if (!foreground) {
  const before = state();
  if (await valid(before)) { output(before, true); process.exit(0); }
  const child = spawn(process.execPath, [process.argv[1], ...args, '--foreground', '--no-open'], { detached: true, stdio: 'ignore' });
  child.on('error', () => {}); child.unref();
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    await pause(100); const s = state();
    if (await valid(s)) { output(s, s.pid !== child.pid); process.exit(0); }
  }
  console.error('Timed out starting viewer'); process.exit(1);
}
await lock();
let locked = true;
const unlock = () => { if (locked) { locked = false; try { fs.unlinkSync(lockFile); } catch {} } };
try {
  const old = state();
  if (await valid(old)) { unlock(); output(old, true); process.exit(0); }
  const known = knownFormat();
  const clients = new Set(), timers = new Map();
  let lastRequest = Date.now(), closing = false;
  const validDir = dir => {
    if (!dir || dir.startsWith('.') || dir.includes('..') || /[/\\]/.test(dir)) return false;
    try { return fs.statSync(path.join(plans, dir)).isDirectory() && path.dirname(fs.realpathSync(path.join(plans, dir))) === fs.realpathSync(plans); } catch { return false; }
  };
  const detail = dir => { const data = readPlanDir(path.join(plans, dir), { knownFormat: known }); return { ...data, knownFormat: known, lint: lintPlanDir(data.path, { knownFormat: known }), visualStatus: visualStatus(data) }; };
  const summary = dir => {
    const d = detail(dir), counts = { todo: 0, doing: 0, done: 0, blocked: 0, dropped: 0 };
    for (const task of d.impl?.tasks ?? []) { const key = task.status.split(':')[0]; if (Object.hasOwn(counts, key)) counts[key]++; }
    return { dir, title: d.plan?.title ?? d.impl?.title ?? null, date: d.plan?.header.Date?.value ?? d.impl?.header.Date?.value ?? null, mtime: d.mtime,
      plan: d.plan ? { status: d.plan.header.Status?.value ?? null, format: d.plan.format } : null,
      impl: d.impl ? { status: d.impl.header.Status?.value ?? null, execution: d.impl.header.Execution?.value ?? null, format: d.impl.format, counts } : null,
      flags: { needsUser: [...(d.plan?.log ?? []), ...(d.impl?.log ?? [])].filter(x => x.kind === 'needs-user').length, blocked: counts.blocked, running: d.runs.filter(r => !r.handoff).length },
      visuals: d.visualStatus.map(({ file, state }) => ({ file, state })) };
  };
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
  function file(res, base, rel, sandbox = false) {
    if (sandbox) res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-popups');
    if (rel.split(/[\\/]/).some(part => part === '..') || path.isAbsolute(rel)) { res.writeHead(403).end(); return; }
    try {
      const parent = fs.realpathSync(base), target = fs.realpathSync(path.join(base, rel));
      if (!target.startsWith(parent + path.sep)) { res.writeHead(403).end(); return; }
      if (!fs.statSync(target).isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(target).toLowerCase()] ?? 'application/octet-stream' }); fs.createReadStream(target).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404).end(); }
  }
  const server = http.createServer((req, res) => {
    lastRequest = Date.now();
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    let pathname; try { pathname = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400).end(); return; }
    const json = data => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      if (pathname === '/health') return json({ root, pid: process.pid });
      if (pathname === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); res.write('event: hello\ndata: {}\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (pathname === '/api/plans') return json(fs.readdirSync(plans).filter(validDir).sort().reverse().map(summary));
      if (pathname.startsWith('/api/plans/')) { const dir = pathname.slice(11); if (!validDir(dir)) { res.writeHead(404).end(); return; } return json(detail(dir)); }
      if (pathname === '/') return file(res, assets, 'index.html');
      if (pathname.startsWith('/p/')) { if (!validDir(pathname.slice(3))) { res.writeHead(404).end(); return; } return file(res, assets, 'project.html'); }
      if (pathname.startsWith('/assets/')) return file(res, assets, pathname.slice(8));
      if (pathname.startsWith('/files/')) { const rest = pathname.slice(7), slash = rest.indexOf('/'), dir = rest.slice(0, slash); if (slash < 0 || !validDir(dir)) { res.writeHead(404).end(); return; } return file(res, path.join(plans, dir), rest.slice(slash + 1), true); }
      res.writeHead(404).end();
    } catch { if (!res.headersSent) res.writeHead(500).end(); else res.destroy(); }
  });
  const listen = port => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(null); }); });
  try { await listen(portArg === undefined ? (old?.port ?? 0) : Number(portArg)); } catch (error) { if (error.code !== 'EADDRINUSE') throw error; await listen(0); }
  const current = { root, port: server.address().port, pid: process.pid, startedAt: new Date().toISOString() };
  const tmp = `${stateFile}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(current)); fs.renameSync(tmp, stateFile); unlock(); output(current, false);
  const watcher = fs.watch(plans, { recursive: true }, (_event, filename) => {
    if (!filename) return; const dir = String(filename).split(/[\\/]/)[0]; if (!dir || dir.startsWith('.')) return;
    clearTimeout(timers.get(dir)); timers.set(dir, setTimeout(() => { timers.delete(dir); for (const client of clients) client.write(`event: change\ndata: ${JSON.stringify({ dir })}\n\n`); }, 200));
  });
  const ping = setInterval(() => { for (const client of clients) client.write(': ping\n\n'); }, 30000);
  const shutdown = () => {
    if (closing) return; closing = true; watcher.close(); clearInterval(ping); clearInterval(idleTimer); for (const timer of timers.values()) clearTimeout(timer); for (const client of clients) client.end();
    try { if (state()?.pid === process.pid) fs.unlinkSync(stateFile); } catch {}
    server.close(() => process.exit(0));
  };
  const idleTimer = setInterval(() => { if (!clients.size && Date.now() - lastRequest > idle * 60000) shutdown(); }, Math.min(60000, idle * 30000));
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
} catch (error) { unlock(); console.error(error); process.exit(1); }
