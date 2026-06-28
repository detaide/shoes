/* ═══════════════════════════════════════════
   聊天相关类型 — 前后端共享
   ═══════════════════════════════════════════ */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 用户上传的参考图(本地 dataURL) */
  attachedImages?: string[];
  /** 生成的图片文件名列表 */
  generatedImages?: string[];
  timestamp: number;
}
