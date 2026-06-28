/* 浏览器剪贴板 — 替代 Electron clipboard.writeImage */

/** 复制图片到剪贴板(通过 URL 拉取 blob) */
export async function copyImageToClipboard(url: string): Promise<void> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const type = blob.type || 'image/png';
    await navigator.clipboard.write([
      new ClipboardItem({ [type]: blob }),
    ]);
  } catch (err) {
    throw new Error('复制失败:浏览器可能不支持剪贴板图片写入');
  }
}

/** 文件 → dataURL */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
