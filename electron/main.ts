import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  powerSaveBlocker,
  protocol,
  screen,
} from 'electron';
import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { normalizeSyncedLines } from '../src/shared/binarySearch';
import {
  DEFAULT_STYLE_CONFIG,
  type AlignedWord,
  type AppSettings,
  type DisplayInfo,
  type MediaAsset,
  type PresentationPayload,
  type SongPackage,
} from '../src/shared/types';

const execAsync = promisify(exec);

// Register custom protocol before app ready so <audio>, <video>, WaveSurfer fetch, and FontFace work seamlessly.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'satsang-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
const activeMainWindows = new Set<BrowserWindow>();
const closingAllowedWindows = new Set<number>();
const initialDataByWindowId = new Map<number, { initialZipPath?: string; isNewProject?: boolean }>();
let outputWindow: BrowserWindow | null = null;
let powerSaveId: number | null = null;
let latestPresentationPayload: PresentationPayload | null = null;

function getStorageRoot(winId?: number): string {
  if (winId && winId > 1) {
    return path.join(app.getPath('userData'), 'satsang-presenter', 'windows', `win-${winId}`);
  }
  return path.join(app.getPath('userData'), 'satsang-presenter');
}

function getSongsDir(winId?: number): string {
  return path.join(getStorageRoot(winId), 'songs');
}

function getBackgroundsDir(winId?: number): string {
  return path.join(getStorageRoot(winId), 'assets', 'backgrounds');
}

function getFontsDir(winId?: number): string {
  return path.join(getStorageRoot(winId), 'assets', 'fonts');
}

function getSettingsPath(winId?: number): string {
  return path.join(getStorageRoot(winId), 'settings.json');
}

async function ensureStorageDirs(winId?: number): Promise<void> {
  await fsp.mkdir(getSongsDir(winId), { recursive: true });
  await fsp.mkdir(getBackgroundsDir(winId), { recursive: true });
  await fsp.mkdir(getFontsDir(winId), { recursive: true });
}

function resolveSafeStoragePath(relativePath: string, winId?: number): string {
  const baseRoot = path.resolve(getStorageRoot());
  const root = path.resolve(getStorageRoot(winId));
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');

  let resolved: string;
  if (cleaned.startsWith('windows/')) {
    resolved = path.resolve(baseRoot, cleaned);
  } else {
    resolved = path.resolve(root, cleaned);
  }

  if (
    resolved !== root &&
    !resolved.startsWith(root + path.sep) &&
    resolved !== baseRoot &&
    !resolved.startsWith(baseRoot + path.sep)
  ) {
    throw new Error(`Unsafe path traversal blocked: ${relativePath}`);
  }
  return resolved;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.flac':
      return 'audio/flac';
    case '.m4a':
      return 'audio/mp4';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    default:
      return 'application/octet-stream';
  }
}

function registerMediaProtocol(): void {
  protocol.handle('satsang-media', async (request) => {
    try {
      const url = new URL(request.url);
      // URL format: satsang-media://local/<encoded/rel/path>
      const rawRel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const fullPath = resolveSafeStoragePath(rawRel);
      const stat = await fsp.stat(fullPath);
      if (!stat.isFile()) {
        return new Response('Not found', { status: 404 });
      }

      const fileSize = stat.size;
      const mimeType = getMimeType(fullPath);
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const start = match[1] ? Number(match[1]) : 0;
          const end = match[2] ? Math.min(fileSize - 1, Number(match[2])) : fileSize - 1;
          if (start >= fileSize || start > end) {
            return new Response('Range Not Satisfiable', {
              status: 416,
              headers: { 'Content-Range': `bytes */${fileSize}` },
            });
          }
          const chunkSize = end - start + 1;
          const nodeStream = fs.createReadStream(fullPath, { start, end });
          nodeStream.on('error', () => {});
          const webStream = Readable.toWeb(nodeStream) as ReadableStream;
          return new Response(webStream, {
            status: 206,
            headers: {
              'Content-Type': mimeType,
              'Content-Length': String(chunkSize),
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      const nodeStream = fs.createReadStream(fullPath);
      nodeStream.on('error', () => {});
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;
      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      console.error('satsang-media error:', err);
      return new Response('Media not found', { status: 404 });
    }
  });
}

function getAllDisplayInfos(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, idx) => ({
    id: d.id,
    label: d.label || (d.id === primary.id ? 'Primary Stage Display' : `External Display ${idx + 1}`),
    bounds: d.bounds,
    workArea: d.workArea,
    isPrimary: d.id === primary.id,
    scaleFactor: d.scaleFactor,
  }));
}

function pickTargetExternalDisplay(preferredDisplayId?: number | null): Electron.Display | null {
  const primary = screen.getPrimaryDisplay();
  const externals = screen.getAllDisplays().filter((d) => d.id !== primary.id);
  if (externals.length === 0) return null;
  if (preferredDisplayId != null) {
    const preferred = externals.find((d) => d.id === preferredDisplayId);
    if (preferred) return preferred;
  }
  return externals[0];
}

function getRendererEntryUrl(query?: string): { devUrl?: string; filePath?: string; search?: string } {
  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    return { devUrl: query ? `${devServer}?${query}` : devServer };
  }
  const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
  return { filePath: indexHtml, search: query };
}

function getAppIconPath(): string | undefined {
  const isWin = process.platform === 'win32';
  const candidateFolders = [
    path.join(__dirname, '../public'),
    path.join(__dirname, '../dist'),
    path.join(process.resourcesPath, 'app.asar.unpacked/public'),
    path.join(process.resourcesPath, 'app.asar.unpacked/dist'),
    path.join(process.resourcesPath, 'public'),
    path.join(process.resourcesPath, 'dist'),
    path.join(app.getAppPath(), 'public'),
    path.join(app.getAppPath(), 'dist'),
  ];

  if (isWin) {
    for (const folder of candidateFolders) {
      const ico = path.join(folder, 'logo.ico');
      if (fs.existsSync(ico)) return ico;
    }
  }

  for (const folder of candidateFolders) {
    const png = path.join(folder, 'logo.png');
    if (fs.existsSync(png)) return png;
  }

  for (const folder of candidateFolders) {
    const webp = path.join(folder, 'logo.webp');
    if (fs.existsSync(webp)) return webp;
  }

  return undefined;
}

