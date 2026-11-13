export type BackgroundType = 'image' | 'video' | 'gradient';
export type MusicAnimationStyle = 'lotus-pulse' | 'sacred-waves' | 'aurora-orb' | 'none';

export interface SyncedLine {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
}

export interface StyleConfig {
  backgroundType: BackgroundType;
  backgroundSrc: string;
  backdropDim: number; // 0.0 to 0.85
  fontFamily: string;
  fontAssetPath?: string; // Relative path under userData/satsang-presenter for custom .ttf/.otf
  fontSizeVw: number;
  fontWeight: string;
  textColor: string;
  textShadow: string;
  musicAnimation?: MusicAnimationStyle;
}

export interface SongPackage {
  id: string;
  title: string;
  audioPath: string; // Relative path under userData/satsang-presenter, e.g. songs/<id>/audio.mp3
  duration: number;
  rawLyrics: string;
  syncedLines: SyncedLine[]; // Strictly sorted by startTime ascending
  styleConfig: StyleConfig;
  globalOffsetSeconds?: number;
  updatedAt?: string;
}

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
  scaleFactor: number;
}

export interface PresentationPayload {
  isPresenting: boolean;
  isBlank: boolean;
  isMusicInterlude?: boolean;
  songId: string | null;
  songTitle: string;
  activeLine: SyncedLine | null;
  styleConfig: StyleConfig;
  isPreviewFallback: boolean;
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'font';
  relativePath: string;
  fontFamily?: string;
}

export type GeminiAlignModel =
  | 'gemini-3.8-flash'
  | 'gemini-3.8-pro'
  | 'gemini-3.8-flash-lite'
  | (string & {});

export function normalizeGeminiModel(model?: string): string {
  if (
    !model ||
    model === 'gemini-2.5-flash' ||
    model === 'gemini-2.0-flash' ||
    model === 'gemini-1.5-flash'
  ) {
    return 'gemini-3.8-flash';
  }
  if (model === 'gemini-2.5-pro' || model === 'gemini-1.5-pro') {
    return 'gemini-3.8-pro';
  }
  return model;
}

export interface AppSettings {
  audioSinkId: string;
  preferredDisplayId: number | null;
  elevenLabsApiKey: string;
  localAlignerCommand: string;
  geminiApiKey: string;
  geminiModel: GeminiAlignModel;
}

export interface AlignedWord {
  word: string;
  start: number;
  end: number;
}

export interface GeminiAlignedLine {
  index: number;
  startSec: number;
  endSec: number;
}

export interface GradientPreset {
  id: string;
  name: string;
  css: string;
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: 'sacred-amber',
    name: 'Sacred Amber Dusk',
    css: 'radial-gradient(circle at 50% 35%, #3b2310 0%, #170e07 52%, #070506 100%)',
  },
  {
    id: 'deep-indigo',
    name: 'Midnight Meditation',
    css: 'radial-gradient(circle at 50% 30%, #1c244b 0%, #0d1229 55%, #050711 100%)',
  },
  {
    id: 'lotus-crimson',
    name: 'Lotus Ember',
    css: 'radial-gradient(circle at 50% 40%, #431420 0%, #1d0911 55%, #080407 100%)',
  },
  {
    id: 'forest-sanctum',
    name: 'Emerald Sanctum',
    css: 'radial-gradient(circle at 50% 35%, #11342c 0%, #091b18 55%, #040a0a 100%)',
  },
  {
    id: 'pure-obsidian',
    name: 'Pure Obsidian Stage',
    css: 'linear-gradient(180deg, #0b0d12 0%, #040507 100%)',
  },
  {
    id: 'golden-horizon',
    name: 'Golden Horizon',
    css: 'linear-gradient(160deg, #1b1528 0%, #2d1b18 45%, #09070a 100%)',
  },
];

export const BUILTIN_FONTS: Array<{ label: string; value: string }> = [
  { label: 'Georgia Serif (Classic Stage)', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Inter / System Sans (Crisp LED)', value: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif' },
  { label: 'Palatino / Book Antiqua', value: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { label: 'Noto Sans / Clean Devanagari', value: '"Noto Sans", "Nirmala UI", "Kohinoor Devanagari", system-ui, sans-serif' },
  { label: 'Arial / Broadcast Bold', value: '"Arial", "Helvetica Neue", sans-serif' },
];

export const TEXT_COLOR_PRESETS: Array<{ label: string; color: string; shadow: string }> = [
  {
    label: 'Warm Ivory',
    color: '#FFFDF7',
    shadow: '0 4px 24px rgba(0, 0, 0, 0.92), 0 2px 6px rgba(0, 0, 0, 0.95)',
  },
  {
    label: 'Sacred Gold',
    color: '#FCD34D',
    shadow: '0 4px 28px rgba(0, 0, 0, 0.95), 0 2px 8px rgba(0, 0, 0, 0.98)',
  },
  {
    label: 'Pure White',
    color: '#FFFFFF',
    shadow: '0 4px 24px rgba(0, 0, 0, 0.95), 0 0 12px rgba(0, 0, 0, 0.9)',
  },
  {
    label: 'Soft Sky',
    color: '#E0F2FE',
    shadow: '0 4px 24px rgba(0, 0, 0, 0.92), 0 2px 6px rgba(0, 0, 0, 0.95)',
  },
];

export const DEFAULT_STYLE_CONFIG: StyleConfig = {
  backgroundType: 'gradient',
  backgroundSrc: GRADIENT_PRESETS[0].css,
  backdropDim: 0.25,
  fontFamily: BUILTIN_FONTS[0].value,
  fontSizeVw: 4.4,
  fontWeight: '700',
  textColor: TEXT_COLOR_PRESETS[0].color,
  textShadow: TEXT_COLOR_PRESETS[0].shadow,
  musicAnimation: 'lotus-pulse',
};

export function toMediaUrl(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  // Encode each path segment safely so spaces/unicode filenames work cleanly
  const encoded = normalized.split('/').map(encodeURIComponent).join('/');
  return `satsang-media://local/${encoded}`;
}

