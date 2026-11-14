import { describe, expect, it } from 'vitest';
import {
  getLatestVisualizerTick,
  getOrCreateMediaElementSource,
  subscribeVisualizerTick,
} from '../src/utils/harmonicAudioAnalyzer';

describe('Harmonic Audio Analyzer & WeakMap Singleton', () => {
  it('provides a valid initial 4-band visualizer state', () => {
    const tick = getLatestVisualizerTick();
    expect(tick).toHaveProperty('isPlaying');
    expect(tick).toHaveProperty('bass');
    expect(tick).toHaveProperty('lowMid');
    expect(tick).toHaveProperty('vocal');
    expect(tick).toHaveProperty('treble');
    expect(typeof tick.bass).toBe('number');
    expect(typeof tick.treble).toBe('number');
  });

  it('allows subscription and immediately dispatches latest state', () => {
    let received = false;
    const unsub = subscribeVisualizerTick((t) => {
      if (t) received = true;
    });
    expect(received).toBe(true);
    unsub();
  });

  it('reuses the same MediaElementAudioSourceNode for an HTMLMediaElement via singleton WeakMap', () => {
    const mockAudio = {} as HTMLMediaElement;
    let createCount = 0;
    const mockCtx = {
      createMediaElementSource: () => {
        createCount++;
        return { id: 'mock-source-node' } as unknown as MediaElementAudioSourceNode;
      },
    } as unknown as AudioContext;

    const source1 = getOrCreateMediaElementSource(mockCtx, mockAudio);
    const source2 = getOrCreateMediaElementSource(mockCtx, mockAudio);

    expect(source1).toBe(source2);
    expect(createCount).toBe(1); // createMediaElementSource is called exactly once!
  });
});