function createMainWindow(params?: { initialZipPath?: string; isNewProject?: boolean }): BrowserWindow {
  nativeTheme.themeSource = 'dark';
  const primary = screen.getPrimaryDisplay();
  const iconPath = getAppIconPath();
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: Math.min(1480, primary.workAreaSize.width),
    height: Math.min(920, primary.workAreaSize.height),
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#08090c',
    title: 'Gifts Presenter',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: isMac
      ? false
      : {
          color: '#0b0d13',
          symbolColor: '#f1f5f9',
          height: 42,
        },
    trafficLightPosition: isMac ? { x: 14, y: 13 } : undefined,
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (iconPath) {
    win.setIcon(iconPath);
  }

  activeMainWindows.add(win);
  if (!mainWindow) {
    mainWindow = win;
  }

  if (params) {
    initialDataByWindowId.set(win.id, params);
  }

  const target = getRendererEntryUrl();
  if (target.devUrl) {
    win.loadURL(target.devUrl);
  } else if (target.filePath) {
    win.loadFile(target.filePath);
  }

  // Intercept window close to prompt saving via custom dark UI modal if project is not empty
  win.on('close', async (e) => {
    if (closingAllowedWindows.has(win.id)) {
      closingAllowedWindows.delete(win.id);
      return;
    }

    if (win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isCrashed()) {
      return;
    }

    const winId = win.id;
    const songs = await listAllSongs(winId).catch(() => []);
    if (songs.length === 0) {
      // Empty project, close immediately
      closingAllowedWindows.add(win.id);
      return;
    }

    // Intercept native close and notify renderer to display custom dark spiritual UI modal
    e.preventDefault();
    win.webContents.send('window:request-close');
  });

  win.on('closed', () => {
    closingAllowedWindows.delete(win.id);
    activeMainWindows.delete(win);
    initialDataByWindowId.delete(win.id);
    if (mainWindow === win) {
      mainWindow = activeMainWindows.values().next().value ?? null;
    }

    // Clean up temporary workspace for secondary windows
    if (win.id > 1) {
      const tempDir = path.join(getStorageRoot(), 'windows', `win-${win.id}`);
      fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    if (activeMainWindows.size === 0) {
      if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.close();
        outputWindow = null;
      }
    }
  });

  return win;
}

