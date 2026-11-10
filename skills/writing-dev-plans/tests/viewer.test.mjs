// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/plan-viewer.mjs', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname }, res => { let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body })); });
    req.on('error', reject); req.end();
  });
}
function launch(root, args = []) {
  const child = spawn(process.execPath, [script, ...args, '--no-open'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  const result = new Promise((resolve, reject) => {
    child.stdout.on('data', c => { out += c; const newline = out.indexOf('\n'); if (newline >= 0) { try { resolve(JSON.parse(out.slice(0, newline))); } catch (e) { reject(e); } } });
    child.stderr.on('data', c => err += c);
    child.on('error', reject); child.on('exit', code => { if (!out.includes('\n')) reject(new Error(`viewer exited ${code}: ${err}`)); });
  });
  return { child, result };
}
async function stop(pid) {
  if (!pid) return;
  try { process.kill(pid, 'SIGTERM'); } catch { return; }
  for (let i = 0; i < 50; i++) { try { process.kill(pid, 0); } catch { return; } await sleep(50); }
  try { process.kill(pid, 'SIGKILL'); } catch {}
}
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-viewer-'));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(path.join(root, '.plans'));
  for (const dir of ['v2-en', 'v2-zh']) fs.cpSync(path.join(fixtures, dir), path.join(root, '.plans', dir), { recursive: true });
  return root;
}
function portOf(result) { return Number(new URL(result.url).port); }

test('routes, containment and live events', async () => {
  const root = setup(); let viewer;
  try {
    viewer = launch(root, ['--foreground', '--port', '0']); const result = await viewer.result; const port = portOf(result);
    assert.equal(result.reused, false);
    const plans = JSON.parse((await request(port, '/api/plans')).body);
    assert.deepEqual(plans.map(p => p.dir), ['v2-zh', 'v2-en']);
    const detail = JSON.parse((await request(port, '/api/plans/v2-en')).body);
    assert.ok(Array.isArray(detail.lint)); assert.ok(detail.runs.length); assert.ok(Array.isArray(detail.visualStatus));
    assert.equal((await request(port, '/p/nope')).status, 404);
    const plan = await request(port, '/files/v2-en/plan.md'); assert.equal(plan.status, 200); assert.equal(plan.headers['content-security-policy'], 'sandbox allow-scripts allow-popups');
    fs.writeFileSync(path.join(root, '.plans', 'outside'), 'private');
    fs.mkdirSync(path.join(root, '.plans', 'v2-en-evil')); fs.writeFileSync(path.join(root, '.plans', 'v2-en-evil', 'secret'), 'private');
    fs.symlinkSync(path.join(root, '.plans', 'outside'), path.join(root, '.plans', 'v2-en', 'escape'));
    fs.symlinkSync(path.join(root, '.plans', 'v2-en-evil', 'secret'), path.join(root, '.plans', 'v2-en', 'prefix'));
    for (const url of ['/files/v2-en/../outside', '/files/v2-en/%2e%2e/outside', '/files/v2-en/%zz', '/files/v2-en/escape', '/files/v2-en/prefix']) assert.notEqual((await request(port, url)).status, 200, url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { req.destroy(); reject(new Error('SSE change timed out')); }, 1000);
      const req = http.get({ host: '127.0.0.1', port, path: '/events' }, res => {
        let body = '', changed = false; res.on('data', chunk => { body += chunk; if (body.includes('event: hello') && !changed) { changed = true; fs.appendFileSync(path.join(root, '.plans', 'v2-en', 'impl.md'), '\n'); } if (body.includes('event: change\ndata: {"dir":"v2-en"}')) { clearTimeout(timeout); req.destroy(); resolve(null); } });
      }); req.on('error', e => { clearTimeout(timeout); reject(e); });
    });
  } finally { await stop(viewer?.child.pid); fs.rmSync(root, { recursive: true, force: true }); }
});

test('detached startup reuses a single server and recovers stale locks', async () => {
  const root = setup(); const pids = new Set(), children = [];
  try {
    const lock = path.join(root, '.plans', '.viewer.lock'); fs.writeFileSync(lock, ''); const old = new Date(Date.now() - 15000); fs.utimesSync(lock, old, old);
    const a = launch(root, ['--port', '0']), b = launch(root, ['--port', '0']); children.push(a.child, b.child);
    const results = await Promise.all([a.result, b.result].map(p => p.then(result => { pids.add(result.pid); return result; })));
    assert.equal(pids.size, 1);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.plans', '.viewer.json'), 'utf8')); assert.equal(state.pid, results[0].pid); process.kill(state.pid, 0);
    const again = await launch(root, []).result; pids.add(again.pid); assert.equal(again.reused, true); assert.equal(again.pid, state.pid);
  } finally { for (const child of children) await stop(child.pid); try { pids.add(JSON.parse(fs.readFileSync(path.join(root, '.plans', '.viewer.json'), 'utf8')).pid); } catch {} for (const pid of pids) await stop(pid); fs.rmSync(root, { recursive: true, force: true }); }
});

test('idle server exits and removes its state', async () => {
  const root = setup(); let viewer;
  try {
    viewer = launch(root, ['--foreground', '--port', '0', '--idle-minutes', '0.02']);
    const exited = new Promise(resolve => viewer.child.on('exit', (code, signal) => resolve({ code, signal })));
    await viewer.result;
    let timeout; const result = await Promise.race([exited, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('idle timeout')), 10000); })]).finally(() => clearTimeout(timeout));
    assert.deepEqual(result, { code: 0, signal: null }); assert.equal(fs.existsSync(path.join(root, '.plans', '.viewer.json')), false);
  } finally { await stop(viewer?.child.pid); fs.rmSync(root, { recursive: true, force: true }); }
});
