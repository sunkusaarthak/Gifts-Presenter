import { create } from 'zustand';
import { normalizeSyncedLines } from '../shared/binarySearch';
import type {
  AppSettings,
  DisplayInfo,
  MediaAsset,
  SongPackage,
  StyleConfig,
  SyncedLine,
} from '../shared/types';
import { DEFAULT_STYLE_CONFIG, normalizeGeminiModel } from '../shared/types';
import type { CreateSongInput } from '../../electron/preload';

export type ConsoleMode = 'studio' | 'stage';

interface PresenterState {
  songs: SongPackage[];
  activeSongId: string | null;
  mode: ConsoleMode;
  displays: DisplayInfo[];
  assets: MediaAsset[];
  settings: AppSettings;
  isPresenting: boolean;
  isPreviewFallback: boolean;
  isBlank: boolean;
  isPlaying: boolean;
  currentTime: number;
  activeLineIndex: number;
  isLoading: boolean;
  toast: { type: 'info' | 'error' | 'success'; text: string } | null;

  initialize: () => Promise<() => void>;
  setMode: (mode: ConsoleMode) => void;
  selectSong: (songId: string) => void;
  createSong: (input: CreateSongInput) => Promise<SongPackage>;
  createDemoSong: () => Promise<SongPackage>;
  saveSong: (song: SongPackage) => Promise<SongPackage>;
  flushSaveActiveSong: (showConfirmation?: boolean) => Promise<void>;
  deleteSong: (songId: string) => Promise<void>;
  updateSyncedLines: (lines: SyncedLine[], rawLyrics?: string) => Promise<void>;
  updateStyleConfig: (patch: Partial<StyleConfig>) => Promise<void>;
  updateGlobalOffset: (offsetSeconds: number) => Promise<void>;
  importBundle: () => Promise<void>;
  exportBundle: (songId: string) => Promise<void>;
  exportProject: () => Promise<void>;
  importProject: () => Promise<void>;
  refreshAssets: () => Promise<void>;
  importBackgroundAsset: () => Promise<MediaAsset | null>;
  importFontAsset: () => Promise<MediaAsset | null>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  setIsPresenting: (val: boolean, isPreviewFallback?: boolean) => void;
  setIsBlank: (val: boolean) => void;
  setPlaybackState: (patch: {
    isPlaying?: boolean;
    currentTime?: number;
    activeLineIndex?: number;
  }) => void;
  showToast: (text: string, type?: 'info' | 'error' | 'success') => void;
  clearToast: () => void;
}

let toastTimer: number | null = null;
let saveDebounceTimer: number | null = null;

