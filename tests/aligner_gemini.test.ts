import { describe, expect, it } from 'vitest';
import {
  buildLinesFromGeminiAlignments,
  refineLinesWithVocalOnsets,
} from '../src/shared/aligner';

describe('Gemini alignment builder & vocal onset DSP refinement', () => {
  it('maps Gemini alignment indices onto rawLyrics and interpolates missing lines monotonically', () => {
    const rawLyrics = [
      'Om Shanti Shanti',
      'Peace within every soul',
      'Hari Om Tat Sat',
    ].join('\n');

    const geminiOut = [
      { index: 0, startSec: 2.1, endSec: 5.2 },
      // Index 1 intentionally omitted to test deterministic interpolation
      { index: 2, startSec: 10.4, endSec: 14.0 },
    ];

    const lines = buildLinesFromGeminiAlignments(rawLyrics, geminiOut, 16.0);
    expect(lines).toHaveLength(3);
    expect(lines[0].startTime).toBeCloseTo(2.1, 2);
    expect(lines[1].startTime).toBeGreaterThanOrEqual(5.2);
    expect(lines[1].endTime).toBeLessThanOrEqual(10.4);
    expect(lines[2].startTime).toBeCloseTo(10.4, 2);
    expect(lines[2].endTime).toBeCloseTo(14.0, 2);
  });

  it('snaps slightly early/late Gemini startSec onto the exact 5ms vocal onset frame', () => {
    const sampleRate = 16000;
    const duration = 6;
    const vocalSamples = new Float32Array(sampleRate * duration);

    // True vocal onset at 2.000s and 4.000s
    for (let i = 0; i < vocalSamples.length; i++) {
      const t = i / sampleRate;
      if ((t >= 2.0 && t <= 3.5) || (t >= 4.0 && t <= 5.5)) {
        vocalSamples[i] = 0.6 * Math.sin(2 * Math.PI * 550 * t);
      } else {
        vocalSamples[i] = 0.01 * Math.sin(2 * Math.PI * 550 * t);
      }
    }

    // Suppose Gemini predicted 2.14s (+140ms late) and 3.87s (-130ms early)
    const initial = [
      { id: 'a', index: 0, startTime: 2.14, endTime: 3.5, text: 'Line 1' },
      { id: 'b', index: 1, startTime: 3.87, endTime: 5.5, text: 'Line 2' },
    ];

    const refined = refineLinesWithVocalOnsets(initial, vocalSamples, sampleRate, 0.25, duration);
    expect(Math.abs(refined[0].startTime - 2.0)).toBeLessThan(0.03);
    expect(Math.abs(refined[1].startTime - 4.0)).toBeLessThan(0.03);
  });
});

