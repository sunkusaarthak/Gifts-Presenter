import { describe, expect, it } from 'vitest';
import {
  alignLyricsToWhisperWords,
  type DetectedWord,
  normalizePhoneticToken,
  normalizedLevenshteinSimilarity,
} from '../src/shared/whisperAligner';

describe('whisperAligner - Phonetic normalization & string similarity', () => {
  it('normalizes phonetic tokens and collapses sung stretched vowels', () => {
    expect(normalizePhoneticToken('Govinda!')).toBe('govinda');
    expect(normalizePhoneticToken('Haree...')).toBe('hari');
    expect(normalizePhoneticToken('Muraaaree')).toBe('murari');
    expect(normalizePhoneticToken('हे राम,')).toBe('हे राम');
    expect(normalizePhoneticToken('"Krishna"')).toBe('krishna');
  });

  it('computes character similarity with phonetic prefix bonus', () => {
    expect(normalizedLevenshteinSimilarity('govind', 'govind')).toBe(1.0);
    // Slight suffix variance still matches strongly
    expect(normalizedLevenshteinSimilarity('govind', 'govinda')).toBeGreaterThanOrEqual(0.85);
    expect(normalizedLevenshteinSimilarity('murari', 'muraare')).toBeGreaterThanOrEqual(0.75);
    // Completely unrelated strings score low
    expect(normalizedLevenshteinSimilarity('shanti', 'govind')).toBeLessThan(0.3);
  });
});

