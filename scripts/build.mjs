#!/usr/bin/env node
/* ═══════════════════════════════════════════
   shoes 编译/部署脚本
   用法:
     node scripts/build.mjs install  — 安装前后端依赖
     node scripts/build.mjs build    — 编译前后端
     node scripts/build.mjs deploy   — 编译 + 打包到 dist/(可部署)
     node scripts/build.mjs clean    — 清理各 dist
   ═══════════════════════════════════════════ */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.join(ROOT, 'client');
const SERVER = path.join(ROOT, 'server');
const OUT = path.join(ROOT, 'dist');
const cmd = process.argv[2] || 'build';

function run(line, cwd) {
  console.log(`\n$ ${line}   (${path.relative(ROOT, cwd)})`);
  execSync(line, { cwd, stdio: 'inherit' });
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyAll(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.vite') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyAll(s, d);
    else fs.copyFileSync(s, d);
  }
}

function installAll() {
  console.log('=== 安装依赖 ===');
  run('npm install', CLIENT);
  run('npm install', SERVER);
}

function buildAll() {
  console.log('=== 编译前端 ===');
  run('npm run build', CLIENT);
  console.log('=== 编译后端 ===');
  run('npm run build', SERVER);
}

function cleanAll() {
  console.log('=== 清理 ===');
  rmrf(path.join(CLIENT, 'dist'));
  rmrf(path.join(SERVER, 'dist'));
  rmrf(OUT);
  console.log('已清理 client/dist、server/dist、dist');
}

function deploy() {
  buildAll();
  console.log('\n=== 打包部署产物到 dist/ ===');
  rmrf(OUT);

  // 后端:编译产物 + package.json + .env.example
  copyAll(path.join(SERVER, 'dist'), path.join(OUT, 'server', 'dist'));
  fs.copyFileSync(path.join(SERVER, 'package.json'), path.join(OUT, 'server', 'package.json'));
  if (fs.existsSync(path.join(SERVER, '.env.example'))) {
    fs.copyFileSync(path.join(SERVER, '.env.example'), path.join(OUT, 'server', '.env.example'));
  }

  // 前端:静态产物
  copyAll(path.join(CLIENT, 'dist'), path.join(OUT, 'client'));

  // 说明
  fs.writeFileSync(
    path.join(OUT, 'README.md'),
    `# shoes 部署产物

## 后端
\`\`\`bash
cd server
cp .env.example .env   # 填入 DASHSCOPE_API_KEY 等
npm install --omit=dev
node dist/index.js      # 默认 http://localhost:3001
\`\`\`

## 前端
\`client/\` 为静态站点(Vite 已构建)。
- 开发:由 Vite 代理 /api → 后端
- 生产:用任意静态服务器托管 client/,或把 client/ 放到后端静态目录;
  生产构建时前端用相对 /api,需保证前后端同源或反向代理转发 /api 到后端。

## 启动顺序
先后端(3001),再前端。
`,
  );

  console.log(`\n✔ 部署产物已生成:${path.relative(ROOT, OUT)}/`);
  console.log('  server/  — 后端(需 npm install --omit=dev 后 node dist/index.js)');
  console.log('  client/  — 前端静态站点');
}

switch (cmd) {
  case 'install': installAll(); break;
  case 'build': buildAll(); break;
  case 'deploy': deploy(); break;
  case 'clean': cleanAll(); break;
  default:
    console.error(`未知命令:${cmd}\n可用:install | build | deploy | clean`);
    process.exit(1);
}
