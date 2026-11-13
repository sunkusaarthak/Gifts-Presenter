let currentZoom = 1.0;

type ZoomListener = (zoom: number) => void;
const listeners = new Set<ZoomListener>();

export function subscribeUiZoom(fn: ZoomListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getUiZoom(): number {
  return currentZoom;
}

export function setUiZoom(factor: number): number {
  const clamped = Math.max(0.65, Math.min(2.0, Number(factor.toFixed(2))));
  currentZoom = clamped;

  if (typeof window !== 'undefined') {
    // Clear any inline style.zoom on documentElement so CSS zoom never causes a dead letterbox gap
    if (document.documentElement.style.zoom) {
      document.documentElement.style.zoom = '';
    }

    if (typeof window.satsangAPI?.setZoomFactor === 'function') {
      try {
        window.satsangAPI.setZoomFactor(clamped);
      } catch {}
    } else {
      // Browser fallback (outside Electron): scale using CSS zoom with compensated 100% dimensions
      document.documentElement.style.zoom = String(clamped);
      document.documentElement.style.height = `${(100 / clamped).toFixed(2)}%`;
      document.documentElement.style.width = `${(100 / clamped).toFixed(2)}%`;
    }
  }

  listeners.forEach((fn) => {
    try {
      fn(clamped);
    } catch {}
  });

  return clamped;
}

export function zoomUiIn(): number {
  return setUiZoom(currentZoom + 0.1);
}

export function zoomUiOut(): number {
  return setUiZoom(currentZoom - 0.1);
}

export function zoomUiReset(): number {
  return setUiZoom(1.0);
}
