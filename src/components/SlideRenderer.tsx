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
export const SlideRenderer: React.FC<SlideRendererProps> = ({
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

  const clampedDim = Math.max(0, Math.min(0.85, safeStyle.backdropDim ?? 0.25));
  const unit = isPreview ? 'cqw' : 'vw';
  const showText = !isBlank && !isMusicInterlude && activeLine !== null && activeLine.text.trim().length > 0;
  const showMusicAnim = !isBlank && !showText && isMusicInterlude;

  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-black select-none ${
        isPreview ? 'stage-preview-container' : ''
      }`}
    >
      {/* Double-buffered background Layer A */}
      <div
        className="absolute inset-0 transition-opacity duration-[800ms] ease-in-out"
        style={{ opacity: activeSlot === 0 ? 1 : 0, zIndex: activeSlot === 0 ? 2 : 1 }}
      >
        {renderBackgroundLayer(slots[0])}
      </div>

      {/* Double-buffered background Layer B */}
      <div
        className="absolute inset-0 transition-opacity duration-[800ms] ease-in-out"
        style={{ opacity: activeSlot === 1 ? 1 : 0, zIndex: activeSlot === 1 ? 2 : 1 }}
      >
        {renderBackgroundLayer(slots[1])}
      </div>

      {/* Backdrop dimming scrim */}
      <div
        className="absolute inset-0 z-10 transition-colors duration-300"
        style={{ backgroundColor: `rgba(0, 0, 0, ${clampedDim})` }}
      />

      {/* Focused Centered Active Lyric Slide OR Instrumental Music Animation */}
      <div className="relative z-20 w-full h-full flex items-center justify-center text-center px-[8vw]">
        {showText && activeLine ? (
          <div
            key={activeLine.id}
            className="animate-slide-line max-w-full break-words whitespace-pre-line leading-[1.28]"
            style={{
              fontFamily: safeStyle.fontFamily,
              fontSize: `${safeStyle.fontSizeVw}${unit}`,
              fontWeight: safeStyle.fontWeight,
              color: safeStyle.textColor,
              textShadow: safeStyle.textShadow,
            }}
          >
            {activeLine.text}
          </div>
        ) : showMusicAnim ? (
          <MusicInterludeAnimation
            variant={safeStyle.musicAnimation ?? 'lotus-pulse'}
            accentColor={safeStyle.textColor === '#FFFFFF' ? '#FCD34D' : safeStyle.textColor}
            isPreview={isPreview}
          />
        ) : null}
      </div>
    </div>
  );
};

