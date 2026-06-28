/* ═══════════════════════════════════════════
   配置类型 — 前后端共享
   - apiKey 不下发明文,仅返回 hasApiKey 标识
   - systemPrompt 完全由后端配置,不暴露给前端
   ═══════════════════════════════════════════ */

export interface AppConfig {
  qwen: {
    baseUrl: string;
  };
  multimodalModel: string;
  imageModel: string;
  /** 密钥是否已在服务端配置(前端不接收明文) */
  hasApiKey: boolean;
}

/** 配置更新补丁 — 前端可提交(不含提示词) */
export interface AppConfigPatch {
  qwen?: {
    baseUrl?: string;
    apiKey?: string;
  };
  multimodalModel?: string;
  imageModel?: string;
}
