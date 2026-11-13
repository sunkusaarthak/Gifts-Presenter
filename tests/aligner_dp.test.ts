import { describe, expect, it } from 'vitest';
import { dpAlignLinesToSegments, mapWordsToLyricLines } from '../src/shared/aligner';

describe('DP Aligner & Mode A Word Mapper edge cases', () => {
  it('splits a single continuous vocal segment proportionally across multiple lyric lines (M < N)', () => {
    const lyrics = [
      'Short line',
      'A considerably longer spiritual verse line with more syllables',
      'Medium line here',
    ].join('\n');

    const segments = [{ start: 2.0, end: 14.0, rmsMean: 0.5 }];
    const aligned = dpAlignLinesToSegments(lyrics, segments, 16.0);

    expect(aligned).toHaveLength(3);
    expect(aligned[0].startTime).toBeCloseTo(2.0, 2);
    expect(aligned[2].endTime).toBeCloseTo(14.0, 2);
    const dur0 = aligned[0].endTime - aligned[0].startTime;
    const dur1 = aligned[1].endTime - aligned[1].startTime;
    expect(dur1).toBeGreaterThan(dur0 * 2);
  });

  it('skips quiet instrumental intro/interlude segments when M > N', () => {
    const lyrics = ['First verse line', 'Second verse line'].join('\n');
    const segments = [
      { start: 0.2, end: 0.8, rmsMean: 0.05 }, // quiet intro
      { start: 2.0, end: 5.5, rmsMean: 0.6 }, // verse 1
      { start: 6.5, end: 7.0, rmsMean: 0.05 }, // quiet interlude
      { start: 8.5, end: 12.0, rmsMean: 0.6 }, // verse 2
    ];

    const aligned = dpAlignLinesToSegments(lyrics, segments, 13.0);
    expect(aligned).toHaveLength(2);
    expect(aligned[0].startTime).toBeGreaterThanOrEqual(1.9);
    expect(aligned[1].endTime).toBeGreaterThanOrEqual(11.5);
  });

  it('handles unmatched/skipped words in Mode A forced alignment cleanly', () => {
    const lyrics = ['First line', 'Unmatched interlude chant', 'Final line'].join('\n');
    const words = [
      { word: 'First', start: 1.0, end: 1.4 },
      { word: 'line', start: 1.45, end: 2.0 },
      { word: 'Final', start: 7.0, end: 7.5 },
      { word: 'line', start: 7.55, end: 8.2 },
    ];

    const synced = mapWordsToLyricLines(lyrics, words, 10.0);
    expect(synced).toHaveLength(3);
    expect(synced[0].startTime).toBeCloseTo(1.0, 2);
    expect(synced[1].startTime).toBeGreaterThanOrEqual(2.0);
    expect(synced[1].endTime).toBeLessThanOrEqual(7.0);
    expect(synced[2].startTime).toBeCloseTo(7.0, 2);
    expect(synced[2].endTime).toBeCloseTo(8.2, 2);
  });
});

