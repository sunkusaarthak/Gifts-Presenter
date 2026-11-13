import { describe, expect, it } from 'vitest';
import {
  formatLrcTimestamp,
  parseLrc,
  serializeLrc,
  serializeSrt,
  serializeVtt,
} from '../src/shared/lrc';

describe('.LRC parser & serializer', () => {
  it('parses standard [mm:ss.xx], [mm:ss.xxx], metadata, and multiple timestamps per line', () => {
    const lrc = `
[ti:Guru Vandana]
[ar:Satsang Choir]
[offset:500]
[00:02.50] Gurur Brahma Gurur Vishnu
[00:08.000][00:20.00] Gurur Devo Maheshwarah
[00:14.00] Guru Sakshat Param Brahma
`;
    const parsed = parseLrc(lrc, 30);
    expect(parsed.title).toBe('Guru Vandana');
    expect(parsed.syncedLines).toHaveLength(4);
    // offset +500ms => +0.5s
    expect(parsed.syncedLines[0].startTime).toBeCloseTo(3.0, 2);
    expect(parsed.syncedLines[1].startTime).toBeCloseTo(8.5, 2);
    expect(parsed.syncedLines[2].startTime).toBeCloseTo(14.5, 2);
    expect(parsed.syncedLines[3].startTime).toBeCloseTo(20.5, 2);
    expect(parsed.syncedLines[1].text).toBe('Gurur Devo Maheshwarah');
    expect(parsed.syncedLines[3].text).toBe('Gurur Devo Maheshwarah');
  });

  it('round-trips through serializeLrc cleanly', () => {
    const sample = [
      { id: '1', index: 0, startTime: 1.25, endTime: 4.5, text: 'Om Shanti' },
      { id: '2', index: 1, startTime: 5.75, endTime: 9.0, text: 'Hari Om Tat Sat' },
    ];
    const lrcText = serializeLrc(sample, 'Peace Chant');
    expect(lrcText).toContain('[ti:Peace Chant]');
    expect(lrcText).toContain(`${formatLrcTimestamp(1.25)} Om Shanti`);
    expect(lrcText).toContain(`${formatLrcTimestamp(5.75)} Hari Om Tat Sat`);

    const reparsed = parseLrc(lrcText);
    expect(reparsed.syncedLines[0].startTime).toBeCloseTo(1.25, 2);
    expect(reparsed.syncedLines[1].startTime).toBeCloseTo(5.75, 2);
    expect(reparsed.syncedLines[1].text).toBe('Hari Om Tat Sat');
  });

  it('serializes to SubRip (.srt) format for video editors', () => {
    const sample = [
      { id: '1', index: 0, startTime: 23.83, endTime: 29.36, text: 'हे राम गोविंद हरे मुरारे' },
      { id: '2', index: 1, startTime: 31.11, endTime: 38.1, text: 'निर्बल के तुम बल बन जाते' },
    ];
    const srt = serializeSrt(sample);
    expect(srt).toContain('1\r\n00:00:23,830 --> 00:00:29,360\r\nहे राम गोविंद हरे मुरारे');
    expect(srt).toContain('2\r\n00:00:31,110 --> 00:00:38,100\r\nनिर्बल के तुम बल बन जाते');
  });

  it('serializes to WebVTT (.vtt) format for web & players', () => {
    const sample = [
      { id: '1', index: 0, startTime: 23.83, endTime: 29.36, text: 'हे राम गोविंद हरे मुरारे' },
    ];
    const vtt = serializeVtt(sample);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('1\n00:00:23.830 --> 00:00:29.360\nहे राम गोविंद हरे मुरारे');
  });
});

