/**
 * Audio Pre-Processing for Offline Whisper Alignment:
 * 1. Decodes native audio buffer.
 * 2. Extracts center vocal channel (Mid = 0.5 * (Left + Right)) to suppress hard-panned instrumentation.
 * 3. Resamples precisely to 16,000 Hz using hardware-accelerated OfflineAudioContext.
 * 4. Applies 85Hz highpass filter (removes rumble/sub-bass) + 2500Hz presence boost (clarifies vocal formants).
 * 5. Normalizes peak amplitude to -1 dBFS so Whisper's attention heads receive optimal dynamic range.
 */
export async function extract16kSpeechPcm(
  audioRelativePath: string,
): Promise<{ pcm: Float32Array; duration: number }> {
  const rawBytes = await window.satsangAPI.readAudioBuffer(audioRelativePath);
  const decodeCtx = new AudioContext();

  try {
    const decoded = await decodeCtx.decodeAudioData(rawBytes.slice(0));
    const duration = decoded.duration;
    const numChannels = decoded.numberOfChannels;
    const originalRate = decoded.sampleRate;
    const originalLength = decoded.length;

    // 1. Mid-channel center vocal extraction (suppress panned stereo instruments)
    let midChannel: Float32Array;
    if (numChannels >= 2) {
      const left = decoded.getChannelData(0);
      const right = decoded.getChannelData(1);
      midChannel = new Float32Array(originalLength);
      for (let i = 0; i < originalLength; i++) {
        midChannel[i] = 0.5 * (left[i] + right[i]);
      }
    } else {
      midChannel = decoded.getChannelData(0).slice();
    }

    // 2. Resample to 16000 Hz using OfflineAudioContext with vocal enhancement filters
    const targetRate = 16000;
    const targetLength = Math.max(1, Math.ceil(duration * targetRate));
    const offlineCtx = new OfflineAudioContext(1, targetLength, targetRate);

    // Create single-channel source buffer with the mid-channel vocal signal
    const midBuffer = offlineCtx.createBuffer(1, originalLength, originalRate);
    midBuffer.getChannelData(0).set(midChannel);

    const src = offlineCtx.createBufferSource();
    src.buffer = midBuffer;

    // 85Hz High-pass filter to eliminate stage rumble & sub-bass instruments
    const hpFilter = offlineCtx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 85;
    hpFilter.Q.value = 0.707;

    // 2500Hz Peaking presence filter to boost intelligibility of human vocal formants
    const presenceFilter = offlineCtx.createBiquadFilter();
    presenceFilter.type = 'peaking';
    presenceFilter.frequency.value = 2500;
    presenceFilter.gain.value = 3.0; // +3 dB presence boost
    presenceFilter.Q.value = 1.0;

    src.connect(hpFilter);
    hpFilter.connect(presenceFilter);
    presenceFilter.connect(offlineCtx.destination);
    src.start(0);

    const rendered = await offlineCtx.startRendering();
    const pcm = rendered.getChannelData(0);

    // 3. Peak normalization to -1 dBFS (10^(-1/20) ≈ 0.89125)
    let maxAbs = 0;
    for (let i = 0; i < pcm.length; i++) {
      const abs = Math.abs(pcm[i]);
      if (abs > maxAbs) maxAbs = abs;
    }

    const TARGET_PEAK = 0.89125;
    if (maxAbs > 1e-4) {
      const multiplier = TARGET_PEAK / maxAbs;
      for (let i = 0; i < pcm.length; i++) {
        pcm[i] *= multiplier;
      }
    }

    return { pcm, duration };
  } finally {
    await decodeCtx.close().catch(() => {});
  }
}
