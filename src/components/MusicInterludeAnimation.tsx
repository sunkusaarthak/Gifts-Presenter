import React, { useEffect, useRef, useState } from 'react';
import type { MusicAnimationStyle } from '../shared/types';
import { getLiveAudioFrequencies } from '../utils/audioVisualizerBus';

interface MusicInterludeAnimationProps {
  variant?: MusicAnimationStyle;
  accentColor?: string;
  isPreview?: boolean;
}

const DEFAULT_BAR_HEIGHTS = [0.42, 0.68, 0.92, 0.62, 1.0, 0.82, 0.55, 0.88, 0.64, 0.38];

// Logarithmic frequency bands from 1.5% to 94% of audio spectrum (completely skips bin 0 DC offset)
const LOG_SLICES: Array<[number, number]> = [
  [0.015, 0.038], // Band 0: Sub/Bass fundamental & kick thump
  [0.038, 0.068], // Band 1: Low-mids & bassline body
  [0.068, 0.110], // Band 2: Vocal warmth & acoustic resonance
  [0.110, 0.165], // Band 3: Midrange presence & vocal core
  [0.165, 0.240], // Band 4: Upper vocal clarity & guitar/keys
  [0.240, 0.335], // Band 5: Harmonium, string attack, flute
  [0.335, 0.450], // Band 6: Percussion snap, snare, brightness
  [0.450, 0.600], // Band 7: High harmonics, shakers, breath
  [0.600, 0.770], // Band 8: Sizzle & cymbals
  [0.770, 0.940], // Band 9: Air & brilliance
];

// Spectral tilt weights to compensate for natural 1/f acoustic falloff across musical octaves
const TILT_WEIGHTS = [0.85, 0.95, 1.15, 1.40, 1.75, 2.15, 2.65, 3.25, 4.00, 4.80];

/**
 * Serene, 60fps GPU-accelerated and music-reactive ambient animation shown
 * during instrumental intros, interludes between verses, and outros when no lyrics are active.
 * Reacts live to music audio frequencies across all bands when sound is playing.
 */
