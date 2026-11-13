import type { SyncedLine } from './types';
import { splitRawLyrics } from './lrc';
import { normalizeSyncedLines } from './binarySearch';

export interface DetectedWord {
  word: string;
  norm: string;
  start: number;
  end: number;
}

/**
 * Normalizes a word token for phonetic string matching:
 * - Lowercases and trims
 * - Strips punctuation, diacritics, and special characters
 * - Collapses repeated vowels commonly stretched during singing (e.g., 'aa' -> 'a', 'ee' -> 'i', 'oo' -> 'u')
 */
export function normalizePhoneticToken(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    // Strip common punctuation & symbols across Latin & Indic scripts
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’‘।॥–—]/g, '')
    // Collapse repeated sung vowels in Romanized transliterations
    .replace(/aa+/g, 'a')
    .replace(/ee+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/ii+/g, 'i')
    .replace(/uu+/g, 'u')
    // Collapse repeated consonants
    .replace(/([b-df-hj-np-tv-z])\1+/g, '$1')
    .trim();
}

/**
 * Standard Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const al = a.length;
  const bl = b.length;
  let prevRow = new Int32Array(bl + 1);
  let curRow = new Int32Array(bl + 1);

  for (let j = 0; j <= bl; j++) prevRow[j] = j;

  for (let i = 1; i <= al; i++) {
    curRow[0] = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
      curRow[j] = Math.min(
        prevRow[j] + 1,        // deletion
        curRow[j - 1] + 1,    // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    const tmp = prevRow;
    prevRow = curRow;
    curRow = tmp;
  }
  return prevRow[bl];
}

/**
 * Normalized Levenshtein similarity (0.0 to 1.0) with a phonetic prefix bonus
 * because singers frequently stretch or modify word suffixes, but onsets remain intact.
 */
export function normalizedLevenshteinSimilarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1.0;
  if (!a.length || !b.length) return 0.0;
  if (a === b) return 1.0;

  const maxLen = Math.max(a.length, b.length);
  const dist = levenshteinDistance(a, b);
  const baseSim = 1.0 - dist / maxLen;

  // Prefix match bonus: check if first 2-3 characters match identically
  let prefixMatches = 0;
  const minLen = Math.min(a.length, b.length);
  for (let k = 0; k < minLen && k < 4; k++) {
    if (a[k] === b[k]) prefixMatches++;
    else break;
  }

  const prefixBonus = prefixMatches >= 2 ? prefixMatches * 0.06 : 0;
  return Math.min(1.0, Math.max(0.0, baseSim + prefixBonus));
}

/**
 * Aligns the user's exact lyric lines against Whisper's detected word timestamps
 * using Dynamic Programming (Needleman-Wunsch / DTW global monotonic sequence alignment).
 *
 * CRITICAL GUARANTEE: Never modifies or overwrites the user's lyric line text.
 * Only discovers the optimal [startTime, endTime] window for each line.
 */
