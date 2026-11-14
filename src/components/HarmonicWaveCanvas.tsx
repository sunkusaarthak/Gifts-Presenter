import React, { useEffect, useRef } from 'react';
import type { VisualizerTick } from '../shared/types';
import { getLatestVisualizerTick, subscribeVisualizerTick } from '../utils/harmonicAudioAnalyzer';

interface HarmonicWaveCanvasProps {
  className?: string;
  accentColor?: string;
  widthStyle?: string;
  heightStyle?: string;
  scaleFactor?: number;
}

/**
 * Ultra-Simple, Calm Bhajan Aesthetic Harmonic Wave Visualizer.
 * - Single monochrome color matching lyric typography (soft warm white / gold)
 * - 1 clean, smooth continuous wave line (2.5px) + subtle thin echo line (1px, 0.35 opacity)
 * - Raised-cosine pinch window seamlessly flattening ends to horizontal center
 * - Zero neon blur, zero chaotic multi-layer blending
 */
export const HarmonicWaveCanvas: React.FC<HarmonicWaveCanvasProps> = ({
  className = '',
  accentColor = '#FFFDF7',
  widthStyle,
  heightStyle,
  scaleFactor = 1.0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phiRef = useRef<number>(0);
  const tickRef = useRef<VisualizerTick>(getLatestVisualizerTick());

  useEffect(() => {
    const unsub = subscribeVisualizerTick((next) => {
      tickRef.current = next;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let cssWidth = 300;
    let cssHeight = 64;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          cssWidth = width;
          cssHeight = height;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
        }
      }
    });

    ro.observe(canvas);

    const render = () => {
      animId = requestAnimationFrame(render);
      if (cssWidth <= 0 || cssHeight <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const tick = tickRef.current;
      const bass = tick.bass || 0;
      const lowMid = tick.lowMid || 0;
      const vocal = tick.vocal || 0;
      const treble = tick.treble || 0;

      // Gentle serene phase advance
      phiRef.current += 0.025 + lowMid * 0.05 + bass * 0.03;
      const phi = phiRef.current;

      const centerY = cssHeight / 2;
      const baseColor = accentColor || '#FFFDF7';

      // Ensure zero blurry halo / no shadow blur
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // Smooth Center Wave (dots removed at the ends)
      const margin = Math.max(16, Math.floor(cssWidth * 0.08));
      const startX = margin;
      const endX = cssWidth - margin;
      const waveSpan = endX - startX;

      if (waveSpan > 20) {
        const maxAmp = Math.min(22 * scaleFactor, Math.max(8, centerY - 4));
        const amp = maxAmp * (0.2 + vocal * 0.52 + bass * 0.2 + treble * 0.08);

        // A. Subtle thin echo line (1px, 0.35 opacity)
        ctx.beginPath();
        ctx.lineWidth = Math.max(0.8, 1.0 * Math.min(2, cssWidth / 300));
        ctx.strokeStyle = baseColor;
        ctx.globalAlpha = 0.35;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let firstEcho = true;
        for (let x = startX; x <= endX; x += 1.5) {
          const u = (x - startX) / waveSpan; // 0 to 1
          const s = 2 * u - 1; // -1 to +1
          // Raised-cosine pinch window: smoothly 0 at s = ±1, 1 at center s = 0
          const windowVal = 0.5 * (1 + Math.cos(Math.PI * s));
          const y = centerY + windowVal * (amp * 0.65) * Math.sin(3.0 * Math.PI * s - phi * 1.2 + 0.55);

          if (firstEcho) {
            ctx.moveTo(x, y);
            firstEcho = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // B. Main single continuous wave line (2.5px, crisp monochrome)
        ctx.beginPath();
        ctx.lineWidth = Math.max(1.6, 2.5 * Math.min(2, cssWidth / 300));
        ctx.strokeStyle = baseColor;
        ctx.globalAlpha = 0.92;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let firstMain = true;
        for (let x = startX; x <= endX; x += 1.5) {
          const u = (x - startX) / waveSpan; // 0 to 1
          const s = 2 * u - 1; // -1 to +1
          const windowVal = 0.5 * (1 + Math.cos(Math.PI * s));
          const y = centerY + windowVal * amp * Math.sin(3.0 * Math.PI * s - phi * 1.2);

          if (firstMain) {
            ctx.moveTo(x, y);
            firstMain = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [accentColor, scaleFactor]);

  return (
    <div
      style={{
        width: widthStyle || `${Math.round(300 * scaleFactor)}px`,
        height: heightStyle || `${Math.round(64 * scaleFactor)}px`,
      }}
      className={`max-h-[16vh] max-w-[90vw] mx-auto flex items-center justify-center pointer-events-none select-none ${className}`}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
