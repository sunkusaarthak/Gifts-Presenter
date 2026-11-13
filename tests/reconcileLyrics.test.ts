import { describe, expect, it } from 'vitest';
import { reconcileSyncedLinesWithRawLyrics } from '../src/shared/reconcileLyrics';
import type { SyncedLine } from '../src/shared/types';

describe('reconcileSyncedLinesWithRawLyrics', () => {
  it('preserves timestamps when line count matches exactly (typo fix)', () => {
    const existing: SyncedLine[] = [
      { id: '1', index: 0, startTime: 2.0, endTime: 5.0, text: 'Hello wrld' },
      { id: '2', index: 1, startTime: 6.0, endTime: 9.0, text: 'Second line' },
    ];
    const newLyrics = 'Hello world\nSecond line';
    const reconciled = reconcileSyncedLinesWithRawLyrics(existing, newLyrics, 60);

    expect(reconciled).toHaveLength(2);
    expect(reconciled[0].text).toBe('Hello world');
    expect(reconciled[0].startTime).toBe(2.0);
    expect(reconciled[0].endTime).toBe(5.0);
    expect(reconciled[1].text).toBe('Second line');
    expect(reconciled[1].startTime).toBe(6.0);
    expect(reconciled[1].endTime).toBe(9.0);
  });

  it('correctly maps 5 initial lines to full 15 lines without swapping or losing line 5', () => {
    const existing: SyncedLine[] = [
      { id: 'l0', index: 0, startTime: 1.858, endTime: 5.887, text: 'हे राम गोविंद हरे मुरारे' },
      { id: 'l1', index: 1, startTime: 69.763, endTime: 73.981, text: 'निर्बल के तुम बल बन जाते' },
      { id: 'l2', index: 2, startTime: 74.373, endTime: 78.666, text: 'पतितों को तुम गले लगाते' },
      { id: 'l3', index: 3, startTime: 79.031, endTime: 83.247, text: 'जो बेबस हो हाथ बढ़ाते' },
      { id: 'l4', index: 4, startTime: 83.663, endTime: 87.727, text: 'तुम ही अपना हाथ थमाते' },
    ];

    const full15Lines = [
      'हे राम गोविंद हरे मुरारे',
      'हे राम गोविंद हरे मुरारे',
      'हे राम गोविंद हरे मुरारे',
      'हे राम गोविंद हरे मुरारे',
      'थके हुए के तुम रखवारे',
      'हारे जन के तुम उजियारे',
      'जग में जिनको कोई न तारे',
      'उनको देते तुम्हीं सहारे',
      'हे राम गोविंद हरे मुरारे',
      'हे राम गोविंद हरे मुरारे',
      'निर्बल के तुम बल बन जाते',
      'पतितों को तुम गले लगाते',
      'जो बेबस हो हाथ बढ़ाते',
      'तुम ही अपना हाथ थमाते',
      'हे राम गोविंद हरे मुरारे',
    ].join('\n');

    const reconciled = reconcileSyncedLinesWithRawLyrics(existing, full15Lines, 294.85);

    expect(reconciled).toHaveLength(15);

    // Line 0 ("हे राम गोविंद हरे मुरारे") should retain the anchor start time
    expect(reconciled[0].startTime).toBe(1.858);

    // Line 4 ("थके हुए के तुम रखवारे") MUST be between line 0 and line 10
    expect(reconciled[4].text).toBe('थके हुए के तुम रखवारे');
    expect(reconciled[4].startTime).toBeGreaterThan(reconciled[0].endTime);
    expect(reconciled[4].startTime).toBeLessThan(69.763);

    // Line 10 ("निर्बल के तुम बल बन जाते") MUST retain its anchor ~69.763
    expect(reconciled[10].text).toBe('निर्बल के तुम बल बन जाते');
    expect(reconciled[10].startTime).toBe(69.763);

    // Line 11 ("पतितों को तुम गले लगाते") MUST retain its anchor ~74.373
    expect(reconciled[11].text).toBe('पतितों को तुम गले लगाते');
    expect(reconciled[11].startTime).toBe(74.373);

    // All 15 lines must have strictly monotonic non-decreasing startTime
    for (let i = 1; i < reconciled.length; i++) {
      expect(reconciled[i].startTime).toBeGreaterThanOrEqual(reconciled[i - 1].startTime);
      expect(reconciled[i].endTime).toBeGreaterThan(reconciled[i].startTime);
      expect(reconciled[i].index).toBe(i);
    }
  });

  it('handles empty existing lines by distributing linearly', () => {
    const lyrics = 'Line A\nLine B\nLine C';
    const reconciled = reconcileSyncedLinesWithRawLyrics([], lyrics, 30);
    expect(reconciled).toHaveLength(3);
    expect(reconciled[0].startTime).toBe(0);
    expect(reconciled[1].startTime).toBe(10);
    expect(reconciled[2].startTime).toBe(20);
  });
});

