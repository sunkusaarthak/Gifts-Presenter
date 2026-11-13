import type { SatsangAPI } from '../electron/preload';

declare global {
  interface Window {
    satsangAPI: SatsangAPI;
  }
}

export {};

