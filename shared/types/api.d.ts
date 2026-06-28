/* ═══════════════════════════════════════════
   API 响应信封 — 前后端共用,对齐原 bridge 结构
   ═══════════════════════════════════════════ */

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
