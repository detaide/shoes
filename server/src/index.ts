import express from 'express';
import cors from 'cors';
import { env } from './config';
import { errorHandler } from './middleware/error';
import { logger } from './utils/logger';
import { metaRouter } from './routes/meta.routes';
import { configRouter } from './routes/config.routes';
import { imageRouter } from './routes/image.routes';
import { sessionRouter } from './routes/session.routes';
import { chatRouter } from './routes/chat.routes';
import { storage } from './services/storage.service';

const app = express();

app.use(cors());
app.use(express.json({ limit: '25mb' })); // 参考图 base64 可能较大

/* 请求级访问日志 */
app.use((req, _res, next) => {
  logger.info('http', `${req.method} ${req.url}`);
  next();
});

/* 健康检查 */
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { ok: true, ts: Date.now() } });
});

/* 业务路由 */
app.use('/api/meta', metaRouter);
app.use('/api/config', configRouter);
app.use('/api/images', imageRouter);
app.use('/api/sessions', sessionRouter);
app.use('/api/chat', chatRouter);

/* 404 */
app.use((req, res) => {
  logger.warn('http', `404 ${req.method} ${req.url}`);
  res.status(404).json({ success: false, error: 'Not Found' });
});

/* 错误处理 */
app.use(errorHandler);

storage.ensureDirs();

app.listen(env.port, () => {
  logger.info('server', `shoes-server 启动 → http://localhost:${env.port}`);
  logger.info('server', `数据目录: ${env.dataDir}`);
  logger.info('server', `API Key 来源: ${env.dashscopeApiKey ? '.env' : '(未在 .env 配置,使用 config.json)'}`);
});
