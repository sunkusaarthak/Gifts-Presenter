import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UIState {
  // Sidebar (Library)
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  setSidebarWidth: (width: number) => void;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Stage Console Setlist Sidebar & Layout
  stageSetlistWidth: number;
  setStageSetlistWidth: (width: number) => void;
  stageSetlistCollapsed: boolean;
  setStageSetlistCollapsed: (collapsed: boolean) => void;
  toggleStageSetlistCollapsed: () => void;
  stageLayoutMode: 'split' | 'prompter' | 'mirror';
  setStageLayoutMode: (mode: 'split' | 'prompter' | 'mirror') => void;

  // Sync Studio Waveform Height
  waveformHeight: number;
  setWaveformHeight: (height: number) => void;

  // Sync Studio Right Preview Pane
  rightPanelWidth: number;
  setRightPanelWidth: (width: number) => void;
  previewEnabled: boolean;
  setPreviewEnabled: (enabled: boolean) => void;
  togglePreviewEnabled: () => void;

  // Stage Look & Song Config Preview Pane Width
  configPreviewWidth: number;
  setConfigPreviewWidth: (width: number) => void;
  configPreviewCollapsed: boolean;
  setConfigPreviewCollapsed: (collapsed: boolean) => void;
  toggleConfigPreviewCollapsed: () => void;

  // Waveform Zoom (px/sec)
  waveformZoom: number;
  setWaveformZoom: (zoom: number) => void;

  // Live Sync Panel Visibility (Visible by default)
  manualSyncVisible: boolean;
  setManualSyncVisible: (visible: boolean) => void;
  toggleManualSyncVisible: () => void;

  // Lyric Timeline Visibility (Hidden by default; toggleable via header or [Lyrics] button)
  lyricsTimelineVisible: boolean;
  setLyricsTimelineVisible: (visible: boolean) => void;
  toggleLyricsTimelineVisible: () => void;

  // Sync Studio Lower Workspace Layout (Side-by-Side vs Stacked)
  syncLayoutMode: 'side-by-side' | 'stacked';
  setSyncLayoutMode: (mode: 'side-by-side' | 'stacked') => void;
  toggleSyncLayoutMode: () => void;

  // Manual Sync Panel Width when Side-by-Side (px)
  manualSyncWidth: number;
  setManualSyncWidth: (width: number) => void;

  // Stage Look Apply-to-All-Songs Modal State
  applyAllModalOpen: boolean;
  setApplyAllModalOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarWidth: 288,
      sidebarCollapsed: true,
      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.max(200, Math.min(450, Math.round(width))) }),
      toggleSidebarCollapsed: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      stageSetlistWidth: 280,
      setStageSetlistWidth: (width) =>
        set({ stageSetlistWidth: Math.max(200, Math.min(480, Math.round(width))) }),
      stageSetlistCollapsed: false,
      setStageSetlistCollapsed: (collapsed) => set({ stageSetlistCollapsed: collapsed }),
      toggleStageSetlistCollapsed: () =>
        set((s) => ({ stageSetlistCollapsed: !s.stageSetlistCollapsed })),
      stageLayoutMode: 'split',
      setStageLayoutMode: (mode) => set({ stageLayoutMode: mode }),

      waveformHeight: 168,
      setWaveformHeight: (height) =>
        set({ waveformHeight: Math.max(110, Math.min(360, Math.round(height))) }),

      rightPanelWidth: 350,
      setRightPanelWidth: (width) =>
        set({ rightPanelWidth: Math.max(260, Math.min(580, Math.round(width))) }),

      previewEnabled: false,
      setPreviewEnabled: (enabled) => set({ previewEnabled: enabled }),
      togglePreviewEnabled: () => set((s) => ({ previewEnabled: !s.previewEnabled })),

      // Song Config Stage Look Preview Pane
      configPreviewWidth: 420,
      setConfigPreviewWidth: (width) =>
        set({ configPreviewWidth: Math.max(300, Math.min(680, Math.round(width))) }),
      configPreviewCollapsed: false,
      setConfigPreviewCollapsed: (collapsed) => set({ configPreviewCollapsed: collapsed }),
      toggleConfigPreviewCollapsed: () =>
        set((s) => ({ configPreviewCollapsed: !s.configPreviewCollapsed })),

      waveformZoom: 75,
      setWaveformZoom: (zoom) =>
        set({ waveformZoom: Math.max(20, Math.min(200, Math.round(zoom))) }),

      // Default: Waveform + Live Sync Panel ONLY
      manualSyncVisible: true,
      setManualSyncVisible: (visible) => set({ manualSyncVisible: visible }),
      toggleManualSyncVisible: () => set((s) => ({ manualSyncVisible: !s.manualSyncVisible })),

      // Default: Lyric Timeline hidden by default
      lyricsTimelineVisible: false,
      setLyricsTimelineVisible: (visible) => set({ lyricsTimelineVisible: visible }),
      toggleLyricsTimelineVisible: () =>
        set((s) => ({ lyricsTimelineVisible: !s.lyricsTimelineVisible })),

      syncLayoutMode: 'side-by-side',
      setSyncLayoutMode: (mode) => set({ syncLayoutMode: mode }),
      toggleSyncLayoutMode: () =>
        set((s) => ({
          syncLayoutMode: s.syncLayoutMode === 'side-by-side' ? 'stacked' : 'side-by-side',
        })),

      manualSyncWidth: 460,
      setManualSyncWidth: (width) =>
        set({ manualSyncWidth: Math.max(280, Math.min(800, Math.round(width))) }),

      applyAllModalOpen: false,
      setApplyAllModalOpen: (open) => set({ applyAllModalOpen: open }),
    }),
    {
      name: 'gifts-presenter-ui-prefs-v3',
      version: 3,
    },
  ),
);
