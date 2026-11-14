import type { AlignedWord, SyncedLine } from './types';
import { normalizeSyncedLines } from './binarySearch';
import { splitRawLyrics } from './lrc';

export interface VocalSegment {
  start: number;
  end: number;
  rmsMean: number;
}

/**
 * Estimates vocal duration weight for a lyric line using syllable/vowel-cluster
 * counting (Latin + Devanagari/Indic friendly) and character length.
 */
export function estimateLineWeight(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 1;
  // Count Latin vowel groups + Devanagari vowel signs/matras as syllable proxy
  const latinMatches = cleaned.match(/[aeiouy]+/gi) ?? [];
  const indicMatches = cleaned.match(/[\u0904-\u0914\u093E-\u094C\u0962-\u0963]/g) ?? [];
  const nonSpaceChars = cleaned.replace(/\s+/g, '').length;
  const syllableApprox = latinMatches.length + indicMatches.length;
  return Math.max(1, syllableApprox * 1.4 + nonSpaceChars * 0.25);
}

/**
 * Pure-TypeScript 2nd-order Biquad bandpass cascade (300Hz highpass + 3400Hz lowpass)
 * for environments without Web Audio OfflineAudioContext (e.g. unit tests).
 */
export function applyVocalBandpassPcm(
  input: Float32Array,
  sampleRate: number,
  lowCutHz = 300,
  highCutHz = 3400,
): Float32Array {
  const hp = biquadFilter(input, sampleRate, 'highpass', lowCutHz, 0.707);
  return biquadFilter(hp, sampleRate, 'lowpass', highCutHz, 0.707);
}

function biquadFilter(
  input: Float32Array,
  sampleRate: number,
  type: 'highpass' | 'lowpass',
  freq: number,
  q: number,
): Float32Array {
  const out = new Float32Array(input.length);
  const clampedFreq = Math.min(Math.max(20, freq), sampleRate * 0.45);
  const w0 = (2 * Math.PI * clampedFreq) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * q);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  if (type === 'lowpass') {
    b0 = (1 - cosW0) / 2;
    b1 = 1 - cosW0;
    b2 = (1 - cosW0) / 2;
  } else {
    b0 = (1 + cosW0) / 2;
    b1 = -(1 + cosW0);
    b2 = (1 + cosW0) / 2;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/**
 * Computes RMS energy envelope at a fixed 10ms hop size (20ms analysis window).
 */
export function computeRmsEnvelope(
  samples: Float32Array,
  sampleRate: number,
  hopSec = 0.01,
  windowSec = 0.02,
): Float32Array {
  const hopSamples = Math.max(1, Math.round(sampleRate * hopSec));
  const winSamples = Math.max(hopSamples, Math.round(sampleRate * windowSec));
  const numFrames = Math.max(1, Math.floor((samples.length - winSamples) / hopSamples) + 1);
  const env = new Float32Array(numFrames);

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSamples;
    const end = Math.min(samples.length, start + winSamples);
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      const s = samples[i];
      sumSq += s * s;
    }
    env[f] = Math.sqrt(sumSq / Math.max(1, end - start));
  }
  return env;
}

/**
 * Applies adaptive hysteresis thresholding to an RMS envelope to detect
 * vocal phrase onset/offset boundaries.
 */
