import { describe, expect, it } from 'vitest';
import {
  alignLyricsFromPcm,
  applyVocalBandpassPcm,
  computeRmsEnvelope,
  detectVocalSegments,
  mapWordsToLyricLines,
} from '../src/shared/aligner';

describe('Deterministic Acoustic Aligner', () => {
  it('detects vocal phrases in 300-3400Hz band while rejecting low-frequency tanpura drone', () => {
    const sampleRate = 16000;
    const duration = 12;
    const samples = new Float32Array(sampleRate * duration);

    const phrases = [
      { start: 1.0, end: 3.2 },
      { start: 4.5, end: 7.0 },
      { start: 8.2, end: 10.8 },
    ];

    for (let i = 0; i < samples.length; i++) {
      const t = i / sampleRate;
      // Continuous low drone at 95Hz (below 300Hz vocal passband)
      let s = 0.25 * Math.sin(2 * Math.PI * 95 * t);
      for (const p of phrases) {
        if (t >= p.start && t <= p.end) {
          // Strong 620Hz vocal signal
          s += 0.65 * Math.sin(2 * Math.PI * 620 * t);
        }
      }
      samples[i] = s;
    }

    const filtered = applyVocalBandpassPcm(samples, sampleRate);
    const env = computeRmsEnvelope(filtered, sampleRate, 0.01, 0.02);
    const detected = detectVocalSegments(env, 0.01, duration);

    expect(detected.length).toBe(3);
    expect(detected[0].start).toBeGreaterThan(0.8);
    expect(detected[0].start).toBeLessThan(1.25);
    expect(detected[1].start).toBeGreaterThan(4.25);
    expect(detected[1].start).toBeLessThan(4.75);
    expect(detected[2].start).toBeGreaterThan(7.95);
    expect(detected[2].start).toBeLessThan(8.45);

    const lyrics = [
      'Om Shanti Shanti Shantih',
      'Light within the silent heart',
      'One truth guides us home',
    ].join('\n');

    const { syncedLines } = alignLyricsFromPcm(lyrics, samples, sampleRate, duration);
    expect(syncedLines).toHaveLength(3);
    expect(syncedLines[0].startTime).toBeCloseTo(detected[0].start, 1);
    expect(syncedLines[1].startTime).toBeCloseTo(detected[1].start, 1);
    expect(syncedLines[2].startTime).toBeCloseTo(detected[2].start, 1);
  });

  it('deterministically maps word-level forced alignment timestamps onto lyric lines (Mode A)', () => {
    const rawLyrics = [
      'ॐ शांति शांति शांतिः',
      'May peace fill the hall',
    ].join('\n');

    const words = [
      { word: 'ॐ', start: 1.0, end: 1.5 },
      { word: 'शांति', start: 1.55, end: 2.1 },
      { word: 'शांति', start: 2.15, end: 2.7 },
      { word: 'शांतिः', start: 2.75, end: 3.4 },
      { word: 'May', start: 4.2, end: 4.5 },
      { word: 'peace', start: 4.55, end: 5.0 },
      { word: 'fill', start: 5.05, end: 5.4 },
      { word: 'the', start: 5.45, end: 5.6 },
      { word: 'hall', start: 5.65, end: 6.2 },
    ];

    const synced = mapWordsToLyricLines(rawLyrics, words, 8.0);
    expect(synced).toHaveLength(2);
    expect(synced[0].startTime).toBeCloseTo(1.0, 2);
    expect(synced[0].endTime).toBeCloseTo(3.4, 2);
    expect(synced[1].startTime).toBeCloseTo(4.2, 2);
    expect(synced[1].endTime).toBeCloseTo(6.2, 2);
  });
});

