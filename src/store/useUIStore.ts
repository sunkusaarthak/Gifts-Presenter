import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UIState {
  // Sidebar (Library)
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  setSidebarWidth: (width: number) => void;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Stage Console Setlist Sidebar
  stageSetlistWidth: number;
  setStageSetlistWidth: (width: number) => void;

  // Sync Studio Waveform Height
  waveformHeight: number;
  setWaveformHeight: (height: number) => void;

  // Sync Studio Right Preview Pane
  rightPanelWidth: number;
  setRightPanelWidth: (width: number) => void;
  previewEnabled: boolean;
  setPreviewEnabled: (enabled: boolean) => void;
  togglePreviewEnabled: () => void;

  // Waveform Zoom (px/sec)
  waveformZoom: number;
  setWaveformZoom: (zoom: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarWidth: 288,
      sidebarCollapsed: false,
      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.max(200, Math.min(450, Math.round(width))) }),
      toggleSidebarCollapsed: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      stageSetlistWidth: 320,
      setStageSetlistWidth: (width) =>
        set({ stageSetlistWidth: Math.max(220, Math.min(480, Math.round(width))) }),

      waveformHeight: 168,
      setWaveformHeight: (height) =>
        set({ waveformHeight: Math.max(110, Math.min(360, Math.round(height))) }),

      rightPanelWidth: 350,
      setRightPanelWidth: (width) =>
        set({ rightPanelWidth: Math.max(260, Math.min(580, Math.round(width))) }),

      previewEnabled: false,
      setPreviewEnabled: (enabled) => set({ previewEnabled: enabled }),
      togglePreviewEnabled: () => set((s) => ({ previewEnabled: !s.previewEnabled })),

      waveformZoom: 75,
      setWaveformZoom: (zoom) =>
        set({ waveformZoom: Math.max(20, Math.min(200, Math.round(zoom))) }),
    }),
    {
      name: 'satsang-presenter-ui-prefs',
    },
  ),
);

