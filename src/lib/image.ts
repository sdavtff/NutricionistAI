// Utilitários de imagem: carregamento, recorte e compressão no próprio dispositivo.

export interface CropRect {
  x: number; // 0..1 (fração da largura)
  y: number;
  w: number;
  h: number;
}

export function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    img.onload = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem. Use JPG, PNG ou WEBP.'));
    img.src = url;
  });
}

/** Recorta (opcional) e redimensiona para no máximo `maxSide` px, gerando JPEG comprimido. */
export async function processImage(
  file: Blob,
  opts: { crop?: CropRect; maxSide?: number; quality?: number } = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('O arquivo selecionado não é uma imagem.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Imagem muito grande (máx. 25 MB).');
  const img = await loadImage(file);
  const crop = opts.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(crop.x * img.naturalWidth);
  const sy = Math.round(crop.y * img.naturalHeight);
  const sw = Math.max(1, Math.round(crop.w * img.naturalWidth));
  const sh = Math.max(1, Math.round(crop.h * img.naturalHeight));
  const maxSide = opts.maxSide ?? 1280;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const width = Math.round(sw * scale);
  const height = Math.round(sh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não suporta o processamento de imagens.');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', opts.quality ?? 0.82));
  if (!blob) throw new Error('Falha ao comprimir a imagem.');
  return { blob, width, height };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
