import { describe, it, expect } from 'vitest';
import { checkImage, MAX_IMAGE_BASE64 } from '../supabase/functions/_shared/image';
import { fitSize, splitDataUrl } from '../lib/image';
import { buildSystemPrompt, buildUserPrompt } from '../supabase/functions/_shared/parse';
import { ENTRY_SOURCES } from '../supabase/functions/_shared/domain';

describe('checkImage', () => {
  it('akzeptiert JPEG mit gültigem Base64', () => {
    const r = checkImage({ mime: 'image/jpeg', data: 'QUJDRA==' });
    expect(r).toEqual({ ok: true, image: { mime: 'image/jpeg', data: 'QUJDRA==' } });
  });

  it('lehnt fehlende, falsche und zu große Bilder ab', () => {
    expect(checkImage(null).ok).toBe(false);
    expect(checkImage({ mime: 'image/gif', data: 'QUJD' }).ok).toBe(false);
    expect(checkImage({ mime: 'image/jpeg', data: '' }).ok).toBe(false);
    expect(checkImage({ mime: 'image/jpeg', data: 'data:image/jpeg;base64,QUJD' }).ok).toBe(false);
    expect(checkImage({ mime: 'image/png', data: 'A'.repeat(MAX_IMAGE_BASE64 + 1) }).ok).toBe(false);
  });
});

describe('fitSize', () => {
  it('verkleinert auf 1280 px an der längsten Seite', () => {
    expect(fitSize(4032, 3024)).toEqual({ width: 1280, height: 960 });
    expect(fitSize(3024, 4032)).toEqual({ width: 960, height: 1280 });
  });

  it('vergrößert kleine Bilder nicht', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitSize(0, 600)).toEqual({ width: 0, height: 0 });
  });
});

describe('splitDataUrl', () => {
  it('trennt Typ und Daten', () => {
    expect(splitDataUrl('data:image/jpeg;base64,QUJD')).toEqual({ mime: 'image/jpeg', data: 'QUJD' });
    expect(splitDataUrl('data:text/plain;base64,QUJD')).toBeNull();
  });
});

describe('Prompt für Essensfotos', () => {
  it('nennt den Fototext oder sagt, dass keiner da ist', () => {
    const NOW = '2026-11-03T13:00:00+01:00';
    expect(buildUserPrompt('250 g Reis', NOW, 'Europe/Berlin', true)).toContain('Text zum Foto:\n250 g Reis');
    expect(buildUserPrompt('', NOW, 'Europe/Berlin', true)).toContain('Kein Text zum Foto.');
    expect(buildUserPrompt('Tennis', NOW, 'Europe/Berlin')).toContain('Notiz:\nTennis');
  });

  it('enthält die Regeln für Fotos', () => {
    expect(buildSystemPrompt()).toContain('Foto einer Mahlzeit');
  });

  it('kennt die Quelle photo', () => {
    expect(ENTRY_SOURCES).toContain('photo');
  });
});
