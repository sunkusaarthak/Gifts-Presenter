import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type {
  AlignedWord,
  AppSettings,
  DisplayInfo,
  GeminiAlignedLine,
  GeminiAlignModel,
  MediaAsset,
  PresentationPayload,
  SongPackage,
} from '../src/shared/types';

export interface CreateSongInput {
  title: string;
  audioSourcePath: string;
  rawLyrics: string;
  duration: number;
  syncedLines?: SongPackage['syncedLines'];
  styleConfig?: SongPackage['styleConfig'];
}

export interface SatsangAPI {
  // Window & Display management
  getDisplays: () => Promise<DisplayInfo[]>;
  onDisplaysChanged: (cb: (displays: DisplayInfo[]) => void) => () => void;
  startPresentation: (payload: PresentationPayload, preferredDisplayId?: number | null) => Promise<{ isPreviewFallback: boolean }>;
  stopPresentation: () => Promise<void>;
  syncPresentation: (payload: PresentationPayload) => void;
  onPresentationUpdate: (cb: (payload: PresentationPayload) => void) => () => void;
  getLatestPresentation: () => Promise<PresentationPayload | null>;
  onPresentationClosed: (cb: () => void) => () => void;

  // Songs & Persistence
  listSongs: () => Promise<SongPackage[]>;
  createSong: (input: CreateSongInput) => Promise<SongPackage>;
  createDemoSong: () => Promise<SongPackage>;
  saveSong: (song: SongPackage) => Promise<SongPackage>;
  deleteSong: (songId: string) => Promise<void>;
  pickAudioFile: () => Promise<{ filePath: string; fileName: string } | null>;
  readAudioBuffer: (relativePath: string) => Promise<ArrayBuffer>;

  // .LRC & .satsang.zip Bundles & Full Project
  importLrcDialog: () => Promise<{ content: string; fileName: string } | null>;
  exportLrcDialog: (defaultName: string, content: string) => Promise<boolean>;
  exportTextFileDialog: (
    defaultName: string,
    content: string,
    extension: string,
    filterName: string,
  ) => Promise<boolean>;
  exportSongBundle: (songId: string) => Promise<{ canceled: boolean; filePath?: string }>;
  importSongBundle: () => Promise<SongPackage | null>;
  exportProject: () => Promise<{ canceled: boolean; filePath?: string; songCount?: number }>;
  importProject: () => Promise<{ importedCount: number; songs: SongPackage[] } | null>;

  // Media & Font Assets
  listAssets: () => Promise<MediaAsset[]>;
  importBackgroundAsset: () => Promise<MediaAsset | null>;
  importFontAsset: () => Promise<MediaAsset | null>;

  // Settings
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;

  // Deterministic Forced Alignment (Mode A)
  runElevenLabsForcedAlignment: (params: {
    audioRelativePath: string;
    rawLyrics: string;
    apiKey: string;
  }) => Promise<AlignedWord[]>;
  runLocalCliForcedAlignment: (params: {
    audioRelativePath: string;
    rawLyrics: string;
    commandTemplate: string;
  }) => Promise<AlignedWord[]>;
  runGeminiAudioAlignment: (params: {
    audioRelativePath: string;
    rawLyrics: string;
    durationSec: number;
    apiKey: string;
    model: GeminiAlignModel;
  }) => Promise<GeminiAlignedLine[]>;

  // Info
  getPlatformInfo: () => Promise<{ platform: string; userDataDir: string; powerSaveActive: boolean }>;

  // Whole Application UI Zoom
  setZoomFactor: (factor: number) => void;
  getZoomFactor: () => number;
}

const api: SatsangAPI = {
  getDisplays: () => ipcRenderer.invoke('displays:getAll'),
  onDisplaysChanged: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, displays: DisplayInfo[]) => cb(displays);
    ipcRenderer.on('displays:changed', listener);
    return () => ipcRenderer.removeListener('displays:changed', listener);
  },
  startPresentation: (payload, preferredDisplayId) =>
    ipcRenderer.invoke('presentation:start', payload, preferredDisplayId),
  stopPresentation: () => ipcRenderer.invoke('presentation:stop'),
  syncPresentation: (payload) => ipcRenderer.send('presentation:sync', payload),
  onPresentationUpdate: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: PresentationPayload) => cb(payload);
    ipcRenderer.on('presentation:update', listener);
    return () => ipcRenderer.removeListener('presentation:update', listener);
  },
  getLatestPresentation: () => ipcRenderer.invoke('presentation:getLatest'),
  onPresentationClosed: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('presentation:closed', listener);
    return () => ipcRenderer.removeListener('presentation:closed', listener);
  },

  listSongs: () => ipcRenderer.invoke('songs:list'),
  createSong: (input) => ipcRenderer.invoke('songs:create', input),
  createDemoSong: () => ipcRenderer.invoke('songs:createDemo'),
  saveSong: (song) => ipcRenderer.invoke('songs:save', song),
  deleteSong: (songId) => ipcRenderer.invoke('songs:delete', songId),
  pickAudioFile: () => ipcRenderer.invoke('songs:pickAudio'),
  readAudioBuffer: (relativePath) => ipcRenderer.invoke('media:readBuffer', relativePath),

  importLrcDialog: () => ipcRenderer.invoke('lrc:importDialog'),
  exportLrcDialog: (defaultName, content) => ipcRenderer.invoke('lrc:exportDialog', defaultName, content),
  exportTextFileDialog: (defaultName, content, extension, filterName) =>
    ipcRenderer.invoke('lyrics:exportFileDialog', defaultName, content, extension, filterName),
  exportSongBundle: (songId) => ipcRenderer.invoke('bundle:export', songId),
  importSongBundle: () => ipcRenderer.invoke('bundle:import'),
  exportProject: () => ipcRenderer.invoke('project:export'),
  importProject: () => ipcRenderer.invoke('project:import'),

  listAssets: () => ipcRenderer.invoke('assets:list'),
  importBackgroundAsset: () => ipcRenderer.invoke('assets:importBackground'),
  importFontAsset: () => ipcRenderer.invoke('assets:importFont'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  runElevenLabsForcedAlignment: (params) => ipcRenderer.invoke('align:elevenlabs', params),
  runLocalCliForcedAlignment: (params) => ipcRenderer.invoke('align:localCli', params),
  runGeminiAudioAlignment: (params) => ipcRenderer.invoke('align:gemini', params),

  getPlatformInfo: () => ipcRenderer.invoke('app:info'),

  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),
};

contextBridge.exposeInMainWorld('satsangAPI', api);
