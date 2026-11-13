import type { SyncedLine } from './types';
import { normalizeSyncedLines } from './binarySearch';
import { splitRawLyrics } from './lrc';

function cleanNorm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function makeId(idx: number): string {
  return `line-${idx}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Anchor {
  newIdx: number;
  startTime: number;
  endTime: number;
  id: string;
}

/**
 * Intelligently reconciles existing synced lines with newly entered raw lyrics.
 * 
 * 1. If line counts match exactly, preserves timestamps 1:1 (handles typo fixes).
 * 2. If line counts differ (e.g. user pasted full song lyrics replacing partial lines),
 *    uses monotonic sequence alignment on lyric text so previously synced verses
 *    retain their precise audio timestamps without getting mapped to wrong verses.
 * 3. Unmatched lines between anchors are smoothly interpolated within their audio gap,
 *    preventing verse collapsing, timestamp inversion, or lines disappearing from waveform.
 */
export function reconcileSyncedLinesWithRawLyrics(
  existingLines: readonly SyncedLine[],
  newRawLyrics: string,
  totalDuration?: number,
): SyncedLine[] {
  const newTexts = splitRawLyrics(newRawLyrics);
  if (newTexts.length === 0) return [];

  const maxDur =
    totalDuration && totalDuration > 0
      ? totalDuration
      : Math.max(10, newTexts.length * 4);

  // If no existing synced lines, create initial uniform distribution
  if (!existingLines || existingLines.length === 0) {
    const slot = maxDur / Math.max(1, newTexts.length);
    const initial: SyncedLine[] = newTexts.map((text, idx) => ({
      id: makeId(idx),
      index: idx,
      startTime: Number((idx * slot).toFixed(3)),
      endTime: Number(((idx + 1) * slot).toFixed(3)),
      text,
    }));
    return normalizeSyncedLines(initial, maxDur);
  }

  // Exact 1:1 count preservation (e.g. user corrected a spelling error without adding/removing lines)
  if (existingLines.length === newTexts.length) {
    const direct: SyncedLine[] = newTexts.map((text, idx) => {
      const ex = existingLines[idx];
      return {
        id: ex.id || makeId(idx),
        index: idx,
        startTime: ex.startTime,
        endTime: Math.max(ex.startTime + 0.1, ex.endTime),
        text,
      };
    });
    return normalizeSyncedLines(direct, maxDur);
  }

  // Monotonic forward alignment between existingLines and newTexts
  const cleanExisting = existingLines.map((l) => cleanNorm(l.text));
  const cleanNew = newTexts.map((t) => cleanNorm(t));

  const matchedAnchors: Anchor[] = [];
  let lastNewIdx = -1;

  for (let j = 0; j < cleanExisting.length; j++) {
    const exText = cleanExisting[j];
    // Find first occurrence in newTexts strictly after lastNewIdx
    let matchIdx = -1;
    for (let i = lastNewIdx + 1; i < cleanNew.length; i++) {
      if (cleanNew[i] === exText) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx !== -1) {
      const ex = existingLines[j];
      matchedAnchors.push({
        newIdx: matchIdx,
        startTime: ex.startTime,
        endTime: Math.max(ex.startTime + 0.1, ex.endTime),
        id: ex.id,
      });
      lastNewIdx = matchIdx;
    }
  }

  // If no text matches were found, fallback to linear spacing
  if (matchedAnchors.length === 0) {
    const slot = maxDur / Math.max(1, newTexts.length);
    const fallback: SyncedLine[] = newTexts.map((text, idx) => ({
      id: makeId(idx),
      index: idx,
      startTime: Number((idx * slot).toFixed(3)),
      endTime: Number(((idx + 1) * slot).toFixed(3)),
      text,
    }));
    return normalizeSyncedLines(fallback, maxDur);
  }

  // Ensure anchor timestamps are strictly monotonic
  for (let k = 1; k < matchedAnchors.length; k++) {
    const prev = matchedAnchors[k - 1];
    const curr = matchedAnchors[k];
    if (curr.startTime < prev.endTime) {
      curr.startTime = Number((prev.endTime + 0.05).toFixed(3));
      curr.endTime = Math.max(curr.startTime + 0.1, curr.endTime);
    }
  }

  // Build the complete array of new lines, interpolating unmatched lines between anchors
  const anchorMap = new Map<number, Anchor>();
  for (const a of matchedAnchors) {
    anchorMap.set(a.newIdx, a);
  }

  const result: SyncedLine[] = new Array(newTexts.length);

  // Set all matched anchors
  for (const a of matchedAnchors) {
    result[a.newIdx] = {
      id: a.id,
      index: a.newIdx,
      startTime: a.startTime,
      endTime: a.endTime,
      text: newTexts[a.newIdx],
    };
  }

  // Interpolate gaps between anchors
  let prevAnchorEnd = 0;
  let prevAnchorIdx = -1;

  for (let aIdx = 0; aIdx <= matchedAnchors.length; aIdx++) {
    const isEnd = aIdx === matchedAnchors.length;
    const nextAnchorStart = isEnd ? maxDur : matchedAnchors[aIdx].startTime;
    const nextAnchorIdx = isEnd ? newTexts.length : matchedAnchors[aIdx].newIdx;

    const gapCount = nextAnchorIdx - prevAnchorIdx - 1;
    if (gapCount > 0) {
      const availableSpan = Math.max(gapCount * 0.5, nextAnchorStart - prevAnchorEnd);
      const step = availableSpan / (gapCount + 1);

      for (let offset = 1; offset <= gapCount; offset++) {
        const lineIdx = prevAnchorIdx + offset;
        const sTime = Number((prevAnchorEnd + offset * step).toFixed(3));
        const eTime = Number(Math.min(nextAnchorStart, sTime + step * 0.9).toFixed(3));
        result[lineIdx] = {
          id: makeId(lineIdx),
          index: lineIdx,
          startTime: sTime,
          endTime: Math.max(sTime + 0.1, eTime),
          text: newTexts[lineIdx],
        };
      }
    }

    if (!isEnd) {
      prevAnchorEnd = matchedAnchors[aIdx].endTime;
      prevAnchorIdx = matchedAnchors[aIdx].newIdx;
    }
  }

  return normalizeSyncedLines(result, maxDur);
}