export const usePresenterStore = create<PresenterState>((set, get) => ({
  songs: [],
  activeSongId: null,
  mode: 'studio',
  displays: [],
  assets: [],
  settings: {
    audioSinkId: '',
    preferredDisplayId: null,
    elevenLabsApiKey: '',
    localAlignerCommand: '',
    geminiApiKey: '',
    geminiModel: 'gemini-3.8-flash',
  },
  isPresenting: false,
  isPreviewFallback: false,
  isBlank: false,
  isPlaying: false,
  currentTime: 0,
  activeLineIndex: -1,
  isLoading: true,
  toast: null,

  showToast: (text, type = 'info') => {
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    set({ toast: { text, type } });
    toastTimer = window.setTimeout(() => {
      set({ toast: null });
      toastTimer = null;
    }, 4200);
  },

  clearToast: () => set({ toast: null }),

  initialize: async () => {
    set({ isLoading: true });
    try {
      const [songs, displays, assets, settings] = await Promise.all([
        window.satsangAPI.listSongs(),
        window.satsangAPI.getDisplays(),
        window.satsangAPI.listAssets(),
        window.satsangAPI.getSettings(),
      ]);

      set({
        songs,
        activeSongId: songs[0]?.id ?? null,
        displays,
        assets,
        settings: {
          ...settings,
          geminiModel: normalizeGeminiModel(settings.geminiModel),
        },
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      get().showToast(`Initialization failed: ${(err as Error).message}`, 'error');
    }

    const unsubDisplays = window.satsangAPI.onDisplaysChanged((displays) => {
      set({ displays });
    });

    const unsubClosed = window.satsangAPI.onPresentationClosed(() => {
      set({ isPresenting: false, isPreviewFallback: false });
    });

    return () => {
      unsubDisplays();
      unsubClosed();
    };
  },

  setMode: (mode) => {
    if (mode === 'stage') {
      get().flushSaveActiveSong(false).catch(() => {});
    }
    set({ mode });
  },

  selectSong: (songId) => {
    set({
      activeSongId: songId,
      isPlaying: false,
      currentTime: 0,
      activeLineIndex: -1,
    });
  },

  createSong: async (input) => {
    const created = await window.satsangAPI.createSong(input);
    set((s) => ({
      songs: [...s.songs, created].sort((a, b) => a.title.localeCompare(b.title)),
      activeSongId: created.id,
      currentTime: 0,
      activeLineIndex: -1,
      isPlaying: false,
    }));
    get().showToast(`Added "${created.title}" to offline library.`, 'success');
    return created;
  },

  createDemoSong: async () => {
    const demo = await window.satsangAPI.createDemoSong();
    set((s) => ({
      songs: [...s.songs, demo].sort((a, b) => a.title.localeCompare(b.title)),
      activeSongId: demo.id,
      currentTime: 0,
      activeLineIndex: -1,
      isPlaying: false,
    }));
    get().showToast('Created deterministic Satsang demo track.', 'success');
    return demo;
  },

  saveSong: async (song) => {
    const saved = await window.satsangAPI.saveSong(song);
    set((s) => ({
      songs: s.songs.map((item) => (item.id === saved.id ? saved : item)),
    }));
    return saved;
  },

  flushSaveActiveSong: async (showConfirmation = false) => {
    if (saveDebounceTimer !== null) {
      window.clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    const { songs, activeSongId } = get();
    const active = songs.find((s) => s.id === activeSongId);
    if (!active) return;
    const saved = await window.satsangAPI.saveSong(active);
    set((s) => ({
      songs: s.songs.map((item) => (item.id === saved.id ? saved : item)),
    }));
    if (showConfirmation) {
      get().showToast(`Saved all timing & stage config for "${saved.title}".`, 'success');
    }
  },

  deleteSong: async (songId) => {
    await window.satsangAPI.deleteSong(songId);
    set((s) => {
      const remaining = s.songs.filter((item) => item.id !== songId);
      const nextActive =
        s.activeSongId === songId ? (remaining[0]?.id ?? null) : s.activeSongId;
      return {
        songs: remaining,
        activeSongId: nextActive,
        isPlaying: false,
        currentTime: 0,
        activeLineIndex: -1,
      };
    });
    get().showToast('Song removed from local storage.', 'info');
  },

  updateSyncedLines: async (lines, rawLyrics) => {
    const { songs, activeSongId } = get();
    const active = songs.find((s) => s.id === activeSongId);
    if (!active) return;

    const normalized = normalizeSyncedLines(lines, active.duration || undefined);
    const updated: SongPackage = {
      ...active,
      rawLyrics: rawLyrics ?? normalized.map((l) => l.text).join('\n'),
      syncedLines: normalized,
    };

    set((s) => ({
      songs: s.songs.map((item) => (item.id === updated.id ? updated : item)),
    }));

    if (saveDebounceTimer !== null) window.clearTimeout(saveDebounceTimer);
    saveDebounceTimer = window.setTimeout(() => {
      window.satsangAPI.saveSong(updated).catch(() => {});
      saveDebounceTimer = null;
    }, 180);
  },

  updateStyleConfig: async (patch) => {
    const { songs, activeSongId } = get();
    const active = songs.find((s) => s.id === activeSongId);
    if (!active) return;

    const updated: SongPackage = {
      ...active,
      styleConfig: {
        ...DEFAULT_STYLE_CONFIG,
        ...active.styleConfig,
        ...patch,
      },
    };

    set((s) => ({
      songs: s.songs.map((item) => (item.id === updated.id ? updated : item)),
    }));
    await window.satsangAPI.saveSong(updated);
  },

  updateGlobalOffset: async (offsetSeconds) => {
    const { songs, activeSongId } = get();
    const active = songs.find((s) => s.id === activeSongId);
    if (!active) return;

    const clamped = Number(Math.max(-5, Math.min(5, offsetSeconds)).toFixed(3));
    const updated: SongPackage = {
      ...active,
      globalOffsetSeconds: clamped,
    };
    set((s) => ({
      songs: s.songs.map((item) => (item.id === updated.id ? updated : item)),
    }));
    await window.satsangAPI.saveSong(updated);
  },

  importBundle: async () => {
    try {
      const imported = await window.satsangAPI.importSongBundle();
      if (!imported) return;
      set((s) => ({
        songs: [...s.songs, imported].sort((a, b) => a.title.localeCompare(b.title)),
        activeSongId: imported.id,
      }));
      get().showToast(`Imported "${imported.title}" (.satsang.zip).`, 'success');
    } catch (err) {
      get().showToast(`Import failed: ${(err as Error).message}`, 'error');
    }
  },

  exportBundle: async (songId) => {
    try {
      const res = await window.satsangAPI.exportSongBundle(songId);
      if (!res.canceled) {
        get().showToast('Exported portable song bundle (.zip).', 'success');
      }
    } catch (err) {
      get().showToast(`Export failed: ${(err as Error).message}`, 'error');
    }
  },

  exportProject: async () => {
    try {
      const res = await window.satsangAPI.exportProject();
      if (!res.canceled) {
        get().showToast(`Exported full project (${res.songCount} songs) successfully!`, 'success');
      }
    } catch (err) {
      get().showToast(`Project export failed: ${(err as Error).message}`, 'error');
    }
  },

  importProject: async () => {
    try {
      const res = await window.satsangAPI.importProject();
      if (!res) return;
      set({
        songs: res.songs,
        activeSongId: res.songs[0]?.id ?? null,
      });
      get().showToast(`Imported project with ${res.importedCount} songs!`, 'success');
    } catch (err) {
      get().showToast(`Project import failed: ${(err as Error).message}`, 'error');
    }
  },

  refreshAssets: async () => {
    const assets = await window.satsangAPI.listAssets();
    set({ assets });
  },

  importBackgroundAsset: async () => {
    const asset = await window.satsangAPI.importBackgroundAsset();
    if (asset) {
      await get().refreshAssets();
      get().showToast(`Imported background: ${asset.name}`, 'success');
    }
    return asset;
  },

  importFontAsset: async () => {
    const asset = await window.satsangAPI.importFontAsset();
    if (asset) {
      await get().refreshAssets();
      get().showToast(`Imported custom font: ${asset.fontFamily}`, 'success');
    }
    return asset;
  },

  saveSettings: async (settings) => {
    const saved = await window.satsangAPI.saveSettings(settings);
    set({ settings: saved });
    get().showToast('Stage settings saved offline.', 'success');
  },

  setIsPresenting: (val, isPreviewFallback = false) =>
    set({ isPresenting: val, isPreviewFallback }),

  setIsBlank: (val) => set({ isBlank: val }),

  setPlaybackState: (patch) => set((s) => ({ ...s, ...patch })),
}));

