import {
  computeRmsEnvelope,
  detectVocalSegments,
  dpAlignLinesToSegments,
  type VocalSegment,
} from '../shared/aligner';
import type { SyncedLine } from '../shared/types';

export interface AnalyzedAudioData {
  duration: number;
  sampleRate: number;
  rawPeaks: number[];
  vocalPeaks: number[];
  vocalMono: Float32Array;
}

function mixDownToMono(buffer: AudioBuffer): Float32Array {
  const { length, numberOfChannels } = buffer;
  if (numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / numberOfChannels;
    }
  }
  return mono;
}

/**
 * Applies a hardware-accelerated OfflineAudioContext 300Hz-3400Hz vocal bandpass
 * (cascaded highpass 300Hz + lowpass 3400Hz) so vocal formants stand out against instruments.
 */
export async function renderVocalBandpassOffline(
  sourceBuffer: AudioBuffer,
): Promise<AudioBuffer> {
  const targetRate = Math.min(sourceBuffer.sampleRate, 22050);
  const frameCount = Math.max(1, Math.ceil(sourceBuffer.duration * targetRate));
  const offline = new OfflineAudioContext(1, frameCount, targetRate);

  const src = offline.createBufferSource();
  src.buffer = sourceBuffer;

  const hp = offline.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 300;
  hp.Q.value = 0.707;

  const lp = offline.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3400;
  lp.Q.value = 0.707;

  src.connect(hp);
  hp.connect(lp);
  lp.connect(offline.destination);
  src.start(0);

  return offline.startRendering();
}

function downsampleToPeaks(samples: Float32Array, targetBins = 4000): number[] {
  if (samples.length === 0) return [0];
  const bins = Math.min(targetBins, samples.length);
  const blockSize = samples.length / bins;
  const peaks = new Array<number>(bins);
  let maxVal = 1e-6;

  for (let i = 0; i < bins; i++) {
    const start = Math.floor(i * blockSize);
    const end = Math.min(samples.length, Math.floor((i + 1) * blockSize));
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > peak) peak = abs;
    }
    peaks[i] = peak;
    if (peak > maxVal) maxVal = peak;
  }

  // Normalize so waveform fills height cleanly
  for (let i = 0; i < bins; i++) {
    peaks[i] = Number((peaks[i] / maxVal).toFixed(4));
  }
  return peaks;
}

export async function analyzeSongAudio(
  audioRelativePath: string,
): Promise<AnalyzedAudioData> {
  const rawBytes = await window.satsangAPI.readAudioBuffer(audioRelativePath);
  const decodeCtx = new AudioContext();
  try {
    const decoded = await decodeCtx.decodeAudioData(rawBytes.slice(0));
    const rawMono = mixDownToMono(decoded);
    const vocalBuffer = await renderVocalBandpassOffline(decoded);
    const vocalMono = vocalBuffer.getChannelData(0).slice();

    const bins = Math.min(8000, Math.max(2000, Math.round(decoded.duration * 40)));
    return {
      duration: decoded.duration,
      sampleRate: vocalBuffer.sampleRate,
      rawPeaks: downsampleToPeaks(rawMono, bins),
      vocalPeaks: downsampleToPeaks(vocalMono, bins),
      vocalMono,
    };
  } finally {
    await decodeCtx.close().catch(() => {});
  }
}

export async function runOfflineVocalOnsetAlignment(
  rawLyrics: string,
  audioRelativePath: string,
  preAnalyzed?: AnalyzedAudioData | null,
): Promise<{
  syncedLines: SyncedLine[];
  segments: VocalSegment[];
  duration: number;
  analyzed: AnalyzedAudioData;
}> {
  const analyzed = preAnalyzed ?? (await analyzeSongAudio(audioRelativePath));
  const envelope = computeRmsEnvelope(analyzed.vocalMono, analyzed.sampleRate, 0.01, 0.02);
  const segments = detectVocalSegments(envelope, 0.01, analyzed.duration);
  const syncedLines = dpAlignLinesToSegments(rawLyrics, segments, analyzed.duration);
  return {
    syncedLines,
    segments,
    duration: analyzed.duration,
    analyzed,
  };
}

