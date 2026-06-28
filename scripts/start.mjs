#!/usr/bin/env node
/* ═══════════════════════════════════════════
   shoes — 同时启动前后端开发服务
   用法: node scripts/start.mjs        (或 npm start / npm run dev)
   - 后端: server/  npm run dev  → http://localhost:3001
   - 前端: client/  npm run dev  → http://localhost:5173 (代理 /api → 3001)
   Ctrl+C 同步关闭两者。
   ═══════════════════════════════════════════ */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  { name: 'server', cwd: path.join(ROOT, 'server'), cmd: 'npm', args: ['run', 'dev'], color: 36 },
  { name: 'client', cwd: path.join(ROOT, 'client'), cmd: 'npm', args: ['run', 'dev'], color: 35 },
];

const C = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const stamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

function start(t) {
  const proc = spawn(t.cmd, t.args, { cwd: t.cwd, shell: true });
  const tag = C(t.color, `[${t.name}]`);

  const pipe = (stream, prefix) => {
    let buf = '';
    const write = (data) => {
      buf += data.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        process.stdout.write(`${C(90, stamp())} ${tag} ${line}\n`);
      }
    };
    stream.on('data', write);
  };
  pipe(proc.stdout, tag);
  pipe(proc.stderr, tag);

  proc.on('exit', (code, sig) => {
    process.stdout.write(`${C(90, stamp())} ${tag} ${C(31, `已退出 code=${code} sig=${sig}`)}\n`);
    shutdown(0);
  });
  return proc;
}

const procs = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) {
    try {
      // Windows 下无进程组,直接 kill;非 Windows 杀整个树
      if (process.platform === 'win32') {
        try { process.kill(p.pid); } catch {}
        // 进一步清理可能残留的子进程(npm → tsx/vite)
        try { spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { shell: true }); } catch {}
      } else {
        try { process.kill(-p.pid, 'SIGTERM'); } catch {}
      }
    } catch {}
  }
  process.exit(code ?? 0);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => shutdown(0));

console.log(`${C(32, '▶ 启动 shoes 前后端开发服务')}  (Ctrl+C 退出)\n`);
for (const t of TARGETS) procs.push(start(t));
