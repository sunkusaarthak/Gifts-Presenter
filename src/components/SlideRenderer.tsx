import React, { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_STYLE_CONFIG,
  toMediaUrl,
  type BackgroundType,
  type StyleConfig,
  type SyncedLine,
} from '../shared/types';
import { ensureCustomFontLoaded } from '../utils/fontLoader';
import { MusicInterludeAnimation } from './MusicInterludeAnimation';

interface BackgroundSlot {
  type: BackgroundType;
  src: string;
}

interface SlideRendererProps {
  activeLine: SyncedLine | null;
  styleConfig: StyleConfig;
  isBlank?: boolean;
  isMusicInterlude?: boolean;
  isPreview?: boolean;
}

function renderBackgroundLayer(slot: BackgroundSlot) {
  if (slot.type === 'gradient') {
    return (
      <div
        className="absolute inset-0 w-full h-full"
        style={{ background: slot.src || DEFAULT_STYLE_CONFIG.backgroundSrc }}
      />
    );
  }
  const url = slot.src.startsWith('http') || slot.src.startsWith('satsang-media://')
    ? slot.src
    : toMediaUrl(slot.src);

  if (slot.type === 'video') {
    return (
      <video
        key={url}
        src={url}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="absolute inset-0 w-full h-full object-cover select-none"
    />
  );
}

/**
 * Shared Focused Slide Renderer used identically by Window 2 (Audience Output)
 * and Window 1's Live 16:9 Screen Mirror.
 * Features 800ms double-buffered background crossfade and 400ms line slide transition.
 */
export const SlideRenderer: React.FC<SlideRendererProps> = React.memo(({
  activeLine,
  styleConfig,
  isBlank = false,
  isMusicInterlude = false,
  isPreview = false,
}) => {
  const safeStyle = styleConfig ?? DEFAULT_STYLE_CONFIG;

  const [slots, setSlots] = useState<[BackgroundSlot, BackgroundSlot]>([
    { type: safeStyle.backgroundType, src: safeStyle.backgroundSrc },
    { type: safeStyle.backgroundType, src: safeStyle.backgroundSrc },
  ]);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const lastBgKeyRef = useRef(`${safeStyle.backgroundType}::${safeStyle.backgroundSrc}`);

  useEffect(() => {
    const nextKey = `${safeStyle.backgroundType}::${safeStyle.backgroundSrc}`;
    if (nextKey === lastBgKeyRef.current) return;
    lastBgKeyRef.current = nextKey;

    const targetSlot: 0 | 1 = activeSlot === 0 ? 1 : 0;
    setSlots((prev) => {
      const next: [BackgroundSlot, BackgroundSlot] = [prev[0], prev[1]];
      next[targetSlot] = {
        type: safeStyle.backgroundType,
        src: safeStyle.backgroundSrc,
      };
      return next;
    });
    // Trigger 800ms opacity crossfade on next animation frame
    requestAnimationFrame(() => {
      setActiveSlot(targetSlot);
    });
  }, [safeStyle.backgroundType, safeStyle.backgroundSrc, activeSlot]);

  useEffect(() => {
    ensureCustomFontLoaded(safeStyle.fontFamily, safeStyle.fontAssetPath);
  }, [safeStyle.fontFamily, safeStyle.fontAssetPath]);

  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPreview) return;
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };

    measure();
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isPreview]);

  const clampedDim = Math.max(0, Math.min(0.85, safeStyle.backdropDim ?? 0.25));
  const unit = isPreview ? 'cqw' : 'vw';
  const showText = !isBlank && !isMusicInterlude && activeLine !== null && activeLine.text.trim().length > 0;
  const showMusicAnim = !isBlank && !showText && isMusicInterlude;

  // Exact pixel-scale calculation for preview mirrors to guarantee long-range visibility
  const fontSizeStyle = isPreview && containerWidth > 0
    ? `${Math.max(12, (safeStyle.fontSizeVw / 100) * containerWidth)}px`
    : `${safeStyle.fontSizeVw}${unit}`;

  const paddingInlineStyle = isPreview && containerWidth > 0
    ? `${containerWidth * 0.08}px`
    : isPreview ? '8cqw' : '8vw';

  return (
    <div
      ref={containerRef}
      style={{
        containerType: isPreview ? 'inline-size' : undefined,
        transform: 'translateZ(0)',
        contain: isPreview ? 'inline-size' : 'layout paint',
      }}
      className={`relative w-full h-full overflow-hidden bg-black select-none ${
        isPreview ? 'stage-preview-container [container-type:inline-size]' : ''
      }`}
    >
      {/* Double-buffered background Layer A */}
      <div
        className="absolute inset-0 transition-opacity duration-[800ms] ease-in-out"
        style={{
          opacity: activeSlot === 0 ? 1 : 0,
          zIndex: activeSlot === 0 ? 2 : 1,
          willChange: 'opacity',
          transform: 'translate3d(0, 0, 0)',
        }}
      >
        {renderBackgroundLayer(slots[0])}
      </div>

      {/* Double-buffered background Layer B */}
      <div
        className="absolute inset-0 transition-opacity duration-[800ms] ease-in-out"
        style={{
          opacity: activeSlot === 1 ? 1 : 0,
          zIndex: activeSlot === 1 ? 2 : 1,
          willChange: 'opacity',
          transform: 'translate3d(0, 0, 0)',
        }}
      >
        {renderBackgroundLayer(slots[1])}
      </div>

      {/* Backdrop dimming scrim */}
      <div
        className="absolute inset-0 z-10 transition-colors duration-300"
        style={{ backgroundColor: `rgba(0, 0, 0, ${clampedDim})` }}
      />

      {/* Focused Centered Active Lyric Slide OR Instrumental Music Animation with Smooth Transitions */}
      <div
        className="relative z-20 w-full h-full flex items-center justify-center text-center"
        style={{
          paddingLeft: paddingInlineStyle,
          paddingRight: paddingInlineStyle,
        }}
      >
        {/* Active lyric slide with smooth 450ms slide-up & fade transition */}
        {showText && activeLine ? (
          <div
            key={`${activeLine.id || activeLine.index}-${activeLine.startTime}`}
            className="animate-slide-line max-w-full break-words whitespace-pre-line leading-[1.28]"
            style={{
              fontFamily: safeStyle.fontFamily,
              fontSize: fontSizeStyle,
              fontWeight: safeStyle.fontWeight,
              color: safeStyle.textColor,
              textShadow: safeStyle.textShadow,
            }}
          >
            {activeLine.text}
          </div>
        ) : showMusicAnim ? (
          /* Instrumental music animation / Harmonic Waves with smooth enter transition */
          <div className="animate-music-enter w-full flex items-center justify-center">
            <MusicInterludeAnimation
              variant={safeStyle.musicAnimation ?? 'lotus-pulse'}
              accentColor={safeStyle.textColor === '#FFFFFF' ? '#FCD34D' : safeStyle.textColor}
              isPreview={isPreview}
              containerWidth={containerWidth > 0 ? containerWidth : undefined}
              scaleFactor={safeStyle.musicAnimationScale ?? 1.0}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
});

