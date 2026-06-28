/* ═══════════════════════════════════════════
   useSettings — 配置数据逻辑
   策略:后端为权威源,localStorage 作缓存
   - 启动先读缓存(瞬时渲染,避免空表闪烁)
   - 再拉后端配置覆盖(后端为准)
   - 保存/重置成功后回写缓存
   注:apiKey 永不入缓存(安全)
   ═══════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import type { AppConfig, AppConfigPatch } from '@shared/types';
import { getConfig, updateConfig, resetConfig } from './configApi';
import { localStore } from '@/lib/storage';

export interface SettingsForm {
  baseUrl: string;
  apiKey: string;
  multimodalModel: string;
  imageModel: string;
  hasApiKey: boolean;
}

const CACHE_KEY = 'settings';

const EMPTY: SettingsForm = {
  baseUrl: 'https://dashscope.aliyuncs.com',
  apiKey: '',
  multimodalModel: 'qwen3.6-plus',
  imageModel: 'qwen-image-2.0-pro-2026-04-22',
  hasApiKey: false,
};

function fromConfig(cfg: AppConfig): SettingsForm {
  return {
    baseUrl: cfg.qwen.baseUrl,
    apiKey: '',
    multimodalModel: cfg.multimodalModel,
    imageModel: cfg.imageModel,
    hasApiKey: cfg.hasApiKey,
  };
}

/** 写入缓存(剔除 apiKey) */
function cacheForm(form: SettingsForm): void {
  localStore.set<SettingsForm>(CACHE_KEY, { ...form, apiKey: '' });
}

export function useSettings() {
  /* 1. 启动:先用缓存瞬时渲染 */
  const [form, setForm] = useState<SettingsForm>(() =>
    localStore.get<SettingsForm>(CACHE_KEY, EMPTY),
  );
  const [loading, setLoading] = useState(true);

  /* 2. 拉后端权威配置覆盖缓存 */
  useEffect(() => {
    (async () => {
      try {
        const cfg = await getConfig();
        const next = fromConfig(cfg);
        setForm(next);
        cacheForm(next);
      } catch (err) {
        console.error('[Settings] 加载后端配置失败,沿用缓存', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patch = useCallback((p: Partial<SettingsForm>) => {
    setForm((prev) => ({ ...prev, ...p }));
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    const payload: AppConfigPatch = {
      qwen: { baseUrl: form.baseUrl },
      multimodalModel: form.multimodalModel,
      imageModel: form.imageModel,
    };
    if (form.apiKey.trim()) {
      payload.qwen!.apiKey = form.apiKey.trim();
    }
    const cfg = await updateConfig(payload);
    const next = { ...fromConfig(cfg), apiKey: '' };
    setForm(next);
    cacheForm(next); // 后端成功后回写缓存
    return true;
  }, [form]);

  const reset = useCallback(async (): Promise<boolean> => {
    const cfg = await resetConfig();
    const next = { ...fromConfig(cfg), apiKey: '' };
    setForm(next);
    cacheForm(next);
    return true;
  }, []);

  return { form, loading, patch, save, reset };
}
