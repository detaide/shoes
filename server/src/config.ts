/* ═══════════════════════════════════════════
   环境配置 — 从 .env 加载
   DATA_DIR 默认相对 server 目录的 ../data(shoes/data)
   ═══════════════════════════════════════════ */

import 'dotenv/config';
import path from 'node:path';

export const env = {
  port: Number(process.env.PORT ?? 3001),
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), '..', 'data'),
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY ?? '',
  dashscopeBaseUrl:
    process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com',
} as const;
