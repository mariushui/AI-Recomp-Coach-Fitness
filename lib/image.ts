// Verkleinert ein Foto im Browser, bevor es an parse-log geht.
// Spart Datenvolumen auf dem iPhone und hält die KI-Anfrage klein. HEIC wandelt Safari beim Zeichnen in JPEG um.

import type { ImageInput } from '../supabase/functions/_shared/image';

export const MAX_SIDE = 1280;

/** Zielgröße mit gleichem Seitenverhältnis, längste Seite höchstens maxSide. Nie vergrößern. */
export function fitSize(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** "data:image/jpeg;base64,AAAA" → { mime, data } */
export function splitDataUrl(url: string): ImageInput | null {
  const m = url.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  return m ? { mime: m[1] as ImageInput['mime'], data: m[2] } : null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Foto konnte nicht gelesen werden'));
    };
    img.src = url;
  });
}

export interface PreparedImage {
  image: ImageInput;
  previewUrl: string; // Data-URL für die Vorschau
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const img = await loadImage(file);
  const { width, height } = fitSize(img.naturalWidth, img.naturalHeight);
  if (!width || !height) throw new Error('Foto hat keine Größe');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Foto konnte nicht verarbeitet werden');
  ctx.drawImage(img, 0, 0, width, height);
  const previewUrl = canvas.toDataURL('image/jpeg', 0.8);
  const image = splitDataUrl(previewUrl);
  if (!image) throw new Error('Foto konnte nicht umgewandelt werden');
  return { image, previewUrl };
}
