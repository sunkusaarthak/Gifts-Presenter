import React, { useEffect, useRef } from 'react';
import type { MusicAnimationStyle } from '../shared/types';
import { getLiveAudioFrequencies } from '../utils/audioVisualizerBus';
import { HarmonicWaveCanvas } from './HarmonicWaveCanvas';

interface MusicInterludeAnimationProps {
  variant?: MusicAnimationStyle;
  accentColor?: string;
  isPreview?: boolean;
  containerWidth?: number;
  scaleFactor?: number;
}

/**
 * Serene, 60fps GPU-accelerated and music-reactive ambient animation shown
 * during instrumental intros, interludes between verses, and outros when no lyrics are active.
 * Reacts live to music audio frequencies across all bands when sound is playing.
 * Directly updates CSS custom properties on container ref for 0-rerender GPU compositing.
 */
export const MusicInterludeAnimation: React.FC<MusicInterludeAnimationProps> = React.memo(({
  variant = 'lotus-pulse',
  accentColor = '#FCD34D',
  isPreview = false,
  containerWidth,
  scaleFactor = 1.0,
}) => {
  if (variant === 'none') return null;

  const containerRef = useRef<HTMLDivElement>(null);

  const u = isPreview ? 'cqw' : 'vw';
  const scale = (val: number) => {
    const effective = val * (scaleFactor ?? 1.0);
    if (isPreview && containerWidth && containerWidth > 0) {
      return `${(effective / 100) * containerWidth}px`;
    }
    return `${effective}${u}`;
  };

  useEffect(() => {
    if (variant === 'sacred-waves') return;

    let animId: number;

    const tick = () => {
      const data = getLiveAudioFrequencies();
      let energy = 0;

      if (data && data.length > 0) {
        const binCount = data.length;
        let totalSum = 0;
        const validBins = Math.min(binCount, 100);
        for (let i = 1; i < validBins; i++) {
          totalSum += data[i];
        }
        const avgLevel = totalSum / Math.max(1, validBins - 1);
        if (avgLevel > 3) {
          energy = Math.min(1.0, avgLevel / 85);
        }
      }

      if (containerRef.current) {
        containerRef.current.style.setProperty('--music-energy', energy.toFixed(3));
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [variant]);

  if (variant === 'sacred-waves') {
    const waveWidth = scale(28);
    const waveHeight = scale(6);
    return (
      <div className="animate-music-enter w-full h-full max-h-[70vh] flex items-center justify-center select-none px-4">
        <HarmonicWaveCanvas
          accentColor={accentColor}
          widthStyle={waveWidth}
          heightStyle={waveHeight}
          scaleFactor={scaleFactor}
        />
      </div>
    );
  }

  if (variant === 'aurora-orb') {
    return (
      <div
        ref={containerRef}
        className="animate-music-enter relative flex items-center justify-center select-none"
        style={{ willChange: 'transform' }}
      >
        <div
          className="animate-aurora-pulse rounded-full blur-2xl transition-transform duration-75"
          style={{
            width: scale(22),
            height: scale(22),
            background: `radial-gradient(circle, ${accentColor}55 0%, rgba(245, 185, 66, 0.16) 48%, transparent 74%)`,
            transform: 'scale(calc(1 + var(--music-energy, 0) * 0.5))',
            willChange: 'transform',
          }}
        />
        <div
          className="absolute animate-lotus-breathe rounded-full border transition-transform duration-75"
          style={{
            width: scale(11),
            height: scale(11),
            borderColor: `${accentColor}66`,
            boxShadow: `0 0 40px ${accentColor}44, inset 0 0 28px ${accentColor}22`,
            transform: 'scale(calc(1 + var(--music-energy, 0) * 0.28))',
            willChange: 'transform',
          }}
        />
        <div
          className="absolute rounded-full transition-transform duration-75"
          style={{
            width: scale(2.4),
            height: scale(2.4),
            backgroundColor: '#FFFDF7',
            boxShadow: `0 0 24px ${accentColor}`,
            transform: 'scale(calc(1 + var(--music-energy, 0) * 0.35))',
            willChange: 'transform',
          }}
        />
      </div>
    );
  }

  // Default: 'lotus-pulse' — Sacred geometric mandala + breathing concentric rings
  const petals = Array.from({ length: 12 }, (_, idx) => idx * 30);

  return (
    <div
      ref={containerRef}
      className="animate-music-enter relative flex items-center justify-center select-none"
      style={{ willChange: 'transform' }}
    >
      {/* Outer soft glow */}
      <div
        className="animate-lotus-breathe absolute rounded-full blur-xl transition-transform duration-100"
        style={{
          width: scale(20),
          height: scale(20),
          background: `radial-gradient(circle, ${accentColor}38 0%, transparent 70%)`,
          transform: 'scale(calc(1 + var(--music-energy, 0) * 0.4))',
          willChange: 'transform',
        }}
      />

      {/* Rotating sacred 12-petal lotus mandala SVG */}
      <svg
        viewBox="0 0 200 200"
        className="animate-lotus-spin transition-transform duration-100"
        style={{
          width: scale(16),
          height: scale(16),
          filter: `drop-shadow(0 0 14px rgba(245, 185, 66, 0.35))`,
          transform: 'scale(calc(1 + var(--music-energy, 0) * 0.18))',
          willChange: 'transform',
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
});
