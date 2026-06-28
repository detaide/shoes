import { http } from '@/lib/http';
import type { AppConfig, AppConfigPatch } from '@shared/types';

/* 替代原 bridge.config 命名空间 */

export function getConfig() {
  return http.get<AppConfig>('/config');
}

export function updateConfig(patch: AppConfigPatch) {
  return http.patch<AppConfig>('/config', patch);
}

export function resetConfig() {
  return http.post<AppConfig>('/config/reset');
}
