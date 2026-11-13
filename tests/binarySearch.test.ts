import { describe, expect, it } from 'vitest';
import {
  findActiveLine,
  findActiveLineIndex,
  normalizeSyncedLines,
  resolveStageDisplayState,
} from '../src/shared/binarySearch';
import type { SyncedLine } from '../src/shared/types';

function makeLines(): SyncedLine[] {
  return [
    { id: 'l0', index: 0, startTime: 2.0, endTime: 5.0, text: 'Verse 1' },
    { id: 'l1', index: 1, startTime: 6.5, endTime: 10.0, text: 'Verse 2' },
    { id: 'l2', index: 2, startTime: 10.0, endTime: 14.5, text: 'Verse 3' },
    { id: 'l3', index: 3, startTime: 18.0, endTime: 22.0, text: 'Chorus' },
  ];
}

describe('binarySearch O(log N) lookup', () => {
  it('returns -1 before the first line starts or when lines are empty', () => {
    expect(findActiveLineIndex([], 3)).toBe(-1);
    const lines = makeLines();
    expect(findActiveLineIndex(lines, 0)).toBe(-1);
    expect(findActiveLineIndex(lines, 1.999)).toBe(-1);
  });

  it('matches exact startTime and active intervals', () => {
    const lines = makeLines();
    expect(findActiveLineIndex(lines, 2.0)).toBe(0);
    expect(findActiveLineIndex(lines, 4.5)).toBe(0);
    expect(findActiveLineIndex(lines, 6.5)).toBe(1);
    expect(findActiveLineIndex(lines, 10.0)).toBe(2);
    expect(findActiveLine(lines, 19.2)?.id).toBe('l3');
  });

  it('holds the most recent line during gaps between verses and after last line', () => {
    const lines = makeLines();
    // Gap between Verse 1 (end 5.0) and Verse 2 (start 6.5)
    expect(findActiveLineIndex(lines, 5.75)).toBe(0);
    // Gap between Verse 3 (end 14.5) and Chorus (start 18.0)
    expect(findActiveLineIndex(lines, 16.0)).toBe(2);
    // After final line
    expect(findActiveLineIndex(lines, 35.0)).toBe(3);
  });

  it('normalizes unsorted lines strictly ascending by startTime', () => {
    const messy: SyncedLine[] = [
      { id: 'b', index: 1, startTime: 10, endTime: 12, text: 'Second' },
      { id: 'a', index: 0, startTime: 2, endTime: 5, text: 'First' },
    ];
    const normalized = normalizeSyncedLines(messy, 11);
    expect(normalized.map((l) => l.id)).toEqual(['a', 'b']);
    expect(normalized[0].index).toBe(0);
    expect(normalized[1].index).toBe(1);
    expect(normalized[1].endTime).toBe(11);
  });

  it('preserves canonical lyric verse order and never scrambles lines when future lines have un-synced timestamps', () => {
    // Scenario reported by user: lines 0..9 are synced, line 10 is synced at 80s,
    // while subsequent lines 11, 12 still have earlier un-synced timestamps (23s).
    const lines: SyncedLine[] = [
      { id: 'l9', index: 9, startTime: 75, endTime: 79, text: 'Verse 10' },
      { id: 'l10', index: 10, startTime: 80, endTime: 84, text: 'Verse 11 (Just Synced)' },
      { id: 'l11', index: 11, startTime: 23, endTime: 24, text: 'Verse 12 (Pending)' },
      { id: 'l12', index: 12, startTime: 24, endTime: 25, text: 'Verse 13 (Pending)' },
    ];

    const normalized = normalizeSyncedLines(lines, 200);

    // 1. Canonical lyric order MUST be 100% preserved
    expect(normalized.map((l) => l.text)).toEqual([
      'Verse 10',
      'Verse 11 (Just Synced)',
      'Verse 12 (Pending)',
      'Verse 13 (Pending)',
    ]);

    // 2. Sequential indices MUST remain 0, 1, 2, 3
    expect(normalized.map((l) => l.index)).toEqual([0, 1, 2, 3]);

    // 3. Timestamps MUST be monotonic non-decreasing so binary search works
    expect(normalized[1].startTime).toBe(80);
    expect(normalized[2].startTime).toBeGreaterThanOrEqual(normalized[1].startTime);
    expect(normalized[3].startTime).toBeGreaterThanOrEqual(normalized[2].startTime);
  });

  it('resolves instrumental music animation during intro, >= 1.8s interludes, and outro while holding short breath gaps', () => {
    const lines = makeLines();
    // Intro before 2.0s -> music animation
    expect(resolveStageDisplayState(lines, 1.0)).toMatchObject({
      activeLine: null,
      isMusicInterlude: true,
    });

    // Short 1.5s gap between line 0 (end 5.0) and line 1 (start 6.5) -> hold lyric
    expect(resolveStageDisplayState(lines, 5.8)).toMatchObject({
      activeLineIndex: 0,
      isMusicInterlude: false,
    });

    // Long 3.5s interlude between line 2 (end 14.5) and line 3 (start 18.0) -> music animation
    expect(resolveStageDisplayState(lines, 16.0)).toMatchObject({
      activeLine: null,
      isMusicInterlude: true,
    });

    // Outro past 22.0 + 1.5s -> music animation
    expect(resolveStageDisplayState(lines, 24.0)).toMatchObject({
      activeLine: null,
      isMusicInterlude: true,
    });
  });
});

