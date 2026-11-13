import type { SyncedLine } from './types';
import { normalizeSyncedLines } from './binarySearch';

export interface ParsedLrcResult {
  title?: string;
  syncedLines: SyncedLine[];
  rawLyrics: string;
}

const TIMESTAMP_TAG_RE = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG_RE = /^\[(ti|ar|al|au|by|offset|re|ve):(.*)\]$/i;

function makeLineId(index: number): string {
  return `line-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Parses a standard .lrc file into strictly sorted SyncedLine[].
 * Supports [mm:ss.xx], [mm:ss.xxx], [mm:ss], multiple timestamps per line,
 * [ti:...] title metadata, and [offset:ms] global offset.
 */
export function parseLrc(lrcContent: string, totalDuration?: number): ParsedLrcResult {
  const lines = lrcContent.replace(/\r\n?/g, '\n').split('\n');
  let title: string | undefined;
  let offsetSeconds = 0;

  const rawEntries: Array<{ startTime: number; text: string }> = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const metaMatch = trimmed.match(META_TAG_RE);
    if (metaMatch) {
      const tag = metaMatch[1].toLowerCase();
      const val = metaMatch[2].trim();
      if (tag === 'ti' && val) {
        title = val;
      } else if (tag === 'offset') {
        const ms = Number(val);
        if (Number.isFinite(ms)) {
          offsetSeconds = ms / 1000;
        }
      }
      continue;
    }

    TIMESTAMP_TAG_RE.lastIndex = 0;
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = TIMESTAMP_TAG_RE.exec(trimmed)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fracStr = match[3] ?? '0';
      const frac =
        fracStr.length === 3
          ? Number(fracStr) / 1000
          : fracStr.length === 2
            ? Number(fracStr) / 100
            : Number(fracStr) / 10;
      timestamps.push(minutes * 60 + seconds + frac);
    }

    if (timestamps.length === 0) continue;

    const text = trimmed.replace(TIMESTAMP_TAG_RE, '').trim();
    if (!text) continue;

    for (const ts of timestamps) {
      rawEntries.push({
        startTime: Math.max(0, ts + offsetSeconds),
        text,
      });
    }
  }

  rawEntries.sort((a, b) => a.startTime - b.startTime);

  const syncedLines: SyncedLine[] = rawEntries.map((entry, idx) => {
    const nextStart = rawEntries[idx + 1]?.startTime;
    const fallbackEnd =
      totalDuration && totalDuration > entry.startTime
        ? Math.min(totalDuration, entry.startTime + 6)
        : entry.startTime + 4;
    const endTime =
      nextStart !== undefined && nextStart > entry.startTime
        ? nextStart
        : Math.max(entry.startTime + 0.5, fallbackEnd);

    return {
      id: makeLineId(idx),
      index: idx,
      startTime: entry.startTime,
      endTime,
      text: entry.text,
    };
  });

  const normalized = normalizeSyncedLines(syncedLines, totalDuration);
  const rawLyrics = normalized.map((l) => l.text).join('\n');

  return {
    title,
    syncedLines: normalized,
    rawLyrics,
  };
}

export function formatLrcTimestamp(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalCentis = Math.round(safe * 100);
  const mins = Math.floor(totalCentis / 6000);
  const secs = Math.floor((totalCentis % 6000) / 100);
  const centis = totalCentis % 100;
  return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}]`;
}

export function serializeLrc(
  syncedLines: readonly SyncedLine[],
  title?: string,
): string {
  const sorted = normalizeSyncedLines(syncedLines);
  const out: string[] = [];
  if (title && title.trim()) {
    out.push(`[ti:${title.trim()}]`);
  }
  for (const line of sorted) {
    const cleanText = line.text.replace(/\s*\r?\n\s*/g, ' ').trim();
    out.push(`${formatLrcTimestamp(line.startTime)} ${cleanText}`);
  }
  return out.join('\n') + '\n';
}

function formatSrtTimestamp(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMs = Math.round(safe * 1000);
  const hrs = Math.floor(totalMs / 3600000);
  const remMs = totalMs % 3600000;
  const mins = Math.floor(remMs / 60000);
  const remSecsMs = remMs % 60000;
  const secs = Math.floor(remSecsMs / 1000);
  const ms = remSecsMs % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Serializes synced lyric lines into standard SubRip (.srt) subtitle format for video editors (Premiere, DaVinci, Final Cut).
 */
export function serializeSrt(syncedLines: readonly SyncedLine[]): string {
  const sorted = normalizeSyncedLines(syncedLines);
  const blocks: string[] = [];
  sorted.forEach((line, idx) => {
    const start = formatSrtTimestamp(line.startTime);
    const end = formatSrtTimestamp(Math.max(line.startTime + 0.1, line.endTime));
    blocks.push(`${idx + 1}\r\n${start} --> ${end}\r\n${line.text.trim()}\r\n`);
  });
  return blocks.join('\r\n');
}

function formatVttTimestamp(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMs = Math.round(safe * 1000);
  const hrs = Math.floor(totalMs / 3600000);
  const remMs = totalMs % 3600000;
  const mins = Math.floor(remMs / 60000);
  const remSecsMs = remMs % 60000;
  const secs = Math.floor(remSecsMs / 1000);
  const ms = remSecsMs % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Serializes synced lyric lines into WebVTT (.vtt) format for web players.
 */
export function serializeVtt(syncedLines: readonly SyncedLine[]): string {
  const sorted = normalizeSyncedLines(syncedLines);
  const blocks: string[] = ['WEBVTT\n'];
  sorted.forEach((line, idx) => {
    const start = formatVttTimestamp(line.startTime);
    const end = formatVttTimestamp(Math.max(line.startTime + 0.1, line.endTime));
    blocks.push(`${idx + 1}\n${start} --> ${end}\n${line.text.trim()}\n`);
  });
  return blocks.join('\n');
}

/**
 * Splits raw multi-line lyrics into clean non-empty lines while preserving intentional phrasing.
 */
export function splitRawLyrics(rawLyrics: string): string[] {
  return rawLyrics
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

