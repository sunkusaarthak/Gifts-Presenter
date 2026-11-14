import type { VisualizerTick } from '../shared/types';

/**
 * Singleton Web Audio 4-Band Harmonic Analyzer:
 * Analyzes audio in real time across 4 frequency bands with Asymmetric Attack/Release filtering.
 * Uses a singleton WeakMap for HTMLMediaElement -> MediaElementAudioSourceNode to prevent duplicate node crashes.
 * Broadcasts throttled (45fps) IPC ticks so external output windows (projectors) dance in lockstep.
 */

// Singleton WeakMap preventing createMediaElementSource duplicates on the same <audio> element
const mediaSourceWeakMap = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

let activeAudioCtx: AudioContext | null = null;
let activeAudioElement: HTMLMediaElement | null = null;
let activeAnalyserNode: AnalyserNode | null = null;
let frequencyDataBuffer: Uint8Array<ArrayBuffer> | null = null;

let animFrameId: number | null = null;
let lastIpcTimestamp = 0;
let hadEnergyLastTick = true;

// Current filtered energy state
let currentTick: VisualizerTick = {
  isPlaying: false,
  bass: 0,
  lowMid: 0,
  vocal: 0,
  treble: 0,
};

const subscribers = new Set<(tick: VisualizerTick) => void>();

// Asymmetric Attack/Release coefficients
const ATTACK_RATE = 0.35; // Snappy rise on beats
const RELEASE_RATE = 0.08; // Smooth gliding decay

/**
 * Safely create or reuse MediaElementAudioSourceNode for an HTMLMediaElement.
 */
export function getOrCreateMediaElementSource(
  ctx: AudioContext,
  mediaElement: HTMLMediaElement,
): MediaElementAudioSourceNode {
  let sourceNode = mediaSourceWeakMap.get(mediaElement);
  if (!sourceNode) {
    sourceNode = ctx.createMediaElementSource(mediaElement);
    mediaSourceWeakMap.set(mediaElement, sourceNode);
  }
  return sourceNode;
}

/**
 * Frequency bin index calculation based on sample rate and FFT size.
 */
function getBinRange(
  sampleRate: number,
  fftSize: number,
  minHz: number,
  maxHz: number,
): [number, number] {
  const binWidth = sampleRate / fftSize;
  const startBin = Math.max(1, Math.floor(minHz / binWidth));
  const endBin = Math.max(startBin + 1, Math.min(fftSize / 2 - 1, Math.ceil(maxHz / binWidth)));
  return [startBin, endBin];
}

/**
 * Calculate normalized energy (0.0 to 1.0) in a frequency bin range.
 */
function calculateBandEnergy(buffer: Uint8Array, startBin: number, endBin: number): number {
  let sum = 0;
  const count = endBin - startBin;
  if (count <= 0) return 0;

  for (let i = startBin; i < endBin; i++) {
    sum += buffer[i];
  }

  // Average 0-255 scaled to 0.0-1.0 with a gentle acoustic lift
  const avg = sum / (count * 255);
  return Math.min(1.0, Math.pow(avg * 1.35, 1.15));
}

/**
 * Core 60fps analyzer tick loop.
 */
