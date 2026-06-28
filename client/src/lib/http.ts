/* ═══════════════════════════════════════════
   HTTP 客户端 — 替代原 renderer/bridge.ts
   行为对齐 bridge.invoke:解包信封,失败抛错
   ═══════════════════════════════════════════ */

import type { ApiEnvelope } from '@shared/types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  const resp = await fetch(`/api${url}`, init);
  const envelope: ApiEnvelope<T> = await resp.json().catch(() => ({
    success: false,
    error: `非 JSON 响应 (HTTP ${resp.status})`,
  }));

  if (!envelope.success) {
    throw new ApiError(envelope.error ?? '未知服务端错误', resp.status);
  }
  return envelope.data as T;
}

export const http = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};