export const MusicInterludeAnimation: React.FC<MusicInterludeAnimationProps> = ({
  variant = 'lotus-pulse',
  accentColor = '#FCD34D',
  isPreview = false,
}) => {
  if (variant === 'none') return null;

  const u = isPreview ? 'cqw' : 'vw';

  const [liveBars, setLiveBars] = useState<number[] | null>(null);
  const [musicEnergy, setMusicEnergy] = useState<number>(0);
  const smoothedBarsRef = useRef<number[]>([...DEFAULT_BAR_HEIGHTS]);

  useEffect(() => {
    let animId: number;

    const tick = () => {
      const data = getLiveAudioFrequencies();
      if (data && data.length > 0) {
        const binCount = data.length;
        // Calculate average level across audible bins (skipping bin 0 DC offset)
        let totalSum = 0;
        const validBins = Math.min(binCount, 100);
        for (let i = 1; i < validBins; i++) {
          totalSum += data[i];
        }
        const avgLevel = totalSum / Math.max(1, validBins - 1);
        const isAudioActive = avgLevel > 3;

        if (isAudioActive) {
          const energy = Math.min(1.0, avgLevel / 85);
          setMusicEnergy(energy);

          const barCount = LOG_SLICES.length;
          const currentBars: number[] = [];

          for (let b = 0; b < barCount; b++) {
            const [relStart, relEnd] = LOG_SLICES[b];
            const startBin = Math.max(1, Math.floor(relStart * binCount));
            const endBin = Math.max(startBin + 1, Math.min(binCount, Math.ceil(relEnd * binCount)));
            const count = endBin - startBin;

            let bandSum = 0;
            let bandMax = 0;
            for (let k = startBin; k < endBin; k++) {
              const val = data[k] ?? 0;
              bandSum += val;
              if (val > bandMax) bandMax = val;
            }

            // Blend peak (65%) with average (35%) for snappy musical rhythm
            const rawBandVal = (bandMax * 0.65 + (bandSum / count) * 0.35) / 255;
            const weighted = rawBandVal * TILT_WEIGHTS[b];
            const targetHeight = Math.max(0.12, Math.min(1.0, weighted * 1.35));

            // Instant attack on beat hits (75%), smooth musical decay on release (18%)
            const prev = smoothedBarsRef.current[b] ?? 0.2;
            const smoothed =
              targetHeight > prev
                ? prev * 0.25 + targetHeight * 0.75
                : prev * 0.82 + targetHeight * 0.18;

            smoothedBarsRef.current[b] = smoothed;
            currentBars.push(smoothed);
          }

          setLiveBars(currentBars);
        } else {
          setLiveBars(null);
          setMusicEnergy(0);
        }
      } else {
        setLiveBars(null);
        setMusicEnergy(0);
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  const hasLiveAudio = liveBars !== null && musicEnergy > 0;

  if (variant === 'sacred-waves') {
    const barsToRender = liveBars ?? DEFAULT_BAR_HEIGHTS;

    return (
      <div className="animate-music-enter flex flex-col items-center justify-center select-none">
        <div
          className="flex items-center justify-center"
          style={{ gap: `1.1${u}`, height: `13${u}` }}
        >
          {barsToRender.map((h, i) => (
            <div
              key={i}
              className="rounded-full origin-center"
              style={{
                width: `0.75${u}`,
                height: `${(Math.max(0.15, h) * 11.5).toFixed(2)}${u}`,
                background: `linear-gradient(180deg, #FFFDF7 0%, ${accentColor} 55%, rgba(245, 185, 66, 0.25) 100%)`,
                boxShadow: hasLiveAudio
                  ? `0 0 22px rgba(245, 185, 66, ${0.35 + h * 0.4})`
                  : `0 0 18px rgba(245, 185, 66, 0.38)`,
                animation: hasLiveAudio
                  ? undefined
                  : `sacredWaveBar 2.2s ease-in-out ${(i * 0.16).toFixed(2)}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'aurora-orb') {
    return (
      <div className="animate-music-enter relative flex items-center justify-center select-none">
        <div
          className="animate-aurora-pulse rounded-full blur-2xl transition-transform duration-75"
          style={{
            width: `22${u}`,
            height: `22${u}`,
            background: `radial-gradient(circle, ${accentColor}55 0%, rgba(245, 185, 66, 0.16) 48%, transparent 74%)`,
            transform: hasLiveAudio ? `scale(${1 + musicEnergy * 0.5})` : undefined,
          }}
        />
        <div
          className="absolute animate-lotus-breathe rounded-full border transition-transform duration-75"
          style={{
            width: `11${u}`,
            height: `11${u}`,
            borderColor: `${accentColor}66`,
            boxShadow: hasLiveAudio
              ? `0 0 ${40 + musicEnergy * 30}px ${accentColor}66, inset 0 0 28px ${accentColor}33`
              : `0 0 40px ${accentColor}44, inset 0 0 28px ${accentColor}22`,
            transform: hasLiveAudio ? `scale(${1 + musicEnergy * 0.28})` : undefined,
          }}
        />
        <div
          className="absolute rounded-full transition-transform duration-75"
          style={{
            width: `2.4${u}`,
            height: `2.4${u}`,
            backgroundColor: '#FFFDF7',
            boxShadow: `0 0 ${24 + musicEnergy * 20}px ${accentColor}`,
            transform: hasLiveAudio ? `scale(${1 + musicEnergy * 0.35})` : undefined,
          }}
        />
      </div>
    );
  }

  // Default: 'lotus-pulse' — Sacred geometric mandala + breathing concentric rings
  const petals = Array.from({ length: 12 }, (_, idx) => idx * 30);

  return (
    <div className="animate-music-enter relative flex items-center justify-center select-none">
      {/* Outer soft glow */}
      <div
        className="animate-lotus-breathe absolute rounded-full blur-xl transition-transform duration-100"
        style={{
          width: `20${u}`,
          height: `20${u}`,
          background: `radial-gradient(circle, ${accentColor}38 0%, transparent 70%)`,
          transform: hasLiveAudio ? `scale(${1 + musicEnergy * 0.4})` : undefined,
        }}
      />

      {/* Rotating sacred 12-petal lotus mandala SVG */}
      <svg
        viewBox="0 0 200 200"
        className="animate-lotus-spin transition-transform duration-100"
        style={{
          width: `16${u}`,
          height: `16${u}`,
          filter: `drop-shadow(0 0 14px rgba(245, 185, 66, 0.35))`,
          transform: hasLiveAudio ? `scale(${1 + musicEnergy * 0.18})` : undefined,
        }}
      >
        <circle
          cx="100"
          cy="100"
          r="86"
          fill="none"
          stroke={accentColor}
          strokeOpacity="0.28"
          strokeWidth="1.2"
        />
        <circle
          cx="100"
          cy="100"
          r="64"
          fill="none"
          stroke={accentColor}
          strokeOpacity="0.4"
          strokeWidth="1.2"
          strokeDasharray="4 6"
        />
        {petals.map((deg) => (
          <g key={deg} transform={`rotate(${deg} 100 100)`}>
            <path
              d="M100 22 C110 46, 110 68, 100 84 C90 68, 90 46, 100 22 Z"
              fill={accentColor}
              fillOpacity="0.16"
              stroke={accentColor}
              strokeOpacity="0.58"
              strokeWidth="1.1"
            />
          </g>
        ))}
        <circle
          cx="100"
          cy="100"
          r="14"
          fill="#FFFDF7"
          fillOpacity="0.88"
        />
      </svg>
    </div>
  );
};