export function alignLyricsToWhisperWords(
  rawLyrics: string,
  detectedWords: readonly DetectedWord[],
  totalDuration?: number,
): SyncedLine[] {
  const lines = splitRawLyrics(rawLyrics);
  if (lines.length === 0) return [];

  // Filter detected words to valid timestamps
  const cleanWords = detectedWords
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.norm.length > 0)
    .sort((a, b) => a.start - b.start);

  const fallbackDuration =
    totalDuration && totalDuration > 0
      ? totalDuration
      : cleanWords.length > 0
        ? cleanWords[cleanWords.length - 1].end + 2
        : lines.length * 4;

  if (cleanWords.length === 0) {
    // If Whisper detected zero speech, distribute lines evenly across duration
    const slot = fallbackDuration / lines.length;
    return lines.map((text, idx) => ({
      id: `line-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      index: idx,
      startTime: Number((idx * slot).toFixed(2)),
      endTime: Number(((idx + 1) * slot).toFixed(2)),
      text,
      confidence: 0.2,
    }));
  }

  // 1. Tokenize user lyric lines into words with tracking of their line index
  interface LyricWordToken {
    lineIdx: number;
    wordIdx: number;
    raw: string;
    norm: string;
  }

  const MUSIC_TAG_RE = /^\[.*(music|instrumental|interlude|♪).*\]$/i;

  const lyricTokens: LyricWordToken[] = [];
  lines.forEach((line, li) => {
    // Explicit instrumental music break tags do not participate in spoken word tokenization
    if (MUSIC_TAG_RE.test(line.trim())) {
      return;
    }
    const rawTokens = line.split(/\s+/).filter(Boolean);
    rawTokens.forEach((token, wi) => {
      const norm = normalizePhoneticToken(token);
      if (norm.length > 0) {
        lyricTokens.push({ lineIdx: li, wordIdx: wi, raw: token, norm });
      }
    });
  });

  if (lyricTokens.length === 0) {
    return lines.map((text, idx) => ({
      id: `line-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      index: idx,
      startTime: 0,
      endTime: fallbackDuration,
      text,
      confidence: 0.1,
    }));
  }

  // 2. Needleman-Wunsch DP Sequence Alignment
  // Dimensions: L (user lyric tokens) x W (Whisper detected words)
  const L = lyricTokens.length;
  const W = cleanWords.length;

  const GAP_USER_LYRIC = -0.45; // Cost of missing a lyric word in Whisper transcription
  const GAP_ASR_EXTRA = -0.15;  // Low penalty for Whisper detecting extraneous vocalizations/fillers

  // DP matrices
  const score = Array.from({ length: L + 1 }, () => new Float32Array(W + 1));
  const trace = Array.from({ length: L + 1 }, () => new Uint8Array(W + 1));
  // Trace codes: 1 = diagonal (match), 2 = up (skip lyric token), 3 = left (skip ASR word)

  for (let i = 1; i <= L; i++) {
    score[i][0] = score[i - 1][0] + GAP_USER_LYRIC;
    trace[i][0] = 2;
  }
  for (let j = 1; j <= W; j++) {
    // Permit un-penalized intro music / prelude before first lyric
    score[0][j] = score[0][j - 1] + GAP_ASR_EXTRA * 0.5;
    trace[0][j] = 3;
  }

  for (let i = 1; i <= L; i++) {
    const uNorm = lyricTokens[i - 1].norm;
    for (let j = 1; j <= W; j++) {
      const dNorm = cleanWords[j - 1].norm;
      const sim = normalizedLevenshteinSimilarity(uNorm, dNorm);

      // Match reward if similarity >= 0.45, otherwise mismatch penalty
      const matchScore = sim >= 0.45 ? sim * 2.8 : -0.75;

      const diag = score[i - 1][j - 1] + matchScore;
      const up = score[i - 1][j] + GAP_USER_LYRIC;
      const left = score[i][j - 1] + GAP_ASR_EXTRA;

      if (diag >= up && diag >= left) {
        score[i][j] = diag;
        trace[i][j] = 1;
      } else if (up >= left) {
        score[i][j] = up;
        trace[i][j] = 2;
      } else {
        score[i][j] = left;
        trace[i][j] = 3;
      }
    }
  }

  // 3. Backtrack to associate detected words to user lyric lines
  interface LineMatchInfo {
    matchedWords: Array<{ start: number; end: number; sim: number }>;
    totalTokens: number;
  }

  const lineMatches: LineMatchInfo[] = lines.map((l) => ({
    matchedWords: [],
    totalTokens: l.split(/\s+/).filter(Boolean).length,
  }));

  let ci = L;
  let cj = W;
  while (ci > 0 && cj > 0) {
    const dir = trace[ci][cj];
    if (dir === 1) {
      const token = lyricTokens[ci - 1];
      const word = cleanWords[cj - 1];
      const sim = normalizedLevenshteinSimilarity(token.norm, word.norm);
      if (sim >= 0.40) {
        lineMatches[token.lineIdx].matchedWords.push({
          start: word.start,
          end: Math.max(word.start + 0.1, word.end),
          sim,
        });
      }
      ci--;
      cj--;
    } else if (dir === 2) {
      ci--;
    } else {
      cj--;
    }
  }

  // Reverse matches inside each line so they are chronological
  lineMatches.forEach((lm) => lm.matchedWords.reverse());

  // 4. Identify Anchor Lines (high-confidence matches)
  interface LineBound {
    startTime: number | null;
    endTime: number | null;
    confidence: number;
    isAnchor: boolean;
  }

  const rawBounds: LineBound[] = lines.map((line, li) => {
    if (MUSIC_TAG_RE.test(line.trim())) {
      return { startTime: null, endTime: null, confidence: 1.0, isAnchor: false };
    }

    const lm = lineMatches[li];
    if (!lm || lm.matchedWords.length === 0) {
      return { startTime: null, endTime: null, confidence: 0, isAnchor: false };
    }

    const words = lm.matchedWords;
    const avgSim = words.reduce((acc, w) => acc + w.sim, 0) / words.length;
    // Ratio of matched tokens to total line tokens
    const coverage = Math.min(1.0, words.length / Math.max(1, lm.totalTokens));
    const confidence = Number((avgSim * 0.7 + coverage * 0.3).toFixed(2));

    const startTime = words[0].start;
    const endTime = Math.max(startTime + 0.5, words[words.length - 1].end);

    // Anchor criterion: confidence >= 0.45 and at least 1 reliable word match
    const isAnchor = confidence >= 0.45;
    return { startTime, endTime, confidence, isAnchor };
  });

  // 4.5. Filter out false repeating chorus anchors that violate physical singing pacing
  // E.g., Line 40 cannot physically occur at 10s if Line 1 is at 8s.
  const bounds: LineBound[] = [...rawBounds];
  let lastAnchorIdx = -1;
  let lastAnchorTime = 0;

  for (let li = 0; li < bounds.length; li++) {
    const b = bounds[li];
    if (!b.isAnchor || b.startTime === null) continue;

    if (lastAnchorIdx >= 0) {
      const minRequiredSpan = (li - lastAnchorIdx) * 1.2; // at least 1.2s per line
      if (b.startTime < lastAnchorTime + minRequiredSpan) {
        bounds[li] = {
          startTime: null,
          endTime: null,
          confidence: Math.min(0.3, b.confidence),
          isAnchor: false,
        };
        continue;
      }
    }

    lastAnchorIdx = li;
    lastAnchorTime = b.endTime ?? b.startTime;
  }

  // 5. Monotonic Interpolation for Unmatched / Low-Confidence Gaps
  // Group contiguous unanchored lines into blocks and distribute them proportionally
  // across the available time span [prevAnchorEnd, nextAnchorStart] so no lines ever get crammed.
  let blockScanIdx = 0;
  while (blockScanIdx < lines.length) {
    if (bounds[blockScanIdx].isAnchor && bounds[blockScanIdx].startTime !== null) {
      blockScanIdx++;
      continue;
    }

    // Found start of an unanchored block: lines[blockStart .. blockEnd - 1]
    const blockStart = blockScanIdx;
    while (
      blockScanIdx < lines.length &&
      (!bounds[blockScanIdx].isAnchor || bounds[blockScanIdx].startTime === null)
    ) {
      blockScanIdx++;
    }
    const blockEnd = blockScanIdx; // exclusive
    const count = blockEnd - blockStart;

    // Previous anchor endpoint
    let prevAnchorEnd = 0;
    if (blockStart > 0 && bounds[blockStart - 1].endTime !== null) {
      prevAnchorEnd = bounds[blockStart - 1].endTime!;
    } else if (cleanWords.length > 0 && cleanWords[0].start > 3.0) {
      // Intro music section before first anchor
      prevAnchorEnd = Math.max(
        0,
        cleanWords[0].start - Math.min(cleanWords[0].start - 0.5, count * 4.0),
      );
    }

    // Next anchor startpoint
    let nextAnchorStart = fallbackDuration;
    if (blockEnd < lines.length && bounds[blockEnd].startTime !== null) {
      nextAnchorStart = bounds[blockEnd].startTime!;
    }

    const availableTime = Math.max(count * 0.8, nextAnchorStart - prevAnchorEnd);

    // Compute line weights for proportional distribution
    const weights = new Array<number>(count);
    let totalWeight = 0;
    for (let k = 0; k < count; k++) {
      const lineText = lines[blockStart + k];
      const isMusic = MUSIC_TAG_RE.test(lineText.trim());
      const w = isMusic ? 3.0 : Math.max(1.0, lineText.trim().split(/\s+/).length * 1.2);
      weights[k] = w;
      totalWeight += w;
    }

    let curTime = prevAnchorEnd;
    for (let k = 0; k < count; k++) {
      const lineIdx = blockStart + k;
      const isMusic = MUSIC_TAG_RE.test(lines[lineIdx].trim());
      const fraction = weights[k] / Math.max(0.1, totalWeight);
      const slotDur = Math.max(0.5, availableTime * fraction);
      const slotStart = Number(curTime.toFixed(2));
      const slotEnd = Number(Math.min(nextAnchorStart, curTime + slotDur).toFixed(2));

      bounds[lineIdx] = {
        startTime: slotStart,
        endTime: Math.max(slotStart + 0.3, slotEnd),
        confidence: isMusic ? 1.0 : 0.3,
        isAnchor: false,
      };
      curTime += slotDur;
    }
  }

  // 6. Assemble into SyncedLine[] and guarantee strict monotonic order
  const result: SyncedLine[] = [];
  let lastEnd = 0;

  for (let li = 0; li < lines.length; li++) {
    const b = bounds[li];
    let start = Math.max(lastEnd, b.startTime ?? lastEnd);
    let end = Math.max(start + 0.25, b.endTime ?? start + 3);

    // Clamp within song duration
    if (fallbackDuration > 0) {
      start = Math.min(start, fallbackDuration - 0.25);
      end = Math.min(Math.max(start + 0.25, end), fallbackDuration);
    }

    lastEnd = end;

    result.push({
      id: `line-${li}-${Date.now().toString(36).slice(2, 6)}-${li}`,
      index: li,
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
      text: lines[li],
      confidence: b.confidence,
    });
  }

  return normalizeSyncedLines(result, fallbackDuration);
}