describe('whisperAligner - Needleman-Wunsch DP Monotonic Sequence Alignment', () => {
  it('aligns raw lyrics to detected words and assigns timestamps monotonically', () => {
    const rawLyrics = `
हे राम गोविंद हरे मुरारे
हे नाथ नारायण वासुदेवा
    `.trim();

    const detectedWords: DetectedWord[] = [
      { word: 'हे', norm: 'हे', start: 10.5, end: 11.2 },
      { word: 'राम', norm: 'राम', start: 11.3, end: 12.0 },
      { word: 'गोविंद', norm: 'गोविंद', start: 12.1, end: 13.0 },
      { word: 'हरे', norm: 'हरे', start: 13.1, end: 13.8 },
      { word: 'मुरारे', norm: 'मुरारे', start: 13.9, end: 15.2 },
      // Instrumental gap
      { word: 'हे', norm: 'हे', start: 22.0, end: 22.8 },
      { word: 'नाथ', norm: 'नाथ', start: 22.9, end: 23.5 },
      { word: 'नारायण', norm: 'नारायण', start: 23.6, end: 25.0 },
      { word: 'वासुदेवा', norm: 'वासुदेवा', start: 25.1, end: 26.5 },
    ];

    const aligned = alignLyricsToWhisperWords(rawLyrics, detectedWords, 35.0);

    expect(aligned).toHaveLength(2);
    // Line 1 timestamps
    expect(aligned[0].startTime).toBeCloseTo(10.5, 1);
    expect(aligned[0].endTime).toBeCloseTo(15.2, 1);
    expect(aligned[0].text).toBe('हे राम गोविंद हरे मुरारे');
    expect(aligned[0].confidence).toBeGreaterThanOrEqual(0.7);

    // Line 2 timestamps
    expect(aligned[1].startTime).toBeCloseTo(22.0, 1);
    expect(aligned[1].endTime).toBeCloseTo(26.5, 1);
    expect(aligned[1].text).toBe('हे नाथ नारायण वासुदेवा');
    expect(aligned[1].confidence).toBeGreaterThanOrEqual(0.7);

    // Strict monotonic order
    expect(aligned[0].startTime).toBeLessThan(aligned[0].endTime);
    expect(aligned[0].endTime).toBeLessThanOrEqual(aligned[1].startTime);
  });

  it('interpolates unmatched lines between anchor lines smoothly without overlapping', () => {
    const rawLyrics = `
Line 1: Known Anchor
Line 2: Unmatched Slow Chorus
Line 3: Known Anchor
    `.trim();

    const detectedWords: DetectedWord[] = [
      { word: 'Line', norm: 'line', start: 5.0, end: 5.8 },
      { word: '1:', norm: '1', start: 5.9, end: 6.5 },
      { word: 'Known', norm: 'known', start: 6.6, end: 7.2 },
      { word: 'Anchor', norm: 'anchor', start: 7.3, end: 8.5 },
      // Line 2 was missed by ASR (music/quiet)
      // Line 3 starts at 20.0
      { word: 'Line', norm: 'line', start: 20.0, end: 20.8 },
      { word: '3:', norm: '3', start: 20.9, end: 21.5 },
      { word: 'Known', norm: 'known', start: 21.6, end: 22.2 },
      { word: 'Anchor', norm: 'anchor', start: 22.3, end: 23.5 },
    ];

    const aligned = alignLyricsToWhisperWords(rawLyrics, detectedWords, 30.0);

    expect(aligned).toHaveLength(3);
    // Line 1 is an anchor
    expect(aligned[0].startTime).toBeCloseTo(5.0, 1);
    expect(aligned[0].endTime).toBeCloseTo(8.5, 1);
    expect(aligned[0].confidence).toBeGreaterThanOrEqual(0.5);

    // Line 2 is interpolated between 8.5s and 20.0s
    expect(aligned[1].startTime).toBeGreaterThanOrEqual(aligned[0].endTime);
    expect(aligned[1].endTime).toBeLessThanOrEqual(aligned[2].startTime);
    expect(aligned[1].text).toBe('Line 2: Unmatched Slow Chorus');

    // Line 3 is an anchor
    expect(aligned[2].startTime).toBeCloseTo(20.0, 1);
    expect(aligned[2].endTime).toBeCloseTo(23.5, 1);
    expect(aligned[2].confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('correctly handles explicit instrumental music tags [♪ Instrumental Music] without matching words', () => {
    const rawLyrics = `
Line 1: Singing Verse
[♪ Instrumental Music]
Line 2: Next Singing Verse
    `.trim();

    const detectedWords: DetectedWord[] = [
      { word: 'Line', norm: 'line', start: 4.0, end: 4.8 },
      { word: '1:', norm: '1', start: 4.9, end: 5.5 },
      { word: 'Singing', norm: 'singing', start: 5.6, end: 6.5 },
      { word: 'Verse', norm: 'verse', start: 6.6, end: 7.5 },
      // Instrumental gap between 7.5s and 18.0s
      { word: 'Line', norm: 'line', start: 18.0, end: 18.8 },
      { word: '2:', norm: '2', start: 18.9, end: 19.5 },
      { word: 'Next', norm: 'next', start: 19.6, end: 20.2 },
      { word: 'Singing', norm: 'singing', start: 20.3, end: 21.0 },
      { word: 'Verse', norm: 'verse', start: 21.1, end: 22.0 },
    ];

    const aligned = alignLyricsToWhisperWords(rawLyrics, detectedWords, 30.0);
    expect(aligned).toHaveLength(3);
    expect(aligned[0].text).toBe('Line 1: Singing Verse');
    expect(aligned[0].endTime).toBeCloseTo(7.5, 1);

    expect(aligned[1].text).toBe('[♪ Instrumental Music]');
    expect(aligned[1].startTime).toBeGreaterThanOrEqual(aligned[0].endTime);
    expect(aligned[1].endTime).toBeLessThanOrEqual(aligned[2].startTime);

    expect(aligned[2].text).toBe('Line 2: Next Singing Verse');
    expect(aligned[2].startTime).toBeCloseTo(18.0, 1);
  });

  it('distributes 50 lines evenly across 300s when only 1 anchor exists, never cramming into 12s', () => {
    const rawLyrics = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}: Satsang verse`).join('\n');
    const detectedWords: DetectedWord[] = [
      { word: 'Line', norm: 'line', start: 0.5, end: 1.2 },
      { word: '1:', norm: '1', start: 1.3, end: 2.0 },
      { word: 'Satsang', norm: 'satsang', start: 2.1, end: 3.5 },
      { word: 'verse', norm: 'verse', start: 3.6, end: 5.0 },
    ];

    const aligned = alignLyricsToWhisperWords(rawLyrics, detectedWords, 300.0);
    expect(aligned).toHaveLength(50);

    // Line 1 start
    expect(aligned[0].startTime).toBeCloseTo(0.5, 1);

    // Final line should end near 300s, NOT at 12s!
    expect(aligned[49].endTime).toBeGreaterThan(250.0);

    // Average duration of unanchored lines should be ~5-6s, definitely >= 2s!
    for (let i = 1; i < 50; i++) {
      const dur = aligned[i].endTime - aligned[i].startTime;
      expect(dur).toBeGreaterThanOrEqual(1.0);
      expect(aligned[i].startTime).toBeGreaterThanOrEqual(aligned[i - 1].startTime);
    }
  });
});