function openOrUpdateOutputWindow(
  payload: PresentationPayload,
  preferredDisplayId?: number | null,
): { isPreviewFallback: boolean } {
  latestPresentationPayload = payload;
  const externalDisplay = pickTargetExternalDisplay(preferredDisplayId);
  const isPreviewFallback = externalDisplay === null;

  latestPresentationPayload = {
    ...payload,
    isPreviewFallback,
  };

  if (outputWindow && !outputWindow.isDestroyed()) {
    // Re-position if display availability changed
    configureOutputWindowDisplay(outputWindow, externalDisplay);
    outputWindow.webContents.send('presentation:update', latestPresentationPayload);
    outputWindow.show();
    return { isPreviewFallback };
  }

  const preloadPath = path.join(__dirname, 'preload.cjs');
  const iconPath = getAppIconPath();
  const isMac = process.platform === 'darwin';

  if (externalDisplay) {
    outputWindow = new BrowserWindow({
      x: externalDisplay.bounds.x,
      y: externalDisplay.bounds.y,
      width: externalDisplay.bounds.width,
      height: externalDisplay.bounds.height,
      frame: false,
      titleBarStyle: 'hidden',
      fullscreen: !isMac,
      simpleFullscreen: false,
      kiosk: !isMac,
      hasShadow: false,
      enableLargerThanScreen: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      backgroundColor: '#000000',
      icon: iconPath,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    outputWindow.setBounds(externalDisplay.bounds);
    outputWindow.setAlwaysOnTop(true, 'screen-saver');
    outputWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    // Single-Monitor Fallback: floating 16:9 preview window
    outputWindow = new BrowserWindow({
      width: 960,
      height: 540,
      minWidth: 480,
      minHeight: 270,
      frame: true,
      fullscreen: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      title: 'Audience Output — 16:9 Stage Preview',
      backgroundColor: '#000000',
      icon: iconPath,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    outputWindow.setAspectRatio(16 / 9);
    if (iconPath) {
      outputWindow.setIcon(iconPath);
    }
  }

  const target = getRendererEntryUrl('window=output');
  if (target.devUrl) {
    outputWindow.loadURL(target.devUrl);
  } else if (target.filePath) {
    outputWindow.loadFile(target.filePath, { search: target.search });
  }

  outputWindow.webContents.on('did-finish-load', () => {
    if (!outputWindow || outputWindow.isDestroyed()) return;
    if (!isPreviewFallback) {
      outputWindow.webContents.insertCSS('* { cursor: none !important; }').catch(() => {});
    }
    if (latestPresentationPayload) {
      outputWindow.webContents.send('presentation:update', latestPresentationPayload);
    }
  });

  outputWindow.on('closed', () => {
    outputWindow = null;
    for (const win of activeMainWindows) {
      if (!win.isDestroyed()) {
        win.webContents.send('presentation:closed');
      }
    }
  });

  return { isPreviewFallback };
}

function configureOutputWindowDisplay(
  win: BrowserWindow,
  externalDisplay: Electron.Display | null,
): void {
  const isMac = process.platform === 'darwin';
  if (externalDisplay) {
    win.setBounds(externalDisplay.bounds);
    if (!isMac) {
      if (!win.isFullScreen()) {
        win.setFullScreen(true);
      }
      win.setKiosk(true);
    } else {
      win.setKiosk(false);
      win.setSimpleFullScreen(false);
    }
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.webContents.insertCSS('* { cursor: none !important; }').catch(() => {});
  } else {
    if (!isMac) {
      win.setKiosk(false);
      if (win.isFullScreen()) {
        win.setFullScreen(false);
      }
    }
    win.setAlwaysOnTop(true);
    win.setAspectRatio(16 / 9);
  }
}

function broadcastDisplays(): void {
  const displays = getAllDisplayInfos();
  for (const win of activeMainWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('displays:changed', displays);
    }
  }
  if (outputWindow && !outputWindow.isDestroyed() && latestPresentationPayload?.isPresenting) {
    const ext = pickTargetExternalDisplay(null);
    const isPreviewFallback = ext === null;
    configureOutputWindowDisplay(outputWindow, ext);
    latestPresentationPayload = { ...latestPresentationPayload, isPreviewFallback };
    outputWindow.webContents.send('presentation:update', latestPresentationPayload);
  }
}

async function listAllSongs(winId?: number): Promise<SongPackage[]> {
  await ensureStorageDirs(winId);
  const songsDir = getSongsDir(winId);
  const entries = await fsp.readdir(songsDir, { withFileTypes: true }).catch(() => []);
  const songs: SongPackage[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const jsonPath = path.join(songsDir, entry.name, 'song.json');
    try {
      const raw = await fsp.readFile(jsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as SongPackage;
      parsed.syncedLines = normalizeSyncedLines(parsed.syncedLines ?? [], parsed.duration);
      parsed.styleConfig = { ...DEFAULT_STYLE_CONFIG, ...(parsed.styleConfig ?? {}) };
      songs.push(parsed);
    } catch {
      // Skip incomplete or corrupt song folder
    }
  }

  songs.sort((a, b) => {
    const orderA = typeof a.orderIndex === 'number' ? a.orderIndex : Infinity;
    const orderB = typeof b.orderIndex === 'number' ? b.orderIndex : Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });
  return songs;
}

async function reorderSongsOnDisk(orderedIds: string[], winId?: number): Promise<SongPackage[]> {
  await ensureStorageDirs(winId);
  const idToOrder = new Map(orderedIds.map((id, idx) => [id, idx]));
  const songs = await listAllSongs(winId);

  for (const song of songs) {
    const newIdx = idToOrder.get(song.id);
    if (newIdx !== undefined && song.orderIndex !== newIdx) {
      song.orderIndex = newIdx;
      await saveSongToDisk(song, winId);
    }
  }

  songs.sort((a, b) => {
    const orderA = typeof a.orderIndex === 'number' ? a.orderIndex : Infinity;
    const orderB = typeof b.orderIndex === 'number' ? b.orderIndex : Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });
  return songs;
}

async function saveSongToDisk(song: SongPackage, winId?: number): Promise<SongPackage> {
  await ensureStorageDirs(winId);
  const songDir = path.join(getSongsDir(winId), song.id);
  await fsp.mkdir(songDir, { recursive: true });
  const normalized: SongPackage = {
    ...song,
    syncedLines: normalizeSyncedLines(song.syncedLines, song.duration),
    styleConfig: { ...DEFAULT_STYLE_CONFIG, ...song.styleConfig },
    updatedAt: new Date().toISOString(),
  };
  const jsonPath = path.join(songDir, 'song.json');
  const tmpPath = `${jsonPath}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(normalized, null, 2), 'utf-8');
  await fsp.rename(tmpPath, jsonPath);
  return normalized;
}

async function readSettingsFromDisk(winId?: number): Promise<AppSettings> {
  const defaults: AppSettings = {
    audioSinkId: '',
    preferredDisplayId: null,
    elevenLabsApiKey: '',
    localAlignerCommand: '',
  };
  try {
    const raw = await fsp.readFile(getSettingsPath(winId), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...defaults,
      ...parsed,
    } satisfies AppSettings;
  } catch {
    return defaults;
  }
}

async function writeSettingsToDisk(settings: AppSettings, winId?: number): Promise<AppSettings> {
  await ensureStorageDirs(winId);
  await fsp.writeFile(getSettingsPath(winId), JSON.stringify(settings, null, 2), 'utf-8');
  return settings;
}

async function generateProjectZipBytes(
  songs: SongPackage[],
  settings: AppSettings,
  winId?: number,
): Promise<Buffer> {
  const zip = new JSZip();
  const projectManifest = {
    version: 1,
    appName: 'Gifts Presenter',
    exportedAt: new Date().toISOString(),
    settings,
    songs: [] as SongPackage[],
  };

  for (const song of songs) {
    const bundledSong: SongPackage = { ...song, styleConfig: { ...song.styleConfig } };
    try {
      const audioFull = resolveSafeStoragePath(song.audioPath, winId);
      const audioExt = path.extname(audioFull) || '.mp3';
      const zipAudioPath = `songs/${song.id}/audio${audioExt}`;
      const audioBuf = await fsp.readFile(audioFull);
      zip.file(zipAudioPath, audioBuf);
      bundledSong.audioPath = zipAudioPath;
    } catch (err) {
      console.warn(`Could not read audio for song ${song.id}:`, err);
    }

    if (
      (song.styleConfig.backgroundType === 'image' || song.styleConfig.backgroundType === 'video') &&
      song.styleConfig.backgroundSrc &&
      !song.styleConfig.backgroundSrc.startsWith('http')
    ) {
      try {
        const bgFull = resolveSafeStoragePath(song.styleConfig.backgroundSrc, winId);
        const bgName = path.basename(bgFull);
        const zipBgPath = `songs/${song.id}/assets/${bgName}`;
        zip.file(zipBgPath, await fsp.readFile(bgFull));
        bundledSong.styleConfig.backgroundSrc = zipBgPath;
      } catch {}
    }

    if (song.styleConfig.fontAssetPath) {
      try {
        const fontFull = resolveSafeStoragePath(song.styleConfig.fontAssetPath, winId);
        const fontName = path.basename(fontFull);
        const zipFontPath = `songs/${song.id}/assets/${fontName}`;
        zip.file(zipFontPath, await fsp.readFile(fontFull));
        bundledSong.styleConfig.fontAssetPath = zipFontPath;
      } catch {}
    }

    projectManifest.songs.push(bundledSong);
  }

  zip.file('project.json', JSON.stringify(projectManifest, null, 2));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function importProjectZipFile(
  zipFilePath: string,
  winId?: number,
): Promise<{ importedCount: number; songs: SongPackage[] }> {
  await ensureStorageDirs(winId);
  const bytes = await fsp.readFile(zipFilePath);
  const zip = await JSZip.loadAsync(bytes);

  const projectJsonFile = zip.file('project.json');
  if (projectJsonFile) {
    // Multi-song project archive (.gifts.zip)
    const projectData = JSON.parse(await projectJsonFile.async('string'));
    const importedSongs: SongPackage[] = [];
    const songsDir = getSongsDir(winId);

    for (const song of (projectData.songs || []) as SongPackage[]) {
      const newId = `song-${randomUUID().slice(0, 8)}`;
      const songDir = path.join(songsDir, newId);
      await fsp.mkdir(path.join(songDir, 'assets'), { recursive: true });

      const audioZipName = song.audioPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const audioEntry = zip.file(audioZipName);
      let destAudioRel = song.audioPath;
      if (audioEntry) {
        const audioExt = path.extname(audioZipName) || '.mp3';
        const prefix = winId && winId > 1 ? `windows/win-${winId}/` : '';
        destAudioRel = `${prefix}songs/${newId}/audio${audioExt}`;
        await fsp.writeFile(resolveSafeStoragePath(destAudioRel, winId), await audioEntry.async('nodebuffer'));
      }

      const nextStyle = { ...DEFAULT_STYLE_CONFIG, ...song.styleConfig };
      if (nextStyle.backgroundSrc && !nextStyle.backgroundSrc.startsWith('http')) {
        const bgZipName = nextStyle.backgroundSrc.replace(/\\/g, '/').replace(/^\/+/, '');
        const bgEntry = zip.file(bgZipName);
        if (bgEntry) {
          const bgName = path.basename(bgZipName);
          const prefix = winId && winId > 1 ? `windows/win-${winId}/` : '';
          const destBgRel = `${prefix}songs/${newId}/assets/${bgName}`;
          await fsp.writeFile(resolveSafeStoragePath(destBgRel, winId), await bgEntry.async('nodebuffer'));
          nextStyle.backgroundSrc = destBgRel;
        }
      }

      if (nextStyle.fontAssetPath) {
        const fontZipName = nextStyle.fontAssetPath.replace(/\\/g, '/').replace(/^\/+/, '');
        const fontEntry = zip.file(fontZipName);
        if (fontEntry) {
          const fontName = path.basename(fontZipName);
          const prefix = winId && winId > 1 ? `windows/win-${winId}/` : '';
          const destFontRel = `${prefix}songs/${newId}/assets/${fontName}`;
          await fsp.writeFile(resolveSafeStoragePath(destFontRel, winId), await fontEntry.async('nodebuffer'));
          nextStyle.fontAssetPath = destFontRel;
        }
      }

      const importedSong: SongPackage = {
        ...song,
        id: newId,
        audioPath: destAudioRel,
        styleConfig: nextStyle,
        syncedLines: normalizeSyncedLines(song.syncedLines ?? [], song.duration),
      };

      await saveSongToDisk(importedSong, winId);
      importedSongs.push(importedSong);
    }

    if (projectData.settings) {
      await writeSettingsToDisk(projectData.settings, winId);
    }

    const allSongs = await listAllSongs(winId);
    return { importedCount: importedSongs.length, songs: allSongs };
  }

  // Single song package (.satsang.zip)
  const manifestFile = zip.file('manifest.json') ?? zip.file('song.json');
  if (manifestFile) {
    const manifest = JSON.parse(await manifestFile.async('string')) as SongPackage;
    const newId = `song-${randomUUID().slice(0, 8)}`;
    const songDir = path.join(getSongsDir(winId), newId);
    await fsp.mkdir(path.join(songDir, 'assets'), { recursive: true });

    const audioZipEntryName = manifest.audioPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const audioEntry = zip.file(audioZipEntryName);
    if (!audioEntry) {
      throw new Error(`Bundle missing audio entry: ${audioZipEntryName}`);
    }
    const audioExt = path.extname(audioZipEntryName) || '.mp3';
    const prefix = winId && winId > 1 ? `windows/win-${winId}/` : '';
    const destAudioRel = `${prefix}songs/${newId}/audio${audioExt}`;
    await fsp.writeFile(resolveSafeStoragePath(destAudioRel, winId), await audioEntry.async('nodebuffer'));

    const nextStyle = { ...DEFAULT_STYLE_CONFIG, ...manifest.styleConfig };
    if (
      (nextStyle.backgroundType === 'image' || nextStyle.backgroundType === 'video') &&
      nextStyle.backgroundSrc &&
      !nextStyle.backgroundSrc.startsWith('http')
    ) {
      const bgEntryName = nextStyle.backgroundSrc.replace(/\\/g, '/').replace(/^\/+/, '');
      const bgEntry = zip.file(bgEntryName);
      if (bgEntry) {
        const safeBgName = path.basename(bgEntryName);
        const destBgRel = `${prefix}songs/${newId}/assets/${safeBgName}`;
        await fsp.writeFile(resolveSafeStoragePath(destBgRel, winId), await bgEntry.async('nodebuffer'));
        nextStyle.backgroundSrc = destBgRel;
      }
    }

    if (nextStyle.fontAssetPath) {
      const fontEntryName = nextStyle.fontAssetPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const fontEntry = zip.file(fontEntryName);
      if (fontEntry) {
        const safeFontName = path.basename(fontEntryName);
        const destFontRel = `${prefix}songs/${newId}/assets/${safeFontName}`;
        await fsp.writeFile(resolveSafeStoragePath(destFontRel, winId), await fontEntry.async('nodebuffer'));
        nextStyle.fontAssetPath = destFontRel;
      }
    }

    const importedSong: SongPackage = {
      ...manifest,
      id: newId,
      audioPath: destAudioRel,
      styleConfig: nextStyle,
      syncedLines: normalizeSyncedLines(manifest.syncedLines ?? [], manifest.duration),
    };

    await saveSongToDisk(importedSong, winId);
    const allSongs = await listAllSongs(winId);
    return { importedCount: 1, songs: allSongs };
  }

  throw new Error('Invalid archive: neither project.json nor manifest.json found');
}

function sanitizeFileSlug(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 48) || 'asset';
}

function extractWordsFromGenericJson(data: unknown): AlignedWord[] {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;

  // ElevenLabs / standard { words: [{ text | word, start, end }] }
  if (Array.isArray(obj.words)) {
    return obj.words
      .map((w: unknown) => {
        const item = w as Record<string, unknown>;
        const text = String(item.word ?? item.text ?? '').trim();
        const start = Number(item.start ?? item.start_time ?? 0);
        const end = Number(item.end ?? item.end_time ?? start + 0.2);
        return { word: text, start, end };
      })
      .filter((w) => w.word.length > 0 && Number.isFinite(w.start));
  }

  // whisper.cpp -oj JSON format: { transcription: [{ timestamps: { from, to }, offsets: { from, to }, text, tokens? }] }
  if (Array.isArray(obj.transcription)) {
    const out: AlignedWord[] = [];
    for (const seg of obj.transcription as Array<Record<string, unknown>>) {
      const tokens = Array.isArray(seg.tokens) ? (seg.tokens as Array<Record<string, unknown>>) : null;
      if (tokens && tokens.length > 0) {
        for (const t of tokens) {
          const text = String(t.text ?? '').trim();
          if (!text || text.startsWith('[')) continue;
          const offsets = (t.offsets ?? {}) as Record<string, unknown>;
          const start = Number(offsets.from ?? 0) / 1000;
          const end = Number(offsets.to ?? Number(offsets.from ?? 0) + 200) / 1000;
          out.push({ word: text, start, end });
        }
      } else {
        const segText = String(seg.text ?? '').trim();
        const offsets = (seg.offsets ?? {}) as Record<string, unknown>;
        const segStart = Number(offsets.from ?? 0) / 1000;
        const segEnd = Number(offsets.to ?? segStart * 1000 + 1000) / 1000;
        const parts = segText.split(/\s+/).filter(Boolean);
        const span = Math.max(0.1, segEnd - segStart);
        parts.forEach((p, idx) => {
          out.push({
            word: p,
            start: segStart + (idx / parts.length) * span,
            end: segStart + ((idx + 1) / parts.length) * span,
          });
        });
      }
    }
    return out;
  }

  return [];
}

function showOpenDialogFor(
  win: BrowserWindow | null | undefined,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}

function showSaveDialogFor(
  win: BrowserWindow | null | undefined,
  options: Electron.SaveDialogOptions,
): Promise<Electron.SaveDialogReturnValue> {
  return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options);
}

function registerIpcHandlers(): void {
  ipcMain.handle('displays:getAll', () => getAllDisplayInfos());

  ipcMain.handle(
    'presentation:start',
    (_event, payload: PresentationPayload, preferredDisplayId?: number | null) => {
      return openOrUpdateOutputWindow(payload, preferredDisplayId);
    },
  );

  ipcMain.handle('presentation:stop', () => {
    if (latestPresentationPayload) {
      latestPresentationPayload = { ...latestPresentationPayload, isPresenting: false };
    }
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.close();
      outputWindow = null;
    }
  });

  ipcMain.on('presentation:sync', (_event, payload: PresentationPayload) => {
    latestPresentationPayload = {
      ...payload,
      isPreviewFallback: outputWindow ? !outputWindow.isFullScreen() : payload.isPreviewFallback,
    };
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.webContents.send('presentation:update', latestPresentationPayload);
    }
  });

  ipcMain.on('audio-visualizer-tick', (_event, payload: unknown) => {
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.webContents.send('audio-visualizer-tick', payload);
    }
  });

  ipcMain.handle('presentation:getLatest', () => latestPresentationPayload);

  ipcMain.handle('songs:list', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return listAllSongs(win?.id);
  });

  ipcMain.handle('songs:reorder', async (event, orderedIds: string[]) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return reorderSongsOnDisk(orderedIds, win?.id);
  });

  ipcMain.handle(
    'songs:create',
    async (
      event,
      input: {
        title: string;
        audioSourcePath: string;
        rawLyrics: string;
        duration: number;
        syncedLines?: SongPackage['syncedLines'];
        styleConfig?: SongPackage['styleConfig'];
      },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const winId = win?.id;
      await ensureStorageDirs(winId);
      const id = `song-${randomUUID().slice(0, 8)}`;
      const songDir = path.join(getSongsDir(winId), id);
      await fsp.mkdir(songDir, { recursive: true });

      const ext = path.extname(input.audioSourcePath).toLowerCase() || '.mp3';
      const audioDestName = `audio${ext}`;
      const audioDestPath = path.join(songDir, audioDestName);
      await fsp.copyFile(input.audioSourcePath, audioDestPath);

      const prefix = winId && winId > 1 ? `windows/win-${winId}/` : '';
      const song: SongPackage = {
        id,
        title: input.title.trim() || path.basename(input.audioSourcePath, ext),
        audioPath: `${prefix}songs/${id}/${audioDestName}`,
        duration: input.duration || 0,
        rawLyrics: input.rawLyrics ?? '',
        syncedLines: normalizeSyncedLines(input.syncedLines ?? [], input.duration || undefined),
        styleConfig: { ...DEFAULT_STYLE_CONFIG, ...(input.styleConfig ?? {}) },
        globalOffsetSeconds: 0,
      };
      return saveSongToDisk(song, winId);
    },
  );

  ipcMain.handle('songs:save', (event, song: SongPackage) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return saveSongToDisk(song, win?.id);
  });

  ipcMain.handle('songs:createDemo', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    await ensureStorageDirs(winId);
    const id = `song-demo-${randomUUID().slice(0, 6)}`;
    const songDir = path.join(getSongsDir(winId), id);
    await fsp.mkdir(songDir, { recursive: true });

    // Synthesize deterministic 20s 22050Hz 16-bit mono WAV:
    // Low tanpura drone (110Hz + 165Hz, filtered out by 300Hz-3400Hz bandpass!)
    // + 4 clear vocal-band (523Hz/659Hz/784Hz) phrases matching the 4 demo verses.
    const sampleRate = 22050;
    const duration = 20;
    const totalSamples = sampleRate * duration;
    const phrases = [
      { start: 1.0, end: 4.3, freq: 523.25, text: 'Om Shanti Shanti Shantih — Peace within every heart' },
      { start: 5.1, end: 8.6, freq: 587.33, text: 'May stillness guide our breath and silence our mind' },
      { start: 9.5, end: 13.4, freq: 659.25, text: 'In the light of truth, one song unites ten thousand souls' },
      { start: 14.3, end: 18.2, freq: 523.25, text: 'Hari Om Tat Sat — Eternal presence, boundless grace' },
    ];

    const dataBytes = totalSamples * 2;
    const wav = Buffer.alloc(44 + dataBytes);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataBytes, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); // PCM
    wav.writeUInt16LE(1, 22); // mono
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(dataBytes, 40);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      let sig = 0.12 * Math.sin(2 * Math.PI * 110 * t) + 0.08 * Math.sin(2 * Math.PI * 165 * t);
      for (const p of phrases) {
        if (t >= p.start && t <= p.end) {
          const env = Math.min(1, (t - p.start) / 0.12) * Math.min(1, (p.end - t) / 0.18);
          sig +=
            env *
            (0.38 * Math.sin(2 * Math.PI * p.freq * t) +
              0.18 * Math.sin(2 * Math.PI * p.freq * 2 * t));
        }
      }
      const clamped = Math.max(-0.98, Math.min(0.98, sig));
      wav.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
    }

    const prefix = winId && winId > 1 ? `windows/win-${winId}/` : '';
    const audioRel = `${prefix}songs/${id}/audio.wav`;
    await fsp.writeFile(resolveSafeStoragePath(audioRel, winId), wav);

    const demoSong: SongPackage = {
      id,
      title: 'Satsang Opening Invocation (Demo)',
      audioPath: audioRel,
      duration,
      rawLyrics: phrases.map((p) => p.text).join('\n'),
      syncedLines: phrases.map((p, idx) => ({
        id: `demo-line-${idx}`,
        index: idx,
        startTime: p.start,
        endTime: p.end,
        text: p.text,
      })),
      styleConfig: { ...DEFAULT_STYLE_CONFIG },
      globalOffsetSeconds: 0,
    };

    return saveSongToDisk(demoSong, winId);
  });

  ipcMain.handle('songs:delete', async (event, songId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    const prefix = winId && winId > 1 ? `windows/win-${winId}/songs/${songId}` : `songs/${songId}`;
    const safeDir = resolveSafeStoragePath(prefix, winId);
    await fsp.rm(safeDir, { recursive: true, force: true });
  });

  ipcMain.handle('songs:pickAudio', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await showOpenDialogFor(win, {
      title: 'Select Satsang Audio Track',
      properties: ['openFile'],
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'm4a'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    return { filePath, fileName: path.basename(filePath) };
  });

  ipcMain.handle('media:readBuffer', async (event, relativePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const fullPath = resolveSafeStoragePath(relativePath, win?.id);
    const buf = await fsp.readFile(fullPath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });

  ipcMain.handle('lrc:importDialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await showOpenDialogFor(win, {
      title: 'Import Standard .LRC Timecode File',
      properties: ['openFile'],
      filters: [{ name: 'LRC Lyric Timecodes', extensions: ['lrc', 'txt'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    const content = await fsp.readFile(filePath, 'utf-8');
    return { content, fileName: path.basename(filePath) };
  });

  ipcMain.handle('lrc:exportDialog', async (event, defaultName: string, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await showSaveDialogFor(win, {
      title: 'Export Standard .LRC File',
      defaultPath: `${sanitizeFileSlug(defaultName)}.lrc`,
      filters: [{ name: 'LRC Lyric Timecodes', extensions: ['lrc'] }],
    });
    if (res.canceled || !res.filePath) return false;
    await fsp.writeFile(res.filePath, content, 'utf-8');
    return true;
  });

  ipcMain.handle(
    'lyrics:exportFileDialog',
    async (
      event,
      defaultName: string,
      content: string,
      extension: string,
      filterName: string,
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const ext = extension.replace(/^\.+/, '');
      const res = await showSaveDialogFor(win, {
        title: `Export ${filterName}`,
        defaultPath: `${sanitizeFileSlug(defaultName)}.${ext}`,
        filters: [{ name: filterName, extensions: [ext] }],
      });
      if (res.canceled || !res.filePath) return false;
      await fsp.writeFile(res.filePath, content, 'utf-8');
      return true;
    },
  );

  ipcMain.handle('bundle:export', async (event, songId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    const prefix = winId && winId > 1 ? `windows/win-${winId}/songs/${songId}` : `songs/${songId}`;
    const songDir = resolveSafeStoragePath(prefix, winId);
    const songJsonPath = path.join(songDir, 'song.json');
    const raw = await fsp.readFile(songJsonPath, 'utf-8');
    const song = JSON.parse(raw) as SongPackage;

    const saveRes = await showSaveDialogFor(win, {
      title: 'Export Portable .satsang.zip Bundle',
      defaultPath: `${sanitizeFileSlug(song.title)}.satsang.zip`,
      filters: [{ name: 'Satsang Song Bundle', extensions: ['satsang.zip', 'zip'] }],
    });
    if (saveRes.canceled || !saveRes.filePath) {
      return { canceled: true };
    }

    const zip = new JSZip();
    const audioFullPath = resolveSafeStoragePath(song.audioPath, winId);
    const audioBaseName = path.basename(audioFullPath);
    const audioBuf = await fsp.readFile(audioFullPath);
    zip.file(`audio/${audioBaseName}`, audioBuf);

    const bundledSong: SongPackage = {
      ...song,
      audioPath: `audio/${audioBaseName}`,
      styleConfig: { ...song.styleConfig },
    };

    if (
      (song.styleConfig.backgroundType === 'image' || song.styleConfig.backgroundType === 'video') &&
      song.styleConfig.backgroundSrc &&
      !song.styleConfig.backgroundSrc.startsWith('http')
    ) {
      try {
        const bgFull = resolveSafeStoragePath(song.styleConfig.backgroundSrc, winId);
        const bgName = path.basename(bgFull);
        zip.file(`assets/${bgName}`, await fsp.readFile(bgFull));
        bundledSong.styleConfig.backgroundSrc = `assets/${bgName}`;
      } catch {
        // Keep reference as-is if missing
      }
    }

    if (song.styleConfig.fontAssetPath) {
      try {
        const fontFull = resolveSafeStoragePath(song.styleConfig.fontAssetPath, winId);
        const fontName = path.basename(fontFull);
        zip.file(`assets/${fontName}`, await fsp.readFile(fontFull));
        bundledSong.styleConfig.fontAssetPath = `assets/${fontName}`;
      } catch {
        // Ignore missing custom font
      }
    }

    zip.file('manifest.json', JSON.stringify(bundledSong, null, 2));
    const zipBytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await fsp.writeFile(saveRes.filePath, zipBytes);
    return { canceled: false, filePath: saveRes.filePath };
  });

  ipcMain.handle('bundle:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    const res = await showOpenDialogFor(win, {
      title: 'Import Portable .satsang.zip Bundle',
      properties: ['openFile'],
      filters: [{ name: 'Satsang Song Bundle', extensions: ['zip', 'satsang.zip'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const result = await importProjectZipFile(res.filePaths[0], winId);
    return result.songs[result.songs.length - 1] ?? null;
  });

  ipcMain.handle('bundle:loadDemo', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    const candidatePaths = [
      path.join(app.getAppPath(), 'demo-project', 'Gifts-Demo-Bhajan.zip'),
      path.join(app.getAppPath(), 'demo-project', 'Gifts_Project_Demo_Project.gifts.zip'),
      path.join(process.resourcesPath, 'demo-project', 'Gifts-Demo-Bhajan.zip'),
      path.join(process.resourcesPath, 'demo-project', 'Gifts_Project_Demo_Project.gifts.zip'),
      path.join(__dirname, '..', 'demo-project', 'Gifts-Demo-Bhajan.zip'),
      path.join(process.cwd(), 'demo-project', 'Gifts-Demo-Bhajan.zip'),
      path.join(app.getPath('downloads'), 'Gifts_Project_Demo_Project.gifts.zip'),
      'C:\\Users\\User\\Downloads\\Gifts_Project_Demo_Project.gifts.zip',
      path.join(app.getPath('downloads'), 'Gifts_Project 2 bhajans.gifts.zip'),
      'C:\\Users\\User\\Downloads\\Gifts_Project 2 bhajans.gifts.zip',
    ];
    let demoPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        demoPath = p;
        break;
      }
    }
    if (!demoPath) {
      throw new Error('Demo project package (Gifts-Demo-Bhajan.zip) not found.');
    }
    const result = await importProjectZipFile(demoPath, winId);
    return result.songs[result.songs.length - 1] ?? null;
  });

  ipcMain.handle('project:export', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    const songs = await listAllSongs(winId);
    const settings = await readSettingsFromDisk(winId);

    const saveRes = await showSaveDialogFor(win, {
      title: 'Export Full Gifts Presenter Project Backup',
      defaultPath: `Gifts_Project_${new Date().toISOString().slice(0, 10)}.gifts.zip`,
      filters: [{ name: 'Gifts Presenter Project (.gifts.zip)', extensions: ['gifts.zip', 'zip'] }],
    });
    if (saveRes.canceled || !saveRes.filePath) {
      return { canceled: true };
    }

    const zipBytes = await generateProjectZipBytes(songs, settings, winId);
    await fsp.writeFile(saveRes.filePath, zipBytes);
    return { canceled: false, filePath: saveRes.filePath, songCount: songs.length };
  });

  ipcMain.handle('project:import', async (event, explicitFilePath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    let targetPath = explicitFilePath;
    if (!targetPath) {
      const res = await showOpenDialogFor(win, {
        title: 'Import Full Gifts Presenter Project Backup',
        properties: ['openFile'],
        filters: [{ name: 'Gifts & Satsang Archives (.gifts.zip, .satsang.zip, .zip)', extensions: ['gifts.zip', 'satsang.zip', 'zip'] }],
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      targetPath = res.filePaths[0];
    }
    return importProjectZipFile(targetPath, winId);
  });

  ipcMain.handle('project:new', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    const songsDir = getSongsDir(winId);
    await fsp.rm(songsDir, { recursive: true, force: true });
    await ensureStorageDirs(winId);
    return true;
  });

  ipcMain.handle('dialog:pickZip', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await showOpenDialogFor(win, {
      title: 'Select Project or Song Archive (.zip)',
      properties: ['openFile'],
      filters: [
        { name: 'Gifts & Satsang Archives (.gifts.zip, .satsang.zip, .zip)', extensions: ['gifts.zip', 'satsang.zip', 'zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    return { filePath, fileName: path.basename(filePath) };
  });

  ipcMain.handle('window:openNew', async (_event, params?: { initialZipPath?: string; isNewProject?: boolean }) => {
    createMainWindow(params);
    return true;
  });

  ipcMain.handle('window:getInitialData', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const data = initialDataByWindowId.get(win.id) ?? null;
    initialDataByWindowId.delete(win.id);
    return data;
  });

  ipcMain.handle('window:confirmClose', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      closingAllowedWindows.add(win.id);
      win.close();
    }
    return true;
  });

  ipcMain.handle('assets:list', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    await ensureStorageDirs(winId);
    const assets: MediaAsset[] = [];

    const bgFiles = await fsp.readdir(getBackgroundsDir(winId), { withFileTypes: true }).catch(() => []);
    for (const f of bgFiles) {
      if (!f.isFile()) continue;
      const ext = path.extname(f.name).toLowerCase();
      const kind = ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'image';
      const prefix = winId && winId > 1 ? `windows/win-${winId}/` : '';
      assets.push({
        id: `bg-${f.name}`,
        name: f.name,
        kind,
        relativePath: `${prefix}assets/backgrounds/${f.name}`,
      });
    }

    const fontFiles = await fsp.readdir(getFontsDir(winId), { withFileTypes: true }).catch(() => []);
    for (const f of fontFiles) {
      if (!f.isFile()) continue;
      const base = path.basename(f.name, path.extname(f.name));
      const prefix = winId && winId > 1 ? `windows/win-${winId}/` : '';
      assets.push({
        id: `font-${f.name}`,
        name: f.name,
        kind: 'font',
        relativePath: `${prefix}assets/fonts/${f.name}`,
        fontFamily: `SatsangFont_${sanitizeFileSlug(base)}`,
      });
    }

    return assets;
  });

  ipcMain.handle('assets:importBackground', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    await ensureStorageDirs(winId);
    const res = await showOpenDialogFor(win, {
      title: 'Import Background Image or Looping Video',
      properties: ['openFile'],
      filters: [
        { name: 'Images & Videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov'] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const src = res.filePaths[0];
    const ext = path.extname(src).toLowerCase();
    const safeName = `${sanitizeFileSlug(path.basename(src, ext))}_${Date.now().toString(36)}${ext}`;
    const dest = path.join(getBackgroundsDir(winId), safeName);
    await fsp.copyFile(src, dest);
    const kind = ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'image';
    const prefix = winId && winId > 1 ? `windows/win-${winId}/` : '';
    return {
      id: `bg-${safeName}`,
      name: safeName,
      kind,
      relativePath: `${prefix}assets/backgrounds/${safeName}`,
    } satisfies MediaAsset;
  });

  ipcMain.handle('assets:importFont', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const winId = win?.id;
    await ensureStorageDirs(winId);
    const res = await showOpenDialogFor(win, {
      title: 'Import Custom Stage Font (.ttf / .otf)',
      properties: ['openFile'],
      filters: [{ name: 'Fonts', extensions: ['ttf', 'otf'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const src = res.filePaths[0];
    const ext = path.extname(src).toLowerCase();
    const baseSlug = sanitizeFileSlug(path.basename(src, ext));
    const safeName = `${baseSlug}_${Date.now().toString(36)}${ext}`;
    const dest = path.join(getFontsDir(winId), safeName);
    await fsp.copyFile(src, dest);
    const fontFamily = `SatsangFont_${baseSlug}`;
    const prefix = winId && winId > 1 ? `windows/win-${winId}/` : '';
    return {
      id: `font-${safeName}`,
      name: safeName,
      kind: 'font',
      relativePath: `${prefix}assets/fonts/${safeName}`,
      fontFamily,
    } satisfies MediaAsset;
  });

  ipcMain.handle('settings:get', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return readSettingsFromDisk(win?.id);
  });

  ipcMain.handle('settings:save', async (event, settings: AppSettings) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return writeSettingsToDisk(settings, win?.id);
  });

  ipcMain.handle(
    'align:elevenlabs',
    async (
      _event,
      params: { audioRelativePath: string; rawLyrics: string; apiKey: string },
    ) => {
      if (!params.apiKey.trim()) {
        throw new Error('ElevenLabs API key is required for API Forced Alignment.');
      }
      const audioFullPath = resolveSafeStoragePath(params.audioRelativePath);
      const audioBytes = await fsp.readFile(audioFullPath);
      const form = new FormData();
      form.append('file', new Blob([audioBytes]), path.basename(audioFullPath));
      form.append('text', params.rawLyrics);

      const response = await fetch('https://api.elevenlabs.io/v1/forced-alignment', {
        method: 'POST',
        headers: {
          'xi-api-key': params.apiKey.trim(),
        },
        body: form,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(`Forced Alignment API error (${response.status}): ${bodyText}`);
      }

      const data = await response.json();
      const words = extractWordsFromGenericJson(data);
      if (words.length === 0) {
        throw new Error('Forced Alignment API returned no word timestamps.');
      }
      return words;
    },
  );

  ipcMain.handle(
    'align:localCli',
    async (
      _event,
      params: { audioRelativePath: string; rawLyrics: string; commandTemplate: string },
    ) => {
      if (!params.commandTemplate.trim()) {
        throw new Error('Local CLI forced aligner command is empty. Configure it in Settings.');
      }
      const audioFullPath = resolveSafeStoragePath(params.audioRelativePath);
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'satsang-align-'));
      const lyricsFile = path.join(tmpDir, 'lyrics.txt');
      const outJsonFile = path.join(tmpDir, 'alignment.json');
      await fsp.writeFile(lyricsFile, params.rawLyrics, 'utf-8');

      try {
        const cmd = params.commandTemplate
          .replace(/\{audio\}/g, audioFullPath)
          .replace(/\{lyrics\}/g, lyricsFile)
          .replace(/\{out\}/g, outJsonFile);

        const { stdout } = await execAsync(cmd, { maxBuffer: 25 * 1024 * 1024 });

        let jsonData: unknown = null;
        if (fs.existsSync(outJsonFile)) {
          jsonData = JSON.parse(await fsp.readFile(outJsonFile, 'utf-8'));
        } else if (fs.existsSync(`${audioFullPath}.json`)) {
          // whisper.cpp -oj writes <audio>.json
          jsonData = JSON.parse(await fsp.readFile(`${audioFullPath}.json`, 'utf-8'));
        } else if (stdout.trim().startsWith('{') || stdout.trim().startsWith('[')) {
          jsonData = JSON.parse(stdout.trim());
        }

        const words = extractWordsFromGenericJson(jsonData);
        if (words.length === 0) {
          throw new Error(
            'Local CLI ran but produced no parseable word timestamps ({ words: [...] } or whisper.cpp JSON).',
          );
        }
        return words;
      } finally {
        await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  );

  ipcMain.handle('app:info', () => ({
    platform: process.platform,
    userDataDir: getStorageRoot(),
    powerSaveActive: powerSaveId !== null && powerSaveBlocker.isStarted(powerSaveId),
  }));
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('org.gifts.presenter');
  }
  await ensureStorageDirs();
  registerMediaProtocol();
  registerIpcHandlers();

  // Stage Safety: prevent display sleep while the Satsang Console is running
  powerSaveId = powerSaveBlocker.start('prevent-display-sleep');

  screen.on('display-added', broadcastDisplays);
  screen.on('display-removed', broadcastDisplays);
  screen.on('display-metrics-changed', broadcastDisplays);

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (powerSaveId !== null && powerSaveBlocker.isStarted(powerSaveId)) {
    powerSaveBlocker.stop(powerSaveId);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