export function detectVocalSegments(
  envelope: Float32Array,
  hopSec = 0.01,
  totalDuration?: number,
): VocalSegment[] {
  const n = envelope.length;
  const fallbackDur = totalDuration ?? n * hopSec;
  if (n === 0) {
    return [{ start: 0, end: Math.max(1, fallbackDur), rmsMean: 0 }];
  }

  const sorted = Array.from(envelope).sort((a, b) => a - b);
  const p10 = sorted[Math.floor(n * 0.1)] ?? 0;
  const p50 = sorted[Math.floor(n * 0.5)] ?? 0;
  const p90 = sorted[Math.floor(n * 0.9)] ?? 0;

  if (p90 <= 1e-6) {
    return [{ start: 0, end: Math.max(1, fallbackDur), rmsMean: 0 }];
  }

  const dynamicRange = Math.max(1e-6, p90 - p10);
  const highThresh = Math.min(p90 * 0.85, p10 + dynamicRange * 0.28);
  const lowThresh = Math.min(highThresh * 0.6, p10 + dynamicRange * 0.12);

  const hangoverFrames = Math.max(1, Math.round(0.18 / hopSec));
  const minGapSec = 0.24;
  const minSegmentSec = 0.18;

  const rawSegments: VocalSegment[] = [];
  let active = false;
  let segStartFrame = 0;
  let belowCount = 0;
  let rmsAccum = 0;
  let rmsCount = 0;

  for (let i = 0; i < n; i++) {
    const e = envelope[i];
    if (!active) {
      if (e >= highThresh) {
        active = true;
        segStartFrame = i;
        belowCount = 0;
        rmsAccum = e;
        rmsCount = 1;
      }
    } else {
      rmsAccum += e;
      rmsCount++;
      if (e < lowThresh) {
        belowCount++;
        if (belowCount >= hangoverFrames) {
          const endFrame = Math.max(segStartFrame + 1, i - belowCount + 1);
          rawSegments.push({
            start: segStartFrame * hopSec,
            end: endFrame * hopSec,
            rmsMean: rmsAccum / Math.max(1, rmsCount),
          });
          active = false;
          belowCount = 0;
        }
      } else {
        belowCount = 0;
      }
    }
  }

  if (active) {
    rawSegments.push({
      start: segStartFrame * hopSec,
      end: Math.min(fallbackDur, n * hopSec),
      rmsMean: rmsAccum / Math.max(1, rmsCount),
    });
  }

  // Merge segments separated by short consonant/breath gaps
  const merged: VocalSegment[] = [];
  for (const seg of rawSegments) {
    const prev = merged[merged.length - 1];
    if (prev && seg.start - prev.end < minGapSec) {
      const prevDur = prev.end - prev.start;
      const curDur = seg.end - seg.start;
      prev.rmsMean = (prev.rmsMean * prevDur + seg.rmsMean * curDur) / Math.max(0.01, prevDur + curDur);
      prev.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  const filtered = merged.filter((s) => s.end - s.start >= minSegmentSec);
  if (filtered.length === 0) {
    return [{ start: 0, end: Math.max(1, fallbackDur), rmsMean: p50 }];
  }

  return filtered;
}

/**
 * Deterministic Dynamic Programming alignment mapping N lyric lines (weighted by
 * syllable/character count) across M detected vocal segments.
 * Handles 1-to-1, 1-to-many (spanning pauses), many-to-1 (continuous singing),
 * and skips low-energy instrumental intros/interludes when M > N.
 */
export function dpAlignLinesToSegments(
  rawLyrics: string,
  segments: readonly VocalSegment[],
  totalDuration: number,
): SyncedLine[] {
  const lines = splitRawLyrics(rawLyrics);
  if (lines.length === 0) return [];

  const safeSegments: VocalSegment[] =
    segments.length > 0
      ? segments.map((s) => ({ ...s }))
      : [{ start: 0, end: Math.max(1, totalDuration), rmsMean: 1 }];

  const N = lines.length;
  const M = safeSegments.length;

  const weights = lines.map(estimateLineWeight);
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  const cumWeight = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) {
    cumWeight[i + 1] = cumWeight[i] + weights[i];
  }

  const segDurs = safeSegments.map((s) => Math.max(0.1, s.end - s.start));
  const totalSegDur = segDurs.reduce((acc, d) => acc + d, 0);
  const cumSegDur = new Float64Array(M + 1);
  for (let j = 0; j < M; j++) {
    cumSegDur[j + 1] = cumSegDur[j] + segDurs[j];
  }

  const maxRms = Math.max(1e-6, ...safeSegments.map((s) => s.rmsMean));
  const spanStart = safeSegments[0].start;
  const spanEnd = safeSegments[M - 1].end;
  const activeSpan = Math.max(0.5, spanEnd - spanStart);

  const INF = 1e15;
  // dp[i][j] = minimum alignment cost for first i lines and first j segments
  const dp: number[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(INF));
  const backI: number[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(-1));
  const backJ: number[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(-1));

  dp[0][0] = 0;

  // Skipping leading segments (e.g., instrumental intro) has low cost if short/quiet
  for (let j = 1; j <= M; j++) {
    const seg = safeSegments[j - 1];
    const skipCost = 0.08 * (segDurs[j - 1] / Math.max(1, totalSegDur)) + 0.03 * (seg.rmsMean / maxRms);
    dp[0][j] = dp[0][j - 1] + skipCost;
    backI[0][j] = 0;
    backJ[0][j] = j - 1;
  }

  const MAX_MERGE_SEGS = 4;
  const MAX_SPLIT_LINES = 6;

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      // Option 1: Skip segment j-1 as instrumental interlude (requires lines already started)
      {
        const seg = safeSegments[j - 1];
        const skipCost =
          0.12 * (segDurs[j - 1] / Math.max(0.5, totalSegDur)) +
          0.05 * (seg.rmsMean / maxRms) +
          (M <= N ? 0.45 : 0.02);
        const cand = dp[i][j - 1] + skipCost;
        if (cand < dp[i][j]) {
          dp[i][j] = cand;
          backI[i][j] = i;
          backJ[i][j] = j - 1;
        }
      }

      // Option 2: Line i-1 spans segments k..j-1 (1-to-1 when k == j-1, or 1-to-many)
      const kMin = Math.max(0, j - MAX_MERGE_SEGS);
      for (let k = j - 1; k >= kMin; k--) {
        if (dp[i - 1][k] >= INF / 2) continue;
        const wFrac = weights[i - 1] / totalWeight;
        const dFrac = (cumSegDur[j] - cumSegDur[k]) / totalSegDur;
        const durMismatch = Math.abs(wFrac - dFrac) * 2.5 + Math.pow(wFrac - dFrac, 2) * 8;

        const lineMidNorm = (cumWeight[i - 1] + weights[i - 1] * 0.5) / totalWeight;
        const segMidTime = (safeSegments[k].start + safeSegments[j - 1].end) * 0.5;
        const segMidNorm = (segMidTime - spanStart) / activeSpan;
        const posMismatch = Math.pow(lineMidNorm - segMidNorm, 2) * 1.8;

        const mergePenalty = (j - 1 - k) * 0.04;
        const cand = dp[i - 1][k] + durMismatch + posMismatch + mergePenalty;
        if (cand < dp[i][j]) {
          dp[i][j] = cand;
          backI[i][j] = i - 1;
          backJ[i][j] = k;
        }
      }

      // Option 3: Multiple lines p..i-1 share single vocal segment j-1 (many-to-1)
      const pMin = Math.max(0, i - MAX_SPLIT_LINES);
      for (let p = i - 2; p >= pMin; p--) {
        if (dp[p][j - 1] >= INF / 2) continue;
        const groupWeight = cumWeight[i] - cumWeight[p];
        const wFrac = groupWeight / totalWeight;
        const dFrac = segDurs[j - 1] / totalSegDur;
        const durMismatch = Math.abs(wFrac - dFrac) * 2.5 + Math.pow(wFrac - dFrac, 2) * 8;

        const lineMidNorm = (cumWeight[p] + groupWeight * 0.5) / totalWeight;
        const segMidTime = (safeSegments[j - 1].start + safeSegments[j - 1].end) * 0.5;
        const segMidNorm = (segMidTime - spanStart) / activeSpan;
        const posMismatch = Math.pow(lineMidNorm - segMidNorm, 2) * 1.8;

        const splitPenalty = (i - p - 1) * 0.03;
        const cand = dp[p][j - 1] + durMismatch + posMismatch + splitPenalty;
        if (cand < dp[i][j]) {
          dp[i][j] = cand;
          backI[i][j] = p;
          backJ[i][j] = j - 1;
        }
      }
    }
  }

  // Backtrack from dp[N][M]
  const assignments: Array<{ startLine: number; endLine: number; startSeg: number; endSeg: number }> = [];
  let ci = N;
  let cj = M;
  while (ci > 0 || cj > 0) {
    const pi = backI[ci][cj];
    const pj = backJ[ci][cj];
    if (pi < 0 || pj < 0) break;
    if (pi < ci) {
      assignments.push({ startLine: pi, endLine: ci, startSeg: pj, endSeg: cj });
    }
    ci = pi;
    cj = pj;
  }
  assignments.reverse();

  // Fallback proportional distribution if backtracking failed
  if (assignments.length === 0) {
    let cursor = spanStart;
    return normalizeSyncedLines(
      lines.map((text, idx) => {
        const dur = (weights[idx] / totalWeight) * activeSpan;
        const startTime = cursor;
        const endTime = cursor + dur;
        cursor = endTime;
        return {
          id: `line-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          index: idx,
          startTime,
          endTime,
          text,
        };
      }),
      totalDuration,
    );
  }

  const result: SyncedLine[] = [];
  for (const block of assignments) {
    const blockStart = safeSegments[block.startSeg].start;
    const blockEnd = safeSegments[block.endSeg - 1].end;
    const blockDur = Math.max(0.2, blockEnd - blockStart);
    const blockWeight = cumWeight[block.endLine] - cumWeight[block.startLine];
    let cursor = blockStart;

    for (let li = block.startLine; li < block.endLine; li++) {
      const frac = blockWeight > 0 ? weights[li] / blockWeight : 1 / (block.endLine - block.startLine);
      const lineDur = Math.max(0.15, blockDur * frac);
      const startTime = cursor;
      const endTime = li === block.endLine - 1 ? blockEnd : Math.min(blockEnd, cursor + lineDur);
      cursor = endTime;
      result.push({
        id: `line-${li}-${Math.random().toString(36).slice(2, 7)}`,
        index: li,
        startTime,
        endTime: Math.max(startTime + 0.1, endTime),
        text: lines[li],
      });
    }
  }

  return normalizeSyncedLines(result, totalDuration);
}

/**
 * Full offline deterministic vocal-onset DP aligner from mono PCM samples.
 */
export function alignLyricsFromPcm(
  rawLyrics: string,
  monoSamples: Float32Array,
  sampleRate: number,
  totalDuration: number,
  alreadyBandpassed = false,
): { syncedLines: SyncedLine[]; segments: VocalSegment[] } {
  const filtered = alreadyBandpassed ? monoSamples : applyVocalBandpassPcm(monoSamples, sampleRate);
  const hopSec = 0.01;
  const env = computeRmsEnvelope(filtered, sampleRate, hopSec, 0.02);
  const segments = detectVocalSegments(env, hopSec, totalDuration);
  const syncedLines = dpAlignLinesToSegments(rawLyrics, segments, totalDuration);
  return { syncedLines, segments };
}

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.75;
  // Simple Levenshtein similarity for minor transliteration/spelling drift
  const m = a.length;
  const n = b.length;
  const dp = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  const dist = dp[n];
  return Math.max(0, 1 - dist / Math.max(m, n));
}

/**
 * Mode A helper: Deterministically maps word-level forced alignment timestamps
 * (from ElevenLabs Forced Alignment API or local whisper.cpp / mms_fa CLI)
 * onto lyric lines by matching each line's first and last words monotonically.
 */
export function mapWordsToLyricLines(
  rawLyrics: string,
  alignedWords: readonly AlignedWord[],
  totalDuration?: number,
): SyncedLine[] {
  const lines = splitRawLyrics(rawLyrics);
  if (lines.length === 0) return [];

  const cleanWords = alignedWords
    .map((w) => ({
      norm: normalizeToken(w.word),
      start: w.start,
      end: Math.max(w.start, w.end),
    }))
    .filter((w) => w.norm.length > 0 && Number.isFinite(w.start));

  if (cleanWords.length === 0) {
    const dur = totalDuration && totalDuration > 0 ? totalDuration : lines.length * 4;
    return dpAlignLinesToSegments(rawLyrics, [{ start: 0, end: dur, rmsMean: 1 }], dur);
  }

  // Flatten lyric tokens with their owning line index
  const lyricTokens: Array<{ lineIdx: number; norm: string }> = [];
  for (let li = 0; li < lines.length; li++) {
    const parts = lines[li].split(/\s+/);
    for (const part of parts) {
      const norm = normalizeToken(part);
      if (norm) lyricTokens.push({ lineIdx: li, norm });
    }
  }

  // Monotonic Needleman-Wunsch DP between lyricTokens (L) and cleanWords (W)
  const L = lyricTokens.length;
  const W = cleanWords.length;
  const GAP_PENALTY = -0.35;
  const score = Array.from({ length: L + 1 }, () => new Float32Array(W + 1));
  const trace = Array.from({ length: L + 1 }, () => new Uint8Array(W + 1)); // 1=diag, 2=up(skip lyric), 3=left(skip word)

  for (let i = 1; i <= L; i++) {
    score[i][0] = score[i - 1][0] + GAP_PENALTY;
    trace[i][0] = 2;
  }
  for (let j = 1; j <= W; j++) {
    score[0][j] = score[0][j - 1] + GAP_PENALTY * 0.25; // Allow extra intro/vocalized words cheaply
    trace[0][j] = 3;
  }

  for (let i = 1; i <= L; i++) {
    const lt = lyricTokens[i - 1].norm;
    for (let j = 1; j <= W; j++) {
      const sim = tokenSimilarity(lt, cleanWords[j - 1].norm);
      const matchVal = sim >= 0.55 ? sim * 2.0 : -0.8;
      const diag = score[i - 1][j - 1] + matchVal;
      const up = score[i - 1][j] + GAP_PENALTY;
      const left = score[i][j - 1] + GAP_PENALTY * 0.5;

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

  const lineMatchedBounds: Array<{ firstStart: number | null; lastEnd: number | null }> =
    lines.map(() => ({ firstStart: null, lastEnd: null }));

  let ci = L;
  let cj = W;
  while (ci > 0 || cj > 0) {
    const dir = trace[ci][cj];
    if (dir === 1 && ci > 0 && cj > 0) {
      const lineIdx = lyricTokens[ci - 1].lineIdx;
      const w = cleanWords[cj - 1];
      const b = lineMatchedBounds[lineIdx];
      b.firstStart = b.firstStart === null ? w.start : Math.min(b.firstStart, w.start);
      b.lastEnd = b.lastEnd === null ? w.end : Math.max(b.lastEnd, w.end);
      ci--;
      cj--;
    } else if (dir === 2 && ci > 0) {
      ci--;
    } else {
      cj--;
    }
  }

  // Interpolate any unmatched lines deterministically from neighbors
  const maxTime =
    totalDuration && totalDuration > 0
      ? totalDuration
      : cleanWords[cleanWords.length - 1].end + 1;

  const provisional: SyncedLine[] = [];
  for (let li = 0; li < lines.length; li++) {
    const b = lineMatchedBounds[li];
    if (b.firstStart !== null && b.lastEnd !== null) {
      provisional.push({
        id: `line-${li}-${Math.random().toString(36).slice(2, 7)}`,
        index: li,
        startTime: b.firstStart,
        endTime: Math.max(b.firstStart + 0.15, b.lastEnd),
        text: lines[li],
      });
    } else {
      // Find nearest previous matched end and next matched start
      let prevEnd = 0;
      for (let p = li - 1; p >= 0; p--) {
        if (lineMatchedBounds[p].lastEnd !== null) {
          prevEnd = lineMatchedBounds[p].lastEnd!;
          break;
        }
      }
      let nextStart = maxTime;
      let missingSpan = 1;
      for (let q = li + 1; q < lines.length; q++) {
        if (lineMatchedBounds[q].firstStart !== null) {
          nextStart = lineMatchedBounds[q].firstStart!;
          break;
        }
        missingSpan++;
      }
      const prevGapStart = provisional[li - 1]?.endTime ?? prevEnd;
      const slot = Math.max(0.25, (nextStart - prevGapStart) / missingSpan);
      provisional.push({
        id: `line-${li}-${Math.random().toString(36).slice(2, 7)}`,
        index: li,
        startTime: prevGapStart,
        endTime: Math.min(maxTime, prevGapStart + slot),
        text: lines[li],
      });
    }
  }

  return normalizeSyncedLines(provisional, totalDuration);
}

/**
 * Deterministic Hybrid DSP Refinement:
 * Inspects a fine 5ms-hop RMS envelope of the 300-3400Hz vocal band within ±maxShiftSec
 * around each predicted startTime. If a sharp vocal onset (energy jump >= 2.2x)
 * exists in that window, snaps startTime to the exact onset frame while preserving
 * strict monotonic ordering.
 */
export function refineLinesWithVocalOnsets(
  syncedLines: readonly SyncedLine[],
  vocalSamples: Float32Array,
  sampleRate: number,
  maxShiftSec = 0.25,
  totalDuration?: number,
): SyncedLine[] {
  if (syncedLines.length === 0 || vocalSamples.length === 0 || sampleRate <= 0) {
    return normalizeSyncedLines(syncedLines, totalDuration);
  }

  const hopSec = 0.005;
  const env = computeRmsEnvelope(vocalSamples, sampleRate, hopSec, 0.015);
  if (env.length < 10) {
    return normalizeSyncedLines(syncedLines, totalDuration);
  }

  const windowFrames = Math.round(maxShiftSec / hopSec);
  const preFrames = Math.round(0.05 / hopSec); // 50ms lookback
  const postFrames = Math.round(0.05 / hopSec); // 50ms lookahead

  const refined: SyncedLine[] = syncedLines.map((l) => ({ ...l }));

  for (let i = 0; i < refined.length; i++) {
    const cur = refined[i];
    const centerFrame = Math.round(cur.startTime / hopSec);
    const minFrame = Math.max(preFrames, centerFrame - windowFrames);
    const maxFrame = Math.min(env.length - postFrames - 1, centerFrame + windowFrames);

    let bestFrame = -1;
    let bestScore = 0;

    for (let f = minFrame; f <= maxFrame; f++) {
      let preSum = 0;
      for (let k = f - preFrames; k < f; k++) preSum += env[k];
      let postSum = 0;
      for (let k = f; k < f + postFrames; k++) postSum += env[k];

      const preMean = preSum / preFrames;
      const postMean = postSum / postFrames;
      const ratio = postMean / Math.max(1e-5, preMean);
      const jump = postMean - preMean;

      // Require a clear local vocal onset (at least 2.2x jump)
      if (ratio >= 2.2 && jump > bestScore) {
        bestScore = jump;
        bestFrame = f;
      }
    }

    if (bestFrame >= 0) {
      const candidateStart = Number((bestFrame * hopSec).toFixed(3));
      const minAllowed = i > 0 ? refined[i - 1].startTime + 0.15 : 0;
      const maxAllowed = cur.endTime - 0.15;
      if (candidateStart >= minAllowed && candidateStart <= maxAllowed) {
        cur.startTime = candidateStart;
        if (i > 0 && refined[i - 1].endTime > candidateStart) {
          refined[i - 1].endTime = candidateStart;
        }
      }
    }
  }

  return normalizeSyncedLines(refined, totalDuration);
}
