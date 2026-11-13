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
import { splitRawLyrics } from '../src/shared/lrc';
import {
  DEFAULT_STYLE_CONFIG,
  normalizeGeminiModel,
  type AlignedWord,
  type AppSettings,
  type DisplayInfo,
  type GeminiAlignedLine,
  type GeminiAlignModel,
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
let outputWindow: BrowserWindow | null = null;
let powerSaveId: number | null = null;
let latestPresentationPayload: PresentationPayload | null = null;

function getStorageRoot(): string {
  return path.join(app.getPath('userData'), 'satsang-presenter');
}

function getSongsDir(): string {
  return path.join(getStorageRoot(), 'songs');
}

function getBackgroundsDir(): string {
  return path.join(getStorageRoot(), 'assets', 'backgrounds');
}

function getFontsDir(): string {
  return path.join(getStorageRoot(), 'assets', 'fonts');
}

function getSettingsPath(): string {
  return path.join(getStorageRoot(), 'settings.json');
}

async function ensureStorageDirs(): Promise<void> {
  await fsp.mkdir(getSongsDir(), { recursive: true });
  await fsp.mkdir(getBackgroundsDir(), { recursive: true });
  await fsp.mkdir(getFontsDir(), { recursive: true });
}

function resolveSafeStoragePath(relativePath: string): string {
  const root = path.resolve(getStorageRoot());
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(root, cleaned);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
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
  const externals = screen.getAllDisplays().filter(
    (d) => d.id !== primary.id || d.bounds.x !== 0 || d.bounds.y !== 0,
  );
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

function createMainWindow(): void {
  nativeTheme.themeSource = 'dark';
  const primary = screen.getPrimaryDisplay();
  const iconPath = getAppIconPath();
  mainWindow = new BrowserWindow({
    width: Math.min(1480, primary.workAreaSize.width),
    height: Math.min(920, primary.workAreaSize.height),
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#08090c',
    title: 'Gifts Presenter',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0b0d13',
      symbolColor: '#f1f5f9',
      height: 38,
    },
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (iconPath && mainWindow) {
    mainWindow.setIcon(iconPath);
  }

  const target = getRendererEntryUrl();
  if (target.devUrl) {
    mainWindow.loadURL(target.devUrl);
  } else if (target.filePath) {
    mainWindow.loadFile(target.filePath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.close();
      outputWindow = null;
    }
  });
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
  if (externalDisplay) {
    outputWindow = new BrowserWindow({
      x: externalDisplay.bounds.x,
      y: externalDisplay.bounds.y,
      width: externalDisplay.bounds.width,
      height: externalDisplay.bounds.height,
      frame: false,
      titleBarStyle: 'hidden',
      fullscreen: true,
      simpleFullscreen: true,
      kiosk: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      backgroundColor: '#000000',
      icon: iconPath,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('presentation:closed');
    }
  });

  return { isPreviewFallback };
}

function configureOutputWindowDisplay(
  win: BrowserWindow,
  externalDisplay: Electron.Display | null,
): void {
  if (externalDisplay) {
    win.setBounds(externalDisplay.bounds);
    if (!win.isFullScreen()) {
      win.setFullScreen(true);
    }
    win.setKiosk(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.webContents.insertCSS('* { cursor: none !important; }').catch(() => {});
  } else {
    win.setKiosk(false);
    if (win.isFullScreen()) {
      win.setFullScreen(false);
    }
    win.setAspectRatio(16 / 9);
  }
}

function broadcastDisplays(): void {
  const displays = getAllDisplayInfos();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('displays:changed', displays);
  }
  if (outputWindow && !outputWindow.isDestroyed() && latestPresentationPayload?.isPresenting) {
    const ext = pickTargetExternalDisplay(null);
    const isPreviewFallback = ext === null;
    configureOutputWindowDisplay(outputWindow, ext);
    latestPresentationPayload = { ...latestPresentationPayload, isPreviewFallback };
    outputWindow.webContents.send('presentation:update', latestPresentationPayload);
  }
}

async function listAllSongs(): Promise<SongPackage[]> {
  await ensureStorageDirs();
  const songsDir = getSongsDir();
  const entries = await fsp.readdir(songsDir, { withFileTypes: true });
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

  songs.sort((a, b) => a.title.localeCompare(b.title));
  return songs;
}

async function saveSongToDisk(song: SongPackage): Promise<SongPackage> {
  await ensureStorageDirs();
  const songDir = path.join(getSongsDir(), song.id);
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

async function readSettingsFromDisk(): Promise<AppSettings> {
  const defaults: AppSettings = {
    audioSinkId: '',
    preferredDisplayId: null,
    elevenLabsApiKey: '',
    localAlignerCommand: '',
    geminiApiKey: '',
    geminiModel: 'gemini-3.8-flash',
  };
  try {
    const raw = await fsp.readFile(getSettingsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...defaults,
      ...parsed,
      geminiModel: normalizeGeminiModel(parsed.geminiModel),
    } satisfies AppSettings;
  } catch {
    return defaults;
  }
}

async function writeSettingsToDisk(settings: AppSettings): Promise<AppSettings> {
  await ensureStorageDirs();
  await fsp.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
  return settings;
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

  ipcMain.handle('presentation:getLatest', () => latestPresentationPayload);

  ipcMain.handle('songs:list', () => listAllSongs());

  ipcMain.handle(
    'songs:create',
    async (
      _event,
      input: {
        title: string;
        audioSourcePath: string;
        rawLyrics: string;
        duration: number;
        syncedLines?: SongPackage['syncedLines'];
        styleConfig?: SongPackage['styleConfig'];
      },
    ) => {
      await ensureStorageDirs();
      const id = `song-${randomUUID().slice(0, 8)}`;
      const songDir = path.join(getSongsDir(), id);
      await fsp.mkdir(songDir, { recursive: true });

      const ext = path.extname(input.audioSourcePath).toLowerCase() || '.mp3';
      const audioDestName = `audio${ext}`;
      const audioDestPath = path.join(songDir, audioDestName);
      await fsp.copyFile(input.audioSourcePath, audioDestPath);

      const song: SongPackage = {
        id,
        title: input.title.trim() || path.basename(input.audioSourcePath, ext),
        audioPath: `songs/${id}/${audioDestName}`,
        duration: input.duration || 0,
        rawLyrics: input.rawLyrics ?? '',
        syncedLines: normalizeSyncedLines(input.syncedLines ?? [], input.duration || undefined),
        styleConfig: { ...DEFAULT_STYLE_CONFIG, ...(input.styleConfig ?? {}) },
        globalOffsetSeconds: 0,
      };
      return saveSongToDisk(song);
    },
  );

  ipcMain.handle('songs:save', (_event, song: SongPackage) => saveSongToDisk(song));

  ipcMain.handle('songs:createDemo', async () => {
    await ensureStorageDirs();
    const id = `song-demo-${randomUUID().slice(0, 6)}`;
    const songDir = path.join(getSongsDir(), id);
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
      // Gentle tanpura drone below 300Hz
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

    const audioRel = `songs/${id}/audio.wav`;
    await fsp.writeFile(resolveSafeStoragePath(audioRel), wav);

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

    return saveSongToDisk(demoSong);
  });

  ipcMain.handle('songs:delete', async (_event, songId: string) => {
    const safeDir = resolveSafeStoragePath(`songs/${songId}`);
    await fsp.rm(safeDir, { recursive: true, force: true });
  });

  ipcMain.handle('songs:pickAudio', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Select Satsang Audio Track',
      properties: ['openFile'],
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'm4a'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    return { filePath, fileName: path.basename(filePath) };
  });

  ipcMain.handle('media:readBuffer', async (_event, relativePath: string) => {
    const fullPath = resolveSafeStoragePath(relativePath);
    const buf = await fsp.readFile(fullPath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });

  ipcMain.handle('lrc:importDialog', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Import Standard .LRC Timecode File',
      properties: ['openFile'],
      filters: [{ name: 'LRC Lyric Timecodes', extensions: ['lrc', 'txt'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    const content = await fsp.readFile(filePath, 'utf-8');
    return { content, fileName: path.basename(filePath) };
  });

  ipcMain.handle('lrc:exportDialog', async (_event, defaultName: string, content: string) => {
    const res = await dialog.showSaveDialog({
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
      _event,
      defaultName: string,
      content: string,
      extension: string,
      filterName: string,
    ) => {
      const ext = extension.replace(/^\.+/, '');
      const res = await dialog.showSaveDialog({
        title: `Export ${filterName}`,
        defaultPath: `${sanitizeFileSlug(defaultName)}.${ext}`,
        filters: [{ name: filterName, extensions: [ext] }],
      });
      if (res.canceled || !res.filePath) return false;
      await fsp.writeFile(res.filePath, content, 'utf-8');
      return true;
    },
  );

  ipcMain.handle('bundle:export', async (_event, songId: string) => {
    const songDir = resolveSafeStoragePath(`songs/${songId}`);
    const songJsonPath = path.join(songDir, 'song.json');
    const raw = await fsp.readFile(songJsonPath, 'utf-8');
    const song = JSON.parse(raw) as SongPackage;

    const saveRes = await dialog.showSaveDialog({
      title: 'Export Portable .satsang.zip Bundle',
      defaultPath: `${sanitizeFileSlug(song.title)}.satsang.zip`,
      filters: [{ name: 'Satsang Song Bundle', extensions: ['satsang.zip', 'zip'] }],
    });
    if (saveRes.canceled || !saveRes.filePath) {
      return { canceled: true };
    }

    const zip = new JSZip();
    const audioFullPath = resolveSafeStoragePath(song.audioPath);
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
        const bgFull = resolveSafeStoragePath(song.styleConfig.backgroundSrc);
        const bgName = path.basename(bgFull);
        zip.file(`assets/${bgName}`, await fsp.readFile(bgFull));
        bundledSong.styleConfig.backgroundSrc = `assets/${bgName}`;
      } catch {
        // Keep reference as-is if missing
      }
    }

    if (song.styleConfig.fontAssetPath) {
      try {
        const fontFull = resolveSafeStoragePath(song.styleConfig.fontAssetPath);
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

  ipcMain.handle('bundle:import', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Import Portable .satsang.zip Bundle',
      properties: ['openFile'],
      filters: [{ name: 'Satsang Song Bundle', extensions: ['zip'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;

    const bytes = await fsp.readFile(res.filePaths[0]);
    const zip = await JSZip.loadAsync(bytes);
    const manifestFile = zip.file('manifest.json') ?? zip.file('song.json');
    if (!manifestFile) {
      throw new Error('Invalid .satsang.zip bundle: missing manifest.json');
    }

    const manifest = JSON.parse(await manifestFile.async('string')) as SongPackage;
    const newId = `song-${randomUUID().slice(0, 8)}`;
    const songDir = path.join(getSongsDir(), newId);
    await fsp.mkdir(path.join(songDir, 'assets'), { recursive: true });

    const audioZipEntryName = manifest.audioPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const audioEntry = zip.file(audioZipEntryName);
    if (!audioEntry) {
      throw new Error(`Bundle missing audio entry: ${audioZipEntryName}`);
    }
    const audioExt = path.extname(audioZipEntryName) || '.mp3';
    const destAudioRel = `songs/${newId}/audio${audioExt}`;
    await fsp.writeFile(resolveSafeStoragePath(destAudioRel), await audioEntry.async('nodebuffer'));

    const nextStyle = { ...DEFAULT_STYLE_CONFIG, ...manifest.styleConfig };

    if (
      (nextStyle.backgroundType === 'image' || nextStyle.backgroundType === 'video') &&
      nextStyle.backgroundSrc
    ) {
      const bgEntryName = nextStyle.backgroundSrc.replace(/\\/g, '/').replace(/^\/+/, '');
      const bgEntry = zip.file(bgEntryName);
      if (bgEntry) {
        const safeBgName = path.basename(bgEntryName);
        const destBgRel = `songs/${newId}/assets/${safeBgName}`;
        await fsp.writeFile(resolveSafeStoragePath(destBgRel), await bgEntry.async('nodebuffer'));
        nextStyle.backgroundSrc = destBgRel;
      }
    }

    if (nextStyle.fontAssetPath) {
      const fontEntryName = nextStyle.fontAssetPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const fontEntry = zip.file(fontEntryName);
      if (fontEntry) {
        const safeFontName = path.basename(fontEntryName);
        const destFontRel = `songs/${newId}/assets/${safeFontName}`;
        await fsp.writeFile(resolveSafeStoragePath(destFontRel), await fontEntry.async('nodebuffer'));
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

    return saveSongToDisk(importedSong);
  });

  ipcMain.handle('project:export', async () => {
    const songs = await listAllSongs();
    const settings = await readSettingsFromDisk();

    const saveRes = await dialog.showSaveDialog({
      title: 'Export Full Gifts Presenter Project Backup',
      defaultPath: `Gifts_Project_${new Date().toISOString().slice(0, 10)}.gifts.zip`,
      filters: [{ name: 'Gifts Presenter Project (.gifts.zip)', extensions: ['gifts.zip', 'zip'] }],
    });
    if (saveRes.canceled || !saveRes.filePath) {
      return { canceled: true };
    }

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
        const audioFull = resolveSafeStoragePath(song.audioPath);
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
          const bgFull = resolveSafeStoragePath(song.styleConfig.backgroundSrc);
          const bgName = path.basename(bgFull);
          const zipBgPath = `songs/${song.id}/assets/${bgName}`;
          zip.file(zipBgPath, await fsp.readFile(bgFull));
          bundledSong.styleConfig.backgroundSrc = zipBgPath;
        } catch {}
      }

      if (song.styleConfig.fontAssetPath) {
        try {
          const fontFull = resolveSafeStoragePath(song.styleConfig.fontAssetPath);
          const fontName = path.basename(fontFull);
          const zipFontPath = `songs/${song.id}/assets/${fontName}`;
          zip.file(zipFontPath, await fsp.readFile(fontFull));
          bundledSong.styleConfig.fontAssetPath = zipFontPath;
        } catch {}
      }

      projectManifest.songs.push(bundledSong);
    }

    zip.file('project.json', JSON.stringify(projectManifest, null, 2));
    const zipBytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await fsp.writeFile(saveRes.filePath, zipBytes);
    return { canceled: false, filePath: saveRes.filePath, songCount: songs.length };
  });

  ipcMain.handle('project:import', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Import Full Gifts Presenter Project Backup',
      properties: ['openFile'],
      filters: [{ name: 'Gifts Presenter Project (.gifts.zip)', extensions: ['gifts.zip', 'zip'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;

    const bytes = await fsp.readFile(res.filePaths[0]);
    const zip = await JSZip.loadAsync(bytes);
    const projectJsonFile = zip.file('project.json');
    if (!projectJsonFile) {
      throw new Error('Invalid project file: missing project.json manifest');
    }

    const projectData = JSON.parse(await projectJsonFile.async('string'));
    const importedSongs: SongPackage[] = [];

    for (const song of projectData.songs || []) {
      const newId = song.id || `song-${randomUUID().slice(0, 8)}`;
      const songDir = path.join(getSongsDir(), newId);
      await fsp.mkdir(path.join(songDir, 'assets'), { recursive: true });

      const audioZipName = song.audioPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const audioEntry = zip.file(audioZipName);
      let destAudioRel = song.audioPath;
      if (audioEntry) {
        const audioExt = path.extname(audioZipName) || '.mp3';
        destAudioRel = `songs/${newId}/audio${audioExt}`;
        await fsp.writeFile(resolveSafeStoragePath(destAudioRel), await audioEntry.async('nodebuffer'));
      }

      const nextStyle = { ...DEFAULT_STYLE_CONFIG, ...song.styleConfig };
      if (nextStyle.backgroundSrc && !nextStyle.backgroundSrc.startsWith('http')) {
        const bgZipName = nextStyle.backgroundSrc.replace(/\\/g, '/').replace(/^\/+/, '');
        const bgEntry = zip.file(bgZipName);
        if (bgEntry) {
          const bgName = path.basename(bgZipName);
          const destBgRel = `songs/${newId}/assets/${bgName}`;
          await fsp.writeFile(resolveSafeStoragePath(destBgRel), await bgEntry.async('nodebuffer'));
          nextStyle.backgroundSrc = destBgRel;
        }
      }

      if (nextStyle.fontAssetPath) {
        const fontZipName = nextStyle.fontAssetPath.replace(/\\/g, '/').replace(/^\/+/, '');
        const fontEntry = zip.file(fontZipName);
        if (fontEntry) {
          const fontName = path.basename(fontZipName);
          const destFontRel = `songs/${newId}/assets/${fontName}`;
          await fsp.writeFile(resolveSafeStoragePath(destFontRel), await fontEntry.async('nodebuffer'));
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

      await saveSongToDisk(importedSong);
      importedSongs.push(importedSong);
    }

    if (projectData.settings) {
      await writeSettingsToDisk(projectData.settings);
    }

    return { importedCount: importedSongs.length, songs: await listAllSongs() };
  });

  ipcMain.handle('assets:list', async () => {
    await ensureStorageDirs();
    const assets: MediaAsset[] = [];

    const bgFiles = await fsp.readdir(getBackgroundsDir(), { withFileTypes: true });
    for (const f of bgFiles) {
      if (!f.isFile()) continue;
      const ext = path.extname(f.name).toLowerCase();
      const kind = ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'image';
      assets.push({
        id: `bg-${f.name}`,
        name: f.name,
        kind,
        relativePath: `assets/backgrounds/${f.name}`,
      });
    }

    const fontFiles = await fsp.readdir(getFontsDir(), { withFileTypes: true });
    for (const f of fontFiles) {
      if (!f.isFile()) continue;
      const base = path.basename(f.name, path.extname(f.name));
      assets.push({
        id: `font-${f.name}`,
        name: f.name,
        kind: 'font',
        relativePath: `assets/fonts/${f.name}`,
        fontFamily: `SatsangFont_${sanitizeFileSlug(base)}`,
      });
    }

    return assets;
  });

  ipcMain.handle('assets:importBackground', async () => {
    await ensureStorageDirs();
    const res = await dialog.showOpenDialog({
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
    const dest = path.join(getBackgroundsDir(), safeName);
    await fsp.copyFile(src, dest);
    const kind = ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'image';
    return {
      id: `bg-${safeName}`,
      name: safeName,
      kind,
      relativePath: `assets/backgrounds/${safeName}`,
    } satisfies MediaAsset;
  });

  ipcMain.handle('assets:importFont', async () => {
    await ensureStorageDirs();
    const res = await dialog.showOpenDialog({
      title: 'Import Custom Stage Font (.ttf / .otf)',
      properties: ['openFile'],
      filters: [{ name: 'Fonts', extensions: ['ttf', 'otf'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const src = res.filePaths[0];
    const ext = path.extname(src).toLowerCase();
    const baseSlug = sanitizeFileSlug(path.basename(src, ext));
    const safeName = `${baseSlug}_${Date.now().toString(36)}${ext}`;
    const dest = path.join(getFontsDir(), safeName);
    await fsp.copyFile(src, dest);
    const fontFamily = `SatsangFont_${baseSlug}`;
    return {
      id: `font-${safeName}`,
      name: safeName,
      kind: 'font',
      relativePath: `assets/fonts/${safeName}`,
      fontFamily,
    } satisfies MediaAsset;
  });

  ipcMain.handle('settings:get', async () => {
    return readSettingsFromDisk();
  });

  ipcMain.handle('settings:save', async (_event, settings: AppSettings) => {
    return writeSettingsToDisk(settings);
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

  ipcMain.handle(
    'align:gemini',
    async (
      _event,
      params: {
        audioRelativePath: string;
        rawLyrics: string;
        durationSec: number;
        apiKey: string;
        model: GeminiAlignModel;
      },
    ): Promise<GeminiAlignedLine[]> => {
      const apiKey = params.apiKey.trim();
      if (!apiKey) {
        throw new Error('Gemini API key is required for Gemini Audio Alignment.');
      }

      const lines = splitRawLyrics(params.rawLyrics);
      if (lines.length === 0) {
        throw new Error('No lyric lines provided to align.');
      }

      const audioFullPath = resolveSafeStoragePath(params.audioRelativePath);
      const audioBytes = await fsp.readFile(audioFullPath);
      const mimeType = getMimeType(audioFullPath);
      const model = normalizeGeminiModel(params.model);

      const numberedLyrics = lines.map((line, i) => `[${i}] ${line}`).join('\n');
      const durationInfo =
        params.durationSec > 0
          ? `Total audio duration is ${params.durationSec.toFixed(2)} seconds.`
          : '';

      const promptText = [
        'You are a precision audio-to-lyric timecode aligner for live Satsang music presentations.',
        durationInfo,
        `There are ${lines.length} lyric lines numbered [0] through [${lines.length - 1}].`,
        'Listen carefully to the vocal singing/chanting in the audio from start to finish.',
        'For EVERY line index from 0 to ' + (lines.length - 1) + ':',
        '- startSec: exact timestamp in decimal seconds (e.g. 14.32) when the vocalist begins singing the first syllable of that line.',
        '- endSec: exact timestamp in decimal seconds when the vocalist finishes singing the last syllable of that line.',
        'Ignore instrumental intros, solo alaaps without lyrics, and harmonium/tabla interludes between verses.',
        'Ensure timestamps are strictly chronological (startSec[i] <= endSec[i], and startSec[i+1] >= startSec[i]).',
        'Return every index 0..' + (lines.length - 1) + ' in the JSON alignments array.',
        '',
        'LYRICS:',
        numberedLyrics,
      ].join('\n');

      let uploadedFileName: string | null = null;
      try {
        let audioPart: Record<string, unknown>;

        if (audioBytes.byteLength <= 12 * 1024 * 1024) {
          audioPart = {
            inlineData: {
              mimeType,
              data: audioBytes.toString('base64'),
            },
          };
        } else {
          // Resumable upload via Gemini Files API for large WAV / FLAC tracks
          const startUploadRes = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': String(audioBytes.byteLength),
                'X-Goog-Upload-Header-Content-Type': mimeType,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                file: { display_name: path.basename(audioFullPath) },
              }),
            },
          );
          if (!startUploadRes.ok) {
            throw new Error(`Gemini File Upload init failed (${startUploadRes.status}): ${await startUploadRes.text()}`);
          }
          const uploadUrl = startUploadRes.headers.get('x-goog-upload-url');
          if (!uploadUrl) {
            throw new Error('Gemini File Upload did not return x-goog-upload-url.');
          }

          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': String(audioBytes.byteLength),
              'X-Goog-Upload-Offset': '0',
              'X-Goog-Upload-Command': 'upload, finalize',
            },
            body: audioBytes,
          });
          if (!uploadRes.ok) {
            throw new Error(`Gemini File Upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
          }
          const uploadJson = (await uploadRes.json()) as {
            file?: { name?: string; uri?: string; state?: string; mimeType?: string };
          };
          const fileMeta = uploadJson.file;
          if (!fileMeta?.uri || !fileMeta?.name) {
            throw new Error('Gemini File Upload returned invalid file metadata.');
          }
          uploadedFileName = fileMeta.name;

          // Poll until ACTIVE
          let state = fileMeta.state ?? 'PROCESSING';
          for (let attempt = 0; attempt < 30 && state === 'PROCESSING'; attempt++) {
            await new Promise((r) => setTimeout(r, 1000));
            const statusRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${encodeURIComponent(apiKey)}`,
            );
            if (statusRes.ok) {
              const statusJson = (await statusRes.json()) as { state?: string };
              state = statusJson.state ?? state;
            }
          }
          if (state !== 'ACTIVE') {
            throw new Error(`Gemini uploaded audio did not become ACTIVE (state=${state}).`);
          }

          audioPart = {
            fileData: {
              mimeType: fileMeta.mimeType || mimeType,
              fileUri: fileMeta.uri,
            },
          };
        }

        const genRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [audioPart, { text: promptText }],
                },
              ],
              generationConfig: {
                temperature: 0,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: 'OBJECT',
                  properties: {
                    alignments: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          index: { type: 'INTEGER' },
                          startSec: { type: 'NUMBER' },
                          endSec: { type: 'NUMBER' },
                        },
                        required: ['index', 'startSec', 'endSec'],
                      },
                    },
                  },
                  required: ['alignments'],
                },
              },
            }),
          },
        );

        if (!genRes.ok) {
          const errText = await genRes.text().catch(() => '');
          throw new Error(`Gemini API error (${genRes.status}): ${errText}`);
        }

        const genJson = (await genRes.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };

        const rawText = genJson.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          throw new Error('Gemini API returned empty alignment response.');
        }

        const parsed = JSON.parse(rawText) as { alignments?: GeminiAlignedLine[] };
        if (!Array.isArray(parsed.alignments) || parsed.alignments.length === 0) {
          throw new Error('Gemini API returned no alignment entries.');
        }

        return parsed.alignments;
      } finally {
        if (uploadedFileName) {
          fetch(
            `https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${encodeURIComponent(apiKey)}`,
            { method: 'DELETE' },
          ).catch(() => {});
        }
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
