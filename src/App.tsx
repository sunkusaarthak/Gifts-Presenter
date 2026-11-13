import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FolderArchive,
  FolderDown,
  Monitor,
  Presentation,
  Settings,
  Square,
  Tv,
} from 'lucide-react';
import { DEFAULT_STYLE_CONFIG, type PresentationPayload } from './shared/types';
import { usePresenterStore } from './store/usePresenterStore';
import { getUiZoom, subscribeUiZoom, zoomUiIn, zoomUiOut, zoomUiReset } from './utils/uiZoom';
import { LibrarySidebar } from './components/LibrarySidebar';
import { NewSongModal } from './components/NewSongModal';
import { SettingsModal } from './components/SettingsModal';
import { StagePresenter } from './components/StagePresenter';
import { SyncStudio } from './components/SyncStudio';

export const App: React.FC = () => {
  const initialize = usePresenterStore((s) => s.initialize);
  const songs = usePresenterStore((s) => s.songs);
  const activeSongId = usePresenterStore((s) => s.activeSongId);
  const mode = usePresenterStore((s) => s.mode);
  const setMode = usePresenterStore((s) => s.setMode);
  const displays = usePresenterStore((s) => s.displays);
  const settings = usePresenterStore((s) => s.settings);
  const isPresenting = usePresenterStore((s) => s.isPresenting);
  const isBlank = usePresenterStore((s) => s.isBlank);
  const setIsPresenting = usePresenterStore((s) => s.setIsPresenting);
  const isLoading = usePresenterStore((s) => s.isLoading);
  const flushSaveActiveSong = usePresenterStore((s) => s.flushSaveActiveSong);
  const toast = usePresenterStore((s) => s.toast);
  const clearToast = usePresenterStore((s) => s.clearToast);
  const showToast = usePresenterStore((s) => s.showToast);
  const exportProject = usePresenterStore((s) => s.exportProject);
  const importProject = usePresenterStore((s) => s.importProject);

  const [newSongOpen, setNewSongOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [uiScale, setUiScale] = useState(getUiZoom);

  useEffect(() => {
    return subscribeUiZoom((z) => setUiScale(z));
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initialize().then((fn) => {
      cleanup = fn;
    });
    return () => {
      cleanup?.();
    };
  }, [initialize]);

  // Global Whole UI Zoom Hotkeys (Ctrl + +, Ctrl + -, Ctrl + 0)
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      // If event was already handled / prevented by timeline, skip whole UI zoom
      if (e.defaultPrevented) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd' || e.code === 'Equal') {
          e.preventDefault();
          const z = zoomUiIn();
          setUiScale(z);
          showToast(`Whole UI Scale: ${Math.round(z * 100)}%`, 'info');
        } else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' || e.code === 'Minus') {
          e.preventDefault();
          const z = zoomUiOut();
          setUiScale(z);
          showToast(`Whole UI Scale: ${Math.round(z * 100)}%`, 'info');
        } else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault();
          const z = zoomUiReset();
          setUiScale(z);
          showToast('Whole UI Scale: 100% (Default)', 'info');
        } else if (e.key === 'b' || e.key === 'B' || e.code === 'KeyB') {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
            e.preventDefault();
            useUIStore.getState().toggleSidebarCollapsed();
          }
        }
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [showToast]);

  const activeSong = useMemo(
    () => songs.find((s) => s.id === activeSongId) ?? null,
    [songs, activeSongId],
  );

  const externalDisplays = useMemo(
    () => displays.filter((d) => !d.isPrimary),
    [displays],
  );

  const targetExternal = useMemo(() => {
    if (externalDisplays.length === 0) return null;
    if (settings.preferredDisplayId != null) {
      return externalDisplays.find((d) => d.id === settings.preferredDisplayId) ?? externalDisplays[0];
    }
    return externalDisplays[0];
  }, [externalDisplays, settings.preferredDisplayId]);

  const handleTogglePresentation = async () => {
    if (isPresenting) {
      await window.satsangAPI.stopPresentation();
      setIsPresenting(false, false);
      return;
    }

    const payload: PresentationPayload = {
      isPresenting: true,
      isBlank,
      isMusicInterlude: true,
      songId: activeSong?.id ?? null,
      songTitle: activeSong?.title ?? '',
      activeLine: null,
      styleConfig: activeSong?.styleConfig ?? DEFAULT_STYLE_CONFIG,
      isPreviewFallback: externalDisplays.length === 0,
    };

    try {
      // Flush all per-song timing/look changes to disk before entering Stage Console
      await flushSaveActiveSong(false);
      // Switch Window 1 into distraction-free Stage Console automatically
      setMode('stage');
      const res = await window.satsangAPI.startPresentation(payload, settings.preferredDisplayId);
      setIsPresenting(true, res.isPreviewFallback);
      showToast(
        res.isPreviewFallback
          ? 'No external display detected — opened 16:9 floating stage preview.'
          : 'Audience Output Screen active on external display.',
        'success',
      );
    } catch (err) {
      showToast(`Failed to launch presentation: ${(err as Error).message}`, 'error');
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-stage-bg text-slate-100 select-none">
      {/* Top Master Stage Header (with Windows window controls safe margin) */}
      <header
        className="flex h-14 shrink-0 items-center justify-between border-b border-stage-border bg-[#0b0d13] px-4 pr-36 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.webp"
              alt="Gifts Presenter Logo"
              className="h-8 w-8 rounded-xl object-cover border border-amber-500/40 shadow-sm shrink-0"
            />
            <div>
              <div className="text-sm font-bold tracking-wide text-white leading-none">
                GIFTS PRESENTER
              </div>
            </div>
          </div>

          <div className="h-6 w-px bg-stage-border mx-1" />

          {/* Module Switcher */}
          <nav className="flex items-center rounded-xl border border-stage-border bg-stage-bg p-1">
            <button
              type="button"
              onClick={() => setMode('studio')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'studio'
                  ? 'bg-stage-card text-amber-300 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Sync Studio
            </button>
            <button
              type="button"
              onClick={() => setMode('stage')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'stage'
                  ? 'bg-stage-card text-amber-300 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Tv className="h-3.5 w-3.5" />
              Stage Console
            </button>
          </nav>

          {/* Project Actions Dropdown Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setProjectMenuOpen(!projectMenuOpen)}
              className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-amber-500/50 hover:text-white transition-colors"
            >
              <FolderArchive className="h-3.5 w-3.5 text-amber-400" />
              <span>Project</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
            {projectMenuOpen && (
              <div
                onMouseLeave={() => setProjectMenuOpen(false)}
                className="absolute left-0 mt-2 w-72 rounded-2xl border border-stage-border bg-stage-panel p-2 shadow-2xl z-50 space-y-1"
              >
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Project Backup & Restore
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    exportProject();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors"
                >
                  <FolderArchive className="h-4 w-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Save Project (.gifts.zip)</div>
                    <div className="text-[10px] text-slate-400">Backs up all songs, audio & stage looks</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    importProject();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors"
                >
                  <FolderDown className="h-4 w-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Import Project (.gifts.zip)</div>
                    <div className="text-[10px] text-slate-400">Restore complete project archive</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Dynamic Display Indicator */}
          <div
            className={`hidden md:flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${
              targetExternal
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/35 bg-amber-500/10 text-amber-200'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            {targetExternal
              ? `Ext: ${targetExternal.label} (${targetExternal.bounds.width}×${targetExternal.bounds.height})`
              : 'Single Display (16:9 Preview Fallback)'}
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Stage & Alignment Settings"
            className="rounded-xl border border-stage-border bg-stage-card p-2 text-slate-300 hover:border-amber-500/50 hover:text-white"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleTogglePresentation}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold tracking-wide transition-all shadow-lg ${
              isPresenting
                ? 'bg-rose-500 text-white hover:bg-rose-400'
                : 'bg-amber-500 text-black hover:bg-amber-400'
            }`}
          >
            {isPresenting ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop Presentation
              </>
            ) : (
              <>
                <Presentation className="h-4 w-4" />
                Start Presentation
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace (Takes 100% remaining space between header and footer) */}
      <main className="flex flex-1 min-h-0 overflow-hidden">
        {/* Library management sidebar lives strictly in Studio; Stage Console shows only Song List + Transport */}
        {mode === 'studio' && (
          <LibrarySidebar onNewSong={() => setNewSongOpen(true)} />
        )}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Loading offline Gifts library...
          </div>
        ) : mode === 'studio' ? (
          <SyncStudio onNewSong={() => setNewSongOpen(true)} />
        ) : (
          <StagePresenter />
        )}
      </main>

      {/* Bottom Stage Footer Guide: Anchors the layout & acts as floor limit */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-stage-border bg-[#07090e] px-4 text-[11px] font-medium text-slate-400 select-none z-20">
        {/* Left: System Status & Active Song */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            {isPresenting ? (
              <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                LIVE ON STAGE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Offline Ready
              </span>
            )}
          </div>

          <span className="text-stage-border">|</span>

          <div className="truncate text-slate-300">
            {activeSong ? (
              <span className="flex items-center gap-2">
                <strong className="text-white">{activeSong.title}</strong>
                <span className="text-slate-400 font-mono">
                  ({activeSong.syncedLines.length} lines • {Math.floor(activeSong.duration / 60)}:{String(Math.floor(activeSong.duration % 60)).padStart(2, '0')})
                </span>
              </span>
            ) : (
              <span className="text-slate-500">No Song Selected</span>
            )}
          </div>
        </div>

        {/* Center: Stage / Studio Context & Status Marker */}
        <div className="hidden lg:flex items-center gap-2 text-slate-500 font-mono text-[10px]">
          <span className="text-amber-400/80 font-semibold uppercase tracking-wider">
            {mode === 'studio' ? 'Sync Studio' : 'Stage Console'}
          </span>
          <span>•</span>
          <span>Offline Presentation Engine</span>
        </div>

        {/* Right: Display Status & Interactive UI Zoom Controls */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <Monitor className="h-3 w-3 text-slate-400" />
            <span className={targetExternal ? 'text-emerald-400' : 'text-slate-400'}>
              {targetExternal
                ? `Ext: ${targetExternal.label} (${targetExternal.bounds.width}×${targetExternal.bounds.height})`
                : 'Single Display (16:9 Fallback)'}
            </span>
          </div>

          <span className="text-stage-border">|</span>

          {/* Interactive UI Zoom Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const z = zoomUiOut();
                setUiScale(z);
              }}
              title="Zoom UI Out (Ctrl + -)"
              className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => {
                const z = zoomUiReset();
                setUiScale(z);
              }}
              title="Reset UI Scale to 100% (Ctrl + 0)"
              className="font-mono text-[10px] text-slate-300 hover:text-amber-300 px-1 py-0.5"
            >
              UI {Math.round(uiScale * 100)}%
            </button>
            <button
              type="button"
              onClick={() => {
                const z = zoomUiIn();
                setUiScale(z);
              }}
              title="Zoom UI In (Ctrl + +)"
              className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
            >
              +
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <NewSongModal open={newSongOpen} onClose={() => setNewSongOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Toast Notification */}
      {toast && (
        <div
          onClick={clearToast}
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium shadow-2xl cursor-pointer ${
            toast.type === 'error'
              ? 'border-rose-500/50 bg-rose-950/90 text-rose-200'
              : toast.type === 'success'
                ? 'border-emerald-500/50 bg-emerald-950/90 text-emerald-200'
                : 'border-amber-500/50 bg-slate-900/95 text-slate-100'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          )}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
};

export default App;

