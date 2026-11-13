import React from 'react';
import type { MusicAnimationStyle } from '../shared/types';

interface MusicInterludeAnimationProps {
  variant?: MusicAnimationStyle;
  accentColor?: string;
  isPreview?: boolean;
}

const WAVE_BAR_HEIGHTS = [0.45, 0.72, 0.95, 0.62, 1.0, 0.8, 0.55, 0.9, 0.68, 0.42];

/**
 * Serene, 60fps GPU-accelerated ambient animation shown during instrumental
 * intros, interludes between verses, and outros when no lyrics are active.
 */
export const MusicInterludeAnimation: React.FC<MusicInterludeAnimationProps> = ({
  variant = 'lotus-pulse',
  accentColor = '#FCD34D',
  isPreview = false,
}) => {
  if (variant === 'none') return null;

  const u = isPreview ? 'cqw' : 'vw';

  if (variant === 'sacred-waves') {
    return (
      <div className="animate-music-enter flex flex-col items-center justify-center select-none">
        <div
          className="flex items-center justify-center"
          style={{ gap: `1.1${u}`, height: `12${u}` }}
        >
          {WAVE_BAR_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className="rounded-full origin-center"
              style={{
                width: `0.75${u}`,
                height: `${(h * 11).toFixed(2)}${u}`,
                background: `linear-gradient(180deg, #FFFDF7 0%, ${accentColor} 55%, rgba(245, 185, 66, 0.25) 100%)`,
                boxShadow: `0 0 18px rgba(245, 185, 66, 0.38)`,
                animation: `sacredWaveBar 2.2s ease-in-out ${(i * 0.16).toFixed(2)}s infinite`,
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
          className="animate-aurora-pulse rounded-full blur-2xl"
          style={{
            width: `22${u}`,
            height: `22${u}`,
            background: `radial-gradient(circle, ${accentColor}55 0%, rgba(245, 185, 66, 0.16) 48%, transparent 74%)`,
          }}
        />
        <div
          className="absolute animate-lotus-breathe rounded-full border"
          style={{
            width: `11${u}`,
            height: `11${u}`,
            borderColor: `${accentColor}66`,
            boxShadow: `0 0 40px ${accentColor}44, inset 0 0 28px ${accentColor}22`,
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: `2.4${u}`,
            height: `2.4${u}`,
            backgroundColor: '#FFFDF7',
            boxShadow: `0 0 24px ${accentColor}`,
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
        className="animate-lotus-breathe absolute rounded-full blur-xl"
        style={{
          width: `20${u}`,
          height: `20${u}`,
          background: `radial-gradient(circle, ${accentColor}38 0%, transparent 70%)`,
        }}
      />

      {/* Rotating sacred 12-petal lotus mandala SVG */}
      <svg
        viewBox="0 0 200 200"
        className="animate-lotus-spin"
        style={{
          width: `16${u}`,
          height: `16${u}`,
          filter: `drop-shadow(0 0 14px rgba(245, 185, 66, 0.35))`,
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

