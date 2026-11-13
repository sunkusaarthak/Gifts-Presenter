import type { SyncedLine } from './types';

/**
 * Deterministic O(log N) binary search over syncedLines (sorted ascending by startTime).
 * Returns the index of the active line where startTime <= currentTime < endTime,
 * or holds the most recent line (largest index with startTime <= currentTime)
 * when between verses. Returns -1 if currentTime precedes the first line.
 */
export function findActiveLineIndex(
  lines: readonly SyncedLine[],
  currentTime: number,
): number {
  const n = lines.length;
  if (n === 0 || Number.isNaN(currentTime)) {
    return -1;
  }

  if (currentTime < lines[0].startTime) {
    return -1;
  }

  let low = 0;
  let high = n - 1;
  let candidate = 0;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (lines[mid].startTime <= currentTime) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return candidate;
}

export function findActiveLine(
  lines: readonly SyncedLine[],
  currentTime: number,
): SyncedLine | null {
  const idx = findActiveLineIndex(lines, currentTime);
  return idx >= 0 ? lines[idx] : null;
}

const MUSIC_MARKER_RE = /^\[(music|instrumental|interlude|♪.*)\]$/i;

export interface StageDisplayResolution {
  activeLineIndex: number;
  activeLine: SyncedLine | null;
  isMusicInterlude: boolean;
}

/**
 * Resolves whether the stage should display a lyric line or a serene
 * instrumental music animation (during intro before first lyric, interlude gaps
 * >= interludeGapSec between verses, explicit [Music] lines, or outro).
 * Short breath gaps (< interludeGapSec) hold the current lyric without flicker.
 */
export function resolveStageDisplayState(
  lines: readonly SyncedLine[],
  currentTime: number,
  interludeGapSec = 1.8,
): StageDisplayResolution {
  if (lines.length === 0) {
    return { activeLineIndex: -1, activeLine: null, isMusicInterlude: true };
  }

  const idx = findActiveLineIndex(lines, currentTime);
  if (idx < 0) {
    // Instrumental intro before first lyric starts
    return { activeLineIndex: -1, activeLine: null, isMusicInterlude: true };
  }

  const line = lines[idx];
  if (MUSIC_MARKER_RE.test(line.text.trim())) {
    return { activeLineIndex: idx, activeLine: null, isMusicInterlude: true };
  }

  if (currentTime < line.endTime) {
    return { activeLineIndex: idx, activeLine: line, isMusicInterlude: false };
  }

  const nextLine = lines[idx + 1];
  if (nextLine) {
    const gap = nextLine.startTime - line.endTime;
    if (gap >= interludeGapSec && currentTime >= line.endTime + 0.35) {
      return { activeLineIndex: idx, activeLine: null, isMusicInterlude: true };
    }
    return { activeLineIndex: idx, activeLine: line, isMusicInterlude: false };
  }

  // After the final line finishes + brief 1.5s hold, show music animation for outro
  if (currentTime >= line.endTime + 1.5) {
    return { activeLineIndex: idx, activeLine: null, isMusicInterlude: true };
  }

  return { activeLineIndex: idx, activeLine: line, isMusicInterlude: false };
}

/**
 * Ensures syncedLines preserve canonical lyric sequence and remain strictly
 * non-decreasing by startTime for O(log N) binary search stage lookup.
 * Canonical verse sequence is preserved by line.index so lyric lines never swap places.
 */
export function normalizeSyncedLines(
  lines: readonly SyncedLine[],
  maxDuration?: number,
): SyncedLine[] {
  if (!lines || lines.length === 0) return [];

  // Sort canonically: by explicit line.index if present, or by startTime for un-indexed imports
  const ordered = [...lines].sort((a, b) => {
    if (typeof a.index === 'number' && typeof b.index === 'number' && a.index !== b.index) {
      return a.index - b.index;
    }
    return a.startTime - b.startTime || a.endTime - b.endTime;
  });

  let prevStart = 0;
  return ordered.map((line, index) => {
    const rawStart = Math.max(0, Number.isFinite(line.startTime) ? line.startTime : prevStart);
    // Enforce monotonic non-decreasing startTime along canonical verse sequence
    const monotonicStart = Math.max(prevStart, rawStart);
    const clampedStart =
      maxDuration !== undefined && maxDuration > 0
        ? Math.min(monotonicStart, maxDuration)
        : monotonicStart;

    const rawEnd = Number.isFinite(line.endTime) ? line.endTime : clampedStart + 2;
    const minEnd = Math.max(clampedStart + 0.05, rawEnd);
    const clampedEnd =
      maxDuration !== undefined && maxDuration > 0 ? Math.min(minEnd, maxDuration) : minEnd;

    prevStart = clampedStart;

    return {
      ...line,
      index,
      startTime: Number(clampedStart.toFixed(3)),
      endTime: Number(Math.max(clampedStart, clampedEnd).toFixed(3)),
    };
  });
}

