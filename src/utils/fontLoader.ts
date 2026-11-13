import { toMediaUrl } from '../shared/types';

const loadedFontKeys = new Map<string, Promise<void>>();

/**
 * Loads a custom .ttf / .otf font from satsang-media:// via the browser FontFace API
 * so both Window 1 (preview & studio) and Window 2 (Audience Output) render it identically.
 */
export async function ensureCustomFontLoaded(
  fontFamily: string,
  fontAssetPath?: string,
): Promise<void> {
  if (!fontAssetPath) return;
  const cleanFamily = fontFamily.replace(/^["']|["']$/g, '').split(',')[0].trim();
  if (!cleanFamily) return;

  const cacheKey = `${cleanFamily}::${fontAssetPath}`;
  if (loadedFontKeys.has(cacheKey)) {
    return loadedFontKeys.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const url = toMediaUrl(fontAssetPath);
      const face = new FontFace(cleanFamily, `url("${url}")`);
      const loaded = await face.load();
      document.fonts.add(loaded);
      await document.fonts.ready;
    } catch (err) {
      console.error('Failed to load custom FontFace:', cleanFamily, fontAssetPath, err);
    }
  })();

  loadedFontKeys.set(cacheKey, promise);
  return promise;
}

