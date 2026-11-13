import React, { useEffect, useState } from 'react';
import { DEFAULT_STYLE_CONFIG, type PresentationPayload } from '../shared/types';
import { SlideRenderer } from './SlideRenderer';

const INITIAL_PAYLOAD: PresentationPayload = {
  isPresenting: true,
  isBlank: false,
  isMusicInterlude: true,
  songId: null,
  songTitle: '',
  activeLine: null,
  styleConfig: DEFAULT_STYLE_CONFIG,
  isPreviewFallback: false,
};

/**
 * Window 2: Audience Output Screen.
 * Renders ONLY the background and centered active lyric slide with cursor hidden
 * on external projectors.
 */
export const OutputWindow: React.FC = () => {
  const [payload, setPayload] = useState<PresentationPayload>(INITIAL_PAYLOAD);

  useEffect(() => {
    let active = true;
    window.satsangAPI
      .getLatestPresentation()
      .then((initial) => {
        if (active && initial) {
          setPayload(initial);
        }
      })
      .catch(() => {});

    const unsub = window.satsangAPI.onPresentationUpdate((next) => {
      setPayload(next);
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  return (
    <div
      className={`w-screen h-screen overflow-hidden bg-black select-none ${
        payload.isPreviewFallback ? '' : 'cursor-none cursor-hidden'
      }`}
    >
      <SlideRenderer
        activeLine={payload.activeLine}
        styleConfig={payload.styleConfig}
        isBlank={payload.isBlank}
        isMusicInterlude={payload.isMusicInterlude}
        isPreview={false}
      />
    </div>
  );
};