function runAnalyzerLoop(): void {
  if (!activeAnalyserNode || !frequencyDataBuffer) {
    animFrameId = null;
    return;
  }

  const isAudioPlaying = activeAudioElement ? !activeAudioElement.paused && !activeAudioElement.ended : false;

  let targetBass = 0;
  let targetLowMid = 0;
  let targetVocal = 0;
  let targetTreble = 0;

  if (isAudioPlaying) {
    activeAnalyserNode.getByteFrequencyData(frequencyDataBuffer);
    const sampleRate = activeAudioCtx?.sampleRate || 44100;
    const fftSize = activeAnalyserNode.fftSize;

    // 4 Distinct Musical Frequency Bands
    const [bassStart, bassEnd] = getBinRange(sampleRate, fftSize, 60, 250);
    const [lowMidStart, lowMidEnd] = getBinRange(sampleRate, fftSize, 250, 800);
    const [vocalStart, vocalEnd] = getBinRange(sampleRate, fftSize, 800, 3500);
    const [trebleStart, trebleEnd] = getBinRange(sampleRate, fftSize, 3500, 10000);

    targetBass = calculateBandEnergy(frequencyDataBuffer, bassStart, bassEnd);
    targetLowMid = calculateBandEnergy(frequencyDataBuffer, lowMidStart, lowMidEnd);
    targetVocal = calculateBandEnergy(frequencyDataBuffer, vocalStart, vocalEnd);
    targetTreble = calculateBandEnergy(frequencyDataBuffer, trebleStart, trebleEnd);
  }

  // Apply Asymmetric Attack/Release filter to each band
  const applyFilter = (current: number, target: number) => {
    if (target > current) {
      return current + (target - current) * ATTACK_RATE;
    }
    return current + (target - current) * RELEASE_RATE;
  };

  currentTick = {
    isPlaying: isAudioPlaying,
    bass: applyFilter(currentTick.bass, targetBass),
    lowMid: applyFilter(currentTick.lowMid, targetLowMid),
    vocal: applyFilter(currentTick.vocal, targetVocal),
    treble: applyFilter(currentTick.treble, targetTreble),
  };

  // Broadcast to local component subscribers (canvas, previews)
  for (const subscriber of subscribers) {
    subscriber(currentTick);
  }

  // Broadcast via Electron IPC throttled to ~30fps (every 33ms)
  // Smart IPC: only broadcast if audio is active or decaying to silence to avoid flooding the IPC bridge
  const now = performance.now();
  if (now - lastIpcTimestamp >= 33) {
    const hasEnergy = currentTick.bass > 0.01 || currentTick.vocal > 0.01 || currentTick.isPlaying;
    if (hasEnergy || hadEnergyLastTick) {
      lastIpcTimestamp = now;
      hadEnergyLastTick = hasEnergy;
      if (typeof window !== 'undefined' && window.satsangAPI?.sendVisualizerTick) {
        window.satsangAPI.sendVisualizerTick(currentTick);
      }
    }
  }

  animFrameId = requestAnimationFrame(runAnalyzerLoop);
}

/**
 * Attach the active Stage Console or Audition audio element to the harmonic analyzer.
 */
export function attachHarmonicAudioElement(
  audio: HTMLMediaElement,
  existingCtx?: AudioContext | null,
): { analyser: AnalyserNode; ctx: AudioContext } {
  activeAudioElement = audio;

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = existingCtx || activeAudioCtx || new AudioCtx();
  activeAudioCtx = ctx;

  const sourceNode = getOrCreateMediaElementSource(ctx, audio);

  // Configure high-resolution 1024-bin AnalyserNode
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.8;

  sourceNode.connect(analyser);
  activeAnalyserNode = analyser;
  frequencyDataBuffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

  if (!animFrameId) {
    animFrameId = requestAnimationFrame(runAnalyzerLoop);
  }

  return { analyser, ctx };
}

/**
 * Subscribe to real-time 4-band harmonic energy updates.
 * Works seamlessly in both Window 1 (direct Web Audio) and Window 2 (via IPC broadcast).
 */
export function subscribeVisualizerTick(cb: (tick: VisualizerTick) => void): () => void {
  subscribers.add(cb);
  cb(currentTick); // Immediately supply latest state

  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Get current instantaneous energy snapshot.
 */
export function getLatestVisualizerTick(): VisualizerTick {
  return currentTick;
}

// Automatically listen for incoming IPC visualizer ticks in Window 2 (Audience Output)
if (typeof window !== 'undefined' && window.satsangAPI?.onVisualizerTick) {
  window.satsangAPI.onVisualizerTick((incomingTick) => {
    // Only accept incoming IPC ticks if we don't have our own active local analyzer in this window
    if (!activeAnalyserNode) {
      currentTick = incomingTick;
      for (const subscriber of subscribers) {
        subscriber(incomingTick);
      }
    }
  });
}

