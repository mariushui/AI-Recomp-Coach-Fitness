// Prüft ein Essensfoto, bevor es an die KI geht. Reines TypeScript, getestet in tests/image.test.ts.
// Die App verkleinert Fotos vorher auf höchstens 1280 px (lib/image.ts). Das Foto wird nirgends gespeichert.

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

/** Obergrenze für die Base64-Länge. Etwa 3 MB Bild, ein verkleinertes Foto hat meist 150 bis 400 KB. */
export const MAX_IMAGE_BASE64 = 4_000_000;

export interface ImageInput {
  mime: ImageMimeType;
  data: string; // Base64 ohne "data:"-Präfix
}

export type ImageCheck = { ok: true; image: ImageInput } | { ok: false; error: string };

export function checkImage(raw: unknown): ImageCheck {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Bild fehlt' };
  const { mime, data } = raw as { mime?: unknown; data?: unknown };
  if (typeof mime !== 'string' || !(IMAGE_MIME_TYPES as readonly string[]).includes(mime)) {
    return { ok: false, error: 'Bildformat nicht unterstützt (JPEG, PNG oder WebP)' };
  }
  if (typeof data !== 'string' || data.length === 0) return { ok: false, error: 'Bild ist leer' };
  if (data.length > MAX_IMAGE_BASE64) return { ok: false, error: 'Bild ist zu groß' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, error: 'Bilddaten sind beschädigt' };
  return { ok: true, image: { mime: mime as ImageMimeType, data } };
}
