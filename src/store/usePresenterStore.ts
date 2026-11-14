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
import { DEFAULT_STYLE_CONFIG } from '../shared/types';
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
  pendingZip: { filePath: string; fileName: string } | null;
  newProjectModalOpen: boolean;
  closeWindowModalOpen: boolean;

  initialize: () => Promise<() => void>;
  setMode: (mode: ConsoleMode) => void;
  selectSong: (songId: string) => void;
  createSong: (input: CreateSongInput) => Promise<SongPackage>;
  createDemoSong: () => Promise<SongPackage>;
  saveSong: (song: SongPackage) => Promise<SongPackage>;
  flushSaveActiveSong: (showConfirmation?: boolean) => Promise<void>;
  deleteSong: (songId: string) => Promise<void>;
  reorderSongs: (orderedIds: string[]) => Promise<void>;
  moveSong: (songId: string, direction: 'up' | 'down') => Promise<void>;
  updateSyncedLines: (lines: SyncedLine[], rawLyrics?: string) => Promise<void>;
  updateStyleConfig: (patch: Partial<StyleConfig>) => Promise<void>;
  applyStyleConfigToAllSongs: (options?: { includeOffset?: boolean }) => Promise<number>;
  updateGlobalOffset: (offsetSeconds: number) => Promise<void>;
  setPendingZip: (zip: { filePath: string; fileName: string } | null) => void;
  setNewProjectModalOpen: (open: boolean) => void;
  setCloseWindowModalOpen: (open: boolean) => void;
  confirmCloseWindow: () => Promise<void>;
  triggerImportZipPicker: () => Promise<void>;
  importProjectFromPath: (filePath: string) => Promise<boolean>;
  newProject: () => Promise<void>;
  openInNewWindow: (filePath?: string) => Promise<boolean>;
  openNewEmptyWindow: () => Promise<boolean>;
  importBundle: () => Promise<void>;
  loadDemoSong: () => Promise<boolean>;
  exportBundle: (songId: string) => Promise<void>;
  exportProject: () => Promise<{ canceled: boolean; filePath?: string; songCount?: number }>;
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
  },
  isPresenting: false,
  isPreviewFallback: false,
  isBlank: false,
  isPlaying: false,
  currentTime: 0,
  activeLineIndex: -1,
  isLoading: true,
  toast: null,
  pendingZip: null,
  newProjectModalOpen: false,
  closeWindowModalOpen: false,

  setPendingZip: (zip) => set({ pendingZip: zip }),
  setNewProjectModalOpen: (open) => set({ newProjectModalOpen: open }),
  setCloseWindowModalOpen: (open) => set({ closeWindowModalOpen: open }),
  confirmCloseWindow: async () => {
    try {
      if (window.satsangAPI?.confirmCloseWindow) {
        await window.satsangAPI.confirmCloseWindow();
      } else {
        window.close();
      }
    } catch {
      window.close();
    }
  },

  triggerImportZipPicker: async () => {
    try {
      const picked = await window.satsangAPI.pickZipFile();
      if (picked) {
        set({ pendingZip: picked });
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || '';
      // If Electron main process hasn't been restarted after new IPC handlers were added:
      if (msg.includes('dialog:pickZip')) {
        try {
          const res = await window.satsangAPI.importProject();
          if (res) {
            set({
              songs: res.songs,
              activeSongId: res.songs[0]?.id ?? null,
            });
            get().showToast(`Imported project with ${res.importedCount} songs! (Restart npm run dev for new-window option)`, 'success');
          }
        } catch (innerErr) {
          get().showToast(`Import failed: ${(innerErr as Error).message}`, 'error');
        }
        return;
      }
      get().showToast(`Failed to select zip archive: ${msg}`, 'error');
    }
  },

  importProjectFromPath: async (filePath: string) => {
    try {
      const res = await window.satsangAPI.importProject(filePath);
      if (!res) return false;
      set({
        songs: res.songs,
        activeSongId: res.songs[0]?.id ?? null,
      });
      get().showToast(`Imported project with ${res.importedCount} songs!`, 'success');
      return true;
    } catch (err) {
      get().showToast(`Import failed: ${(err as Error).message}`, 'error');
      return false;
    }
  },

  newProject: async () => {
    try {
      await window.satsangAPI.newProject();
      set({
        songs: [],
        activeSongId: null,
        isPlaying: false,
        currentTime: 0,
        activeLineIndex: -1,
      });
      get().showToast('Started new blank project.', 'success');
    } catch (err) {
      get().showToast(`Failed to reset project: ${(err as Error).message}`, 'error');
    }
  },

  openInNewWindow: async (filePath?: string) => {
    try {
      await window.satsangAPI.openNewWindow(filePath ? { initialZipPath: filePath } : undefined);
      get().showToast('Opening project in new window...', 'info');
      return true;
    } catch (err) {
      get().showToast(`Failed to open new window: ${(err as Error).message}`, 'error');
      return false;
    }
  },

  openNewEmptyWindow: async () => {
    try {
      await window.satsangAPI.openNewWindow({ isNewProject: true });
      get().showToast('Opened new empty project window.', 'info');
      return true;
    } catch (err) {
      get().showToast(`Failed to open new window: ${(err as Error).message}`, 'error');
      return false;
    }
  },

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
        settings,
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

    const unsubCloseRequest = window.satsangAPI?.onWindowRequestClose?.(async () => {
      const currentSongs = get().songs;
      if (currentSongs.length === 0) {
        await get().confirmCloseWindow();
      } else {
        set({ closeWindowModalOpen: true });
      }
    });

    return () => {
      unsubDisplays?.();
      unsubClosed?.();
      unsubCloseRequest?.();
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

  reorderSongs: async (orderedIds) => {
    const { songs } = get();
    const idToSong = new Map(songs.map((s) => [s.id, s]));
    const reordered: SongPackage[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const s = idToSong.get(orderedIds[i]);
      if (s) {
        reordered.push({ ...s, orderIndex: i });
        idToSong.delete(orderedIds[i]);
      }
    }
    for (const remaining of idToSong.values()) {
      reordered.push({ ...remaining, orderIndex: reordered.length });
    }
    set({ songs: reordered });
    try {
      await window.satsangAPI.reorderSongs(reordered.map((s) => s.id));
    } catch (err) {
      console.error('Failed to persist song order to disk:', err);
    }
  },

  moveSong: async (songId, direction) => {
    const { songs, reorderSongs } = get();
    const index = songs.findIndex((s) => s.id === songId);
    if (index < 0) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === songs.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newSongs = [...songs];
    const [moved] = newSongs.splice(index, 1);
    newSongs.splice(targetIndex, 0, moved);

    await reorderSongs(newSongs.map((s) => s.id));
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

  applyStyleConfigToAllSongs: async (options) => {
    if (saveDebounceTimer !== null) {
      window.clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }

    const { songs, activeSongId } = get();
    const active = songs.find((s) => s.id === activeSongId);
    if (!active || songs.length === 0) return 0;

    const sourceStyle: StyleConfig = {
      ...DEFAULT_STYLE_CONFIG,
      ...active.styleConfig,
    };
    const sourceOffset = active.globalOffsetSeconds ?? 0;

    const updatedSongs: SongPackage[] = songs.map((item) => ({
      ...item,
      styleConfig: {
        ...sourceStyle,
      },
      ...(options?.includeOffset ? { globalOffsetSeconds: sourceOffset } : {}),
    }));

    set({ songs: updatedSongs });

    try {
      await Promise.all(updatedSongs.map((s) => window.satsangAPI.saveSong(s)));
      get().showToast(
        `Applied stage look to all ${songs.length} songs successfully!`,
        'success'
      );
      return songs.length;
    } catch (err) {
      get().showToast(`Failed to update some songs: ${(err as Error).message}`, 'error');
      return 0;
    }
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
    await get().triggerImportZipPicker();
  },

  loadDemoSong: async () => {
    try {
      if (window.satsangAPI?.loadDemoSong) {
        const imported = await window.satsangAPI.loadDemoSong();
        if (imported) {
          const songs = await window.satsangAPI.listSongs();
          set({
            songs,
            activeSongId: imported.id,
          });
          get().showToast('Loaded demo bhajan package!', 'success');
          return true;
        }
      }
      return false;
    } catch (err) {
      get().showToast(`Failed to load demo song: ${(err as Error).message}`, 'error');
      return false;
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
      await get().flushSaveActiveSong(false);
      const res = await window.satsangAPI.exportProject();
      if (!res.canceled) {
        get().showToast(`Exported full project (${res.songCount} songs) successfully!`, 'success');
      }
      return res;
    } catch (err) {
      get().showToast(`Project export failed: ${(err as Error).message}`, 'error');
      return { canceled: true };
    }
  },

  importProject: async () => {
    await get().triggerImportZipPicker();
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

