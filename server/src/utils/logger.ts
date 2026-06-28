/* ═══════════════════════════════════════════
   统一日志工具 — 带时间戳/级别/命名空间
   自动脱敏:base64/长串截断,密钥不输出
   ═══════════════════════════════════════════ */

type Level = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function stamp(): string {
  return new Date().toISOString();
}

/** 把超大/敏感字段裁剪为可读预览 */
function preview(value: unknown, max = 80): string {
  if (value === null || value === undefined) return String(value);
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s.startsWith('data:image')) return `<base64 ${s.length} chars>`;
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(${s.length})`;
}

function out(level: Level, tag: string, msg: string, extra?: unknown) {
  const head = `[${stamp()}] [${level}] [${tag}] ${msg}`;
  if (extra !== undefined) {
    const safe = typeof extra === 'string' ? preview(extra) : extra;
    console.log(head, safe);
  } else {
    console.log(head);
  }
}

export const logger = {
  info: (tag: string, msg: string, extra?: unknown) => out('INFO', tag, msg, extra),
  warn: (tag: string, msg: string, extra?: unknown) => out('WARN', tag, msg, extra),
  error: (tag: string, msg: string, extra?: unknown) => out('ERROR', tag, msg, extra),
  debug: (tag: string, msg: string, extra?: unknown) => out('DEBUG', tag, msg, extra),
  /** 显式预览长文本(如 prompt/回复) */
  pv: preview,
};
