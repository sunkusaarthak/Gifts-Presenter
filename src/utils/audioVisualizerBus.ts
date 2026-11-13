/**
 * Global audio visualizer bus:
 * Connects Web Audio AnalyserNode from StageAudioEngine or Audition Audio
 * to MusicInterludeAnimation for 60fps real-time music reactivity.
 */

let activeAnalyser: AnalyserNode | null = null;
let activeBuffer: Uint8Array<ArrayBuffer> | null = null;

export function registerAudioAnalyser(analyser: AnalyserNode | null): void {
  activeAnalyser = analyser;
  if (analyser) {
    activeBuffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  } else {
    activeBuffer = null;
  }
}

export function getLiveAudioFrequencies(): Uint8Array | null {
  if (!activeAnalyser || !activeBuffer) return null;
  activeAnalyser.getByteFrequencyData(activeBuffer);
  return activeBuffer;
}
