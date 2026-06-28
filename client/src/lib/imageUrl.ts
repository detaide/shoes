/* ═══════════════════════════════════════════
   图片 URL 工具 — 统一替换原 file:// 协议
   生成图以文件名存于服务端,经 /api/images 访问
   ═══════════════════════════════════════════ */

/** 文件名 → 可访问的服务端图片 URL */
export function toImageUrl(name: string): string {
  if (!name) return '';
  // 兼容已经带协议前缀的 dataURL / http(s) URL
  if (/^(data:|https?:|blob:|file:)/i.test(name)) return name;
  return `/api/images/${encodeURIComponent(name)}`;
}

/** 触发下载(替代原 bridge.file.saveImage) */
export function downloadImage(name: string): void {
  const a = document.createElement('a');
  a.href = `/api/images/${encodeURIComponent(name)}?download=1`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 任意图片源 → dataURL(用于把气泡内的图片转入输入框作参考图)
 * - dataURL 直接返回
 * - 文件名/http URL 先 fetch 再转 base64
 */
export async function srcToDataURL(src: string): Promise<string> {
  if (/^data:/i.test(src)) return src;
  const resp = await fetch(toImageUrl(src));
  if (!resp.ok) throw new Error('图片加载失败');
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
