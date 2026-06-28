/* ═══════════════════════════════════════════
   localStorage 安全封装 — 配置缓存/离线回退
   带命名空间前缀 + 异常吞掉(SSR/隐私模式)
   ═══════════════════════════════════════════ */

const PREFIX = 'shoes:';

export const localStore = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* 配额满或隐私模式,忽略 */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};
