import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Columns,
  Eye,
  ListMusic,
  Monitor,
  Music,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  Tv,
} from 'lucide-react';
import { resolveStageDisplayState } from '../shared/binarySearch';
import {
  DEFAULT_STYLE_CONFIG,
  toMediaUrl,
  type PresentationPayload,
  type StyleConfig,
  type SyncedLine,
} from '../shared/types';
import { usePresenterStore } from '../store/usePresenterStore';
import { useUIStore } from '../store/useUIStore';
import { StageAudioEngine } from '../utils/audioEngine';
import { SlideRenderer } from './SlideRenderer';

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface ProjectorMirrorProps {
  currentLine: SyncedLine | null;
  styleConfig: StyleConfig;
  isBlank: boolean;
  isMusicInterlude: boolean;
  className?: string;
}

interface PrompterLineProgressBarProps {
  engineRef: React.RefObject<StageAudioEngine | null>;
  startTime: number;
  endTime: number;
  isPlaying: boolean;
  glow?: boolean;
  heightClass?: string;
}

const PrompterLineProgressBar: React.FC<PrompterLineProgressBarProps> = React.memo(
  ({ engineRef, startTime, endTime, isPlaying, glow = false, heightClass = 'h-1.5' }) => {
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      let animId = 0;
      const duration = Math.max(0.1, endTime - startTime);

      const update = () => {
        const engine = engineRef.current;
        if (engine && barRef.current) {
          const t = engine.getCurrentTime();
          const pct = Math.min(100, Math.max(0, ((t - startTime) / duration) * 100));
          barRef.current.style.width = `${pct}%`;
        }
        if (isPlaying) {
          animId = requestAnimationFrame(update);
        }
      };

      update();
      if (isPlaying) {
        animId = requestAnimationFrame(update);
      }
      return () => {
        if (animId) cancelAnimationFrame(animId);
      };
    }, [engineRef, startTime, endTime, isPlaying]);

    return (
      <div className={`w-full bg-white/5 ${heightClass} rounded-full overflow-hidden`}>
        <div
          ref={barRef}
          className={`bg-amber-400 h-full rounded-full ${
            glow ? 'shadow-[0_0_8px_rgba(245,185,66,0.6)]' : ''
          }`}
          style={{ width: '0%', willChange: 'width' }}
        />
      </div>
    );
  },
);

const ProjectorMirror: React.FC<ProjectorMirrorProps> = React.memo(({
  currentLine,
  styleConfig,
  isBlank,
  isMusicInterlude,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const targetRatio = 16 / 9;
      let w = cw;
      let h = w / targetRatio;
      if (h > ch) {
        h = ch;
        w = h * targetRatio;
      }
      setDims({ width: Math.floor(w), height: Math.floor(h) });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`flex-1 min-h-0 min-w-0 flex items-center justify-center p-1 overflow-hidden ${className}`}
    >
      <div
        className="relative rounded-xl overflow-hidden border border-white/10 bg-black shadow-2xl shrink-0"
        style={{
          width: dims.width > 0 ? `${dims.width}px` : '100%',
          height: dims.height > 0 ? `${dims.height}px` : 'auto',
          aspectRatio: '16 / 9',
        }}
      >
        <SlideRenderer
          activeLine={currentLine}
          styleConfig={styleConfig}
          isBlank={isBlank}
          isMusicInterlude={isMusicInterlude}
          isPreview={true}
        />
      </div>
    </div>
  );
});

export const StagePresenter: React.FC = () => {
  const songs = usePresenterStore((s) => s.songs);
  const activeSongId = usePresenterStore((s) => s.activeSongId);
  const settings = usePresenterStore((s) => s.settings);
  const isPresenting = usePresenterStore((s) => s.isPresenting);
  const isPreviewFallback = usePresenterStore((s) => s.isPreviewFallback);
  const isBlank = usePresenterStore((s) => s.isBlank);
  const selectSong = usePresenterStore((s) => s.selectSong);
  const showToast = usePresenterStore((s) => s.showToast);

  const activeSong = useMemo(
    () => songs.find((s) => s.id === activeSongId) ?? null,
    [songs, activeSongId],
  );
  const activeSongIndex = useMemo(
    () => songs.findIndex((s) => s.id === activeSongId),
    [songs, activeSongId],
  );

  const stageSetlistWidth = useUIStore((s) => s.stageSetlistWidth);
  const setStageSetlistWidth = useUIStore((s) => s.setStageSetlistWidth);
  const stageSetlistCollapsed = useUIStore((s) => s.stageSetlistCollapsed);
  const toggleStageSetlistCollapsed = useUIStore((s) => s.toggleStageSetlistCollapsed);
  const stageLayoutMode = useUIStore((s) => s.stageLayoutMode);
  const setStageLayoutMode = useUIStore((s) => s.setStageLayoutMode);

  const handleSetlistResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = stageSetlistWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        setStageSetlistWidth(startWidth + delta);
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [stageSetlistWidth, setStageSetlistWidth],
  );

  const engineRef = useRef<StageAudioEngine | null>(null);
  const lastEmittedSigRef = useRef<string>('');
  const lastClockSecRef = useRef<number>(-1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const [isMusicInterlude, setIsMusicInterlude] = useState<boolean>(true);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const activeSongRef = useRef(activeSong);
  activeSongRef.current = activeSong;
  const activeLineIdxRef = useRef(activeLineIndex);
  activeLineIdxRef.current = activeLineIndex;
  const isMusicInterludeRef = useRef(isMusicInterlude);
  isMusicInterludeRef.current = isMusicInterlude;
  const isBlankRef = useRef(isBlank);
  isBlankRef.current = isBlank;
  const isPresentingRef = useRef(isPresenting);
  isPresentingRef.current = isPresenting;
  const isPreviewFallbackRef = useRef(isPreviewFallback);
  isPreviewFallbackRef.current = isPreviewFallback;

  const currentLine = useMemo(() => {
    if (!activeSong || activeLineIndex < 0 || isMusicInterlude) return null;
    return activeSong.syncedLines[activeLineIndex] ?? null;
  }, [activeSong, activeLineIndex, isMusicInterlude]);

  const nextLine = useMemo(() => {
    if (!activeSong) return null;
    return activeSong.syncedLines[activeLineIndex + 1] ?? null;
  }, [activeSong, activeLineIndex]);

  const timeUntilNext = useMemo(() => {
    if (!nextLine || currentTime <= 0) return null;
    const diff = nextLine.startTime - currentTime;
    return diff > 0 ? diff : 0;
  }, [nextLine, currentTime]);

  const upcomingQueue = useMemo(() => {
    if (!activeSong) return [];
    const startIndex = Math.max(0, activeLineIndex + 1);
    return activeSong.syncedLines.slice(startIndex, startIndex + 3);
  }, [activeSong, activeLineIndex]);

  const emitPresentationIfChanged = useCallback((force = false) => {
    const song = activeSongRef.current;
    const idx = activeLineIdxRef.current;
    const isPlaying = isPlayingRef.current;
    const isInterlude = isMusicInterludeRef.current;
    const line = !isInterlude && song && idx >= 0 ? song.syncedLines[idx] ?? null : null;
    const styleConfig = song?.styleConfig ?? DEFAULT_STYLE_CONFIG;

    const sig = JSON.stringify({
      isPresenting: isPresentingRef.current,
      isBlank: isBlankRef.current,
      isMusicInterlude: isInterlude,
      isPlaying,
      songId: song?.id ?? null,
      lineId: line?.id ?? null,
      lineText: line?.text ?? null,
      styleConfig,
    });

    if (!force && sig === lastEmittedSigRef.current) return;
    lastEmittedSigRef.current = sig;

    const payload: PresentationPayload = {
      isPresenting: isPresentingRef.current,
      isBlank: isBlankRef.current,
      isMusicInterlude: isInterlude,
      isPlaying,
      songId: song?.id ?? null,
      songTitle: song?.title ?? '',
      activeLine: line,
      styleConfig,
      isPreviewFallback: isPreviewFallbackRef.current,
    };

    window.satsangAPI.syncPresentation(payload);
  }, []);

  // Initialize deterministic StageAudioEngine once for Stage Console
  useEffect(() => {
    const engine = new StageAudioEngine();
    engineRef.current = engine;

    engine.onEnded = () => {
      // Stage rule: NEVER auto-advance to next song when a track finishes.
      setIsPlaying(false);
      isPlayingRef.current = false;
      emitPresentationIfChanged(true);
    };

    engine.onError = (msg) => {
      setIsPlaying(false);
      isPlayingRef.current = false;
      emitPresentationIfChanged(true);
      showToast(`Stage audio error: ${msg}`, 'error');
    };

    if (settings.audioSinkId) {
      engine.setOutputDevice(settings.audioSinkId).catch(() => { });
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [showToast]);

  // Apply output device sink changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setOutputDevice(settings.audioSinkId).catch(() => { });
    }
  }, [settings.audioSinkId]);

  // Load selected song cleanly
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setIsPlaying(false);
    lastClockSecRef.current = 0;
    setCurrentTime(0);
    setActiveLineIndex(-1);
    activeLineIdxRef.current = -1;
    setIsMusicInterlude(true);
    isMusicInterludeRef.current = true;

    if (activeSong) {
      engine.loadSource(toMediaUrl(activeSong.audioPath));
    } else {
      engine.stopImmediately();
    }

    emitPresentationIfChanged(true);
  }, [activeSong?.id, emitPresentationIfChanged]);

  // Emit when presentation status or saved style changes
  useEffect(() => {
    emitPresentationIfChanged(false);
  }, [activeSong?.styleConfig, isBlank, isMusicInterlude, isPresenting, emitPresentationIfChanged]);

  // Zero-latency 60fps rAF O(log N) binary search sync loop driving Window 2 & Console
  // Time state updates are throttled to 1Hz (whole seconds) so React does not re-render the 1000-line tree at 60fps
  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const engine = engineRef.current;
      const song = activeSongRef.current;

      if (engine && song) {
        const isPaused = engine.isPaused();
        if (!isPaused) {
          const t = engine.getCurrentTime();
          const sec = Math.floor(t);
          if (sec !== lastClockSecRef.current) {
            lastClockSecRef.current = sec;
            setCurrentTime(sec);
          }

          const effectiveTime = t + (song.globalOffsetSeconds ?? 0);
          const resolved = resolveStageDisplayState(song.syncedLines, effectiveTime);

          if (
            resolved.activeLineIndex !== activeLineIdxRef.current ||
            resolved.isMusicInterlude !== isMusicInterludeRef.current
          ) {
            activeLineIdxRef.current = resolved.activeLineIndex;
            isMusicInterludeRef.current = resolved.isMusicInterlude;
            setActiveLineIndex(resolved.activeLineIndex);
            setIsMusicInterlude(resolved.isMusicInterlude);
            emitPresentationIfChanged(false);
          }
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [emitPresentationIfChanged]);

  const handleTogglePlayPause = useCallback(async () => {
    const engine = engineRef.current;
    const song = activeSongRef.current;
    if (!engine || !song) return;

    if (engine.isPlayingOrResuming()) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      engine.pauseWithFadeOut(() => {
        setIsPlaying(false);
        isPlayingRef.current = false;
        emitPresentationIfChanged(true);
      });
      emitPresentationIfChanged(true);
    } else {
      try {
        setIsPlaying(true);
        isPlayingRef.current = true;
        await engine.playWithFadeIn();
        const t = engine.getCurrentTime();
        const sec = Math.floor(t);
        lastClockSecRef.current = sec;
        setCurrentTime(sec);
        const effectiveTime = t + (song.globalOffsetSeconds ?? 0);
        const resolved = resolveStageDisplayState(song.syncedLines, effectiveTime);
        activeLineIdxRef.current = resolved.activeLineIndex;
        isMusicInterludeRef.current = resolved.isMusicInterlude;
        setActiveLineIndex(resolved.activeLineIndex);
        setIsMusicInterlude(resolved.isMusicInterlude);
        // CRITICAL: Force immediate presentation broadcast on play!
        emitPresentationIfChanged(true);
      } catch (err) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        showToast(`Playback failed: ${(err as Error).message}`, 'error');
      }
    }
  }, [showToast, emitPresentationIfChanged]);

  const handleSeekToLine = useCallback(
    (idx: number) => {
      const engine = engineRef.current;
      const song = activeSongRef.current;
      if (!engine || !song) return;
      const target = song.syncedLines[idx];
      if (!target) return;

      engine.seek(target.startTime);
      const sec = Math.floor(target.startTime);
      lastClockSecRef.current = sec;
      setCurrentTime(sec);
      if (engine.isPaused()) {
        engine.playWithFadeIn().catch(() => { });
        setIsPlaying(true);
      }
      activeLineIdxRef.current = idx;
      isMusicInterludeRef.current = false;
      setActiveLineIndex(idx);
      setIsMusicInterlude(false);
      emitPresentationIfChanged(true);
    },
    [emitPresentationIfChanged],
  );

  const handleReplayCurrentLine = useCallback(() => {
    const song = activeSongRef.current;
    if (!song) return;
    const idx = Math.max(0, activeLineIdxRef.current);
    handleSeekToLine(idx);
  }, [handleSeekToLine]);

  const handlePrevLine = useCallback(() => {
    if (activeLineIndex > 0) {
      handleSeekToLine(activeLineIndex - 1);
    }
  }, [activeLineIndex, handleSeekToLine]);

  const handleNextLine = useCallback(() => {
    if (activeSong && activeLineIndex < activeSong.syncedLines.length - 1) {
      handleSeekToLine(activeLineIndex + 1);
    }
  }, [activeSong, activeLineIndex, handleSeekToLine]);

  const handlePrevSong = useCallback(() => {
    if (activeSongIndex > 0) {
      selectSong(songs[activeSongIndex - 1].id);
    }
  }, [activeSongIndex, songs, selectSong]);

  const handleNextSong = useCallback(() => {
    if (activeSongIndex >= 0 && activeSongIndex < songs.length - 1) {
      selectSong(songs[activeSongIndex + 1].id);
    }
  }, [activeSongIndex, songs, selectSong]);

  // Stage Console Hotkeys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlayPause();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleReplayCurrentLine();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        handleNextLine();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        handlePrevLine();
      } else if (e.code === 'ArrowLeft' || e.code === 'PageUp') {
        e.preventDefault();
        handlePrevSong();
      } else if (e.code === 'ArrowRight' || e.code === 'PageDown') {
        e.preventDefault();
        handleNextSong();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleTogglePlayPause,
    handleReplayCurrentLine,
    handleNextLine,
    handlePrevLine,
    handlePrevSong,
    handleNextSong,
  ]);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-stage-bg text-slate-100 select-none">
      {/* Main Console Workspace: 2-Column Split */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Song Library Setlist */}
        {!stageSetlistCollapsed && (
          <div
            style={{ width: `${stageSetlistWidth}px` }}
            className="relative shrink-0 flex flex-col border-r border-stage-border bg-[#0a0c12] select-none"
          >
            <div className="flex items-center justify-between border-b border-stage-border px-3.5 py-2.5 bg-stage-panel/60 shrink-0">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <ListMusic className="h-4 w-4 text-amber-400" />
                Gifts Setlist ({songs.length})
              </span>
              <button
                type="button"
                onClick={toggleStageSetlistCollapsed}
                title="Collapse Setlist Sidebar"
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1 slim-scrollbar">
              {songs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                  <Music className="mb-2 h-7 w-7 text-slate-600" />
                  <p className="text-xs">No songs in library</p>
                </div>
              ) : (
                songs.map((song, idx) => {
                  const isSelected = song.id === activeSongId;
                  return (
                    <button
                      key={song.id}
                      type="button"
                      onClick={() => selectSong(song.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all ${
                        isSelected
                          ? 'border-amber-400/80 bg-amber-500/15 text-white shadow-[0_0_16px_rgba(245,185,66,0.1)] font-semibold'
                          : 'border-transparent bg-stage-panel/30 text-slate-300 hover:border-slate-700 hover:bg-stage-panel'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`font-mono text-xs font-bold w-5 shrink-0 ${
                            isSelected ? 'text-amber-300' : 'text-slate-500'
                          }`}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate text-xs font-medium tracking-tight">
                          {song.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pl-1.5 font-mono text-[11px] text-slate-500">
                        {isSelected && isPlaying && (
                          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                        )}
                        <span>{formatClock(song.duration)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Interactive Drag Resizer Handle */}
            <div
              onMouseDown={handleSetlistResizeStart}
              title="Drag to resize setlist panel"
              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:w-2 hover:bg-amber-500/60 transition-all z-20"
            />
          </div>
        )}

        {/* Right Column: Live Stage Prompter Command Center */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-gradient-to-b from-[#0b0d14] to-[#07080c]">
          {/* Header Bar: Streamlined & Single-Row */}
          <div className="flex flex-nowrap items-center justify-between gap-3 border-b border-stage-border/80 bg-stage-panel/30 px-4 py-2 shrink-0 select-none min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 shrink">
              {stageSetlistCollapsed && (
                <button
                  type="button"
                  onClick={toggleStageSetlistCollapsed}
                  title="Expand Setlist Sidebar"
                  className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-amber-500/50 hover:text-white transition-all shrink-0 active:scale-95"
                >
                  <PanelLeftOpen className="h-3.5 w-3.5 text-amber-400" />
                  <span>Setlist ({songs.length})</span>
                </button>
              )}

              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 shrink-0">
                <Monitor className="h-4 w-4" />
              </div>

              <div className="min-w-0 truncate">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                  {activeSong?.title || 'No Song Selected'}
                </h1>
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                  <span className="font-mono text-amber-300 font-semibold">
                    {isMusicInterlude
                      ? '♪ Instrumental Music'
                      : `Slide ${(activeLineIndex >= 0 ? activeLineIndex : 0) + 1} of ${activeSong?.syncedLines.length || 0}`}
                  </span>
                  <span>•</span>
                  <span>Duration: {formatClock(activeSong?.duration || 0)}</span>
                </p>
              </div>
            </div>

            {/* Right Controls: View Switcher, Live Status, Master Clock */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Layout Mode Pills */}
              <div className="hidden sm:flex items-center rounded-xl border border-stage-border bg-black/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setStageLayoutMode('split')}
                  title="Split View: Dual prompter cards + Live 16:9 mirror side-by-side"
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    stageLayoutMode === 'split'
                      ? 'border border-amber-500/60 bg-amber-500/20 text-amber-300 font-bold shadow-[0_0_12px_rgba(245,185,66,0.2)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Columns className="h-3 w-3" />
                  <span>Split</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStageLayoutMode('prompter')}
                  title="Prompter Focus: Maximized prompter cards for performers"
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    stageLayoutMode === 'prompter'
                      ? 'border border-amber-500/60 bg-amber-500/20 text-amber-300 font-bold shadow-[0_0_12px_rgba(245,185,66,0.2)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Eye className="h-3 w-3" />
                  <span>Prompter</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStageLayoutMode('mirror')}
                  title="Output Feed: Maximized audience mirror for visual director"
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    stageLayoutMode === 'mirror'
                      ? 'border border-amber-500/60 bg-amber-500/20 text-amber-300 font-bold shadow-[0_0_12px_rgba(245,185,66,0.2)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Tv className="h-3 w-3" />
                  <span>Output Feed</span>
                </button>
              </div>

              {/* Status Badge */}
              <div
                className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  isPresenting
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.15)]'
                    : 'border-slate-700 bg-black/40 text-slate-400'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${isPresenting ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}
                />
                <span className="hidden md:inline">
                  {isPresenting
                    ? isPreviewFallback
                      ? '16:9 Preview Active'
                      : 'Audience Display Live'
                    : 'Audience Screen Idle'}
                </span>
              </div>

              {/* Master Time Clock */}
              <div className="flex items-center gap-1 font-mono text-xs sm:text-sm rounded-xl border border-stage-border bg-black/50 px-3 py-1 text-amber-300 font-bold shrink-0">
                <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>{formatClock(currentTime)}</span>
                <span className="text-slate-500 font-normal">/</span>
                <span className="text-slate-400 font-normal text-xs">{formatClock(activeSong?.duration || 0)}</span>
              </div>
            </div>
          </div>

          {/* Main Stage Viewport (100% Zero-Scroll Viewport) */}
          <div className="flex-1 min-h-0 min-w-0 p-3 sm:p-3.5 overflow-hidden">
            {stageLayoutMode === 'split' ? (
              /* Split View: Prompter Deck (Left) + 16:9 Live Output Mirror (Right) */
              <div className="h-full w-full flex flex-col md:flex-row gap-3 min-h-0 min-w-0 overflow-hidden">
                {/* Left: Prompter Cards Stack */}
                <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-2.5 h-full overflow-hidden">
                  {/* Card 1: CURRENTLY ON AUDIENCE SCREEN */}
                  <div className="flex-[1.2] min-h-0 flex flex-col justify-between rounded-2xl border-2 border-amber-400/80 bg-gradient-to-b from-amber-500/15 via-[#0d1017] to-[#090b10] p-3.5 sm:p-4 shadow-[0_0_28px_rgba(245,185,66,0.12)] overflow-hidden">
                    <div className="flex items-center justify-between border-b border-amber-500/25 pb-2 shrink-0">
                      <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-300">
                        <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                        Currently On Audience Screen
                      </span>
                      <span className="rounded-full bg-amber-400/20 border border-amber-400/50 px-2.5 py-0.5 text-[11px] font-bold font-mono text-amber-200">
                        {isMusicInterlude
                          ? '♪ Instrumental Music'
                          : `Slide #${(activeLineIndex >= 0 ? activeLineIndex : 0) + 1} / ${activeSong?.syncedLines.length || 0}`}
                      </span>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-2 text-center overflow-hidden">
                      {isMusicInterlude ? (
                        <div className="space-y-1.5 animate-in fade-in duration-200">
                          <div className="flex items-center justify-center gap-1.5 text-sky-400">
                            <Music2 className="h-6 w-6 animate-pulse" />
                            <span className="flex gap-1 items-end h-5">
                              <span className="h-3 w-1 bg-sky-400 rounded-full animate-bounce [animation-delay:0ms]" />
                              <span className="h-5 w-1 bg-sky-400 rounded-full animate-bounce [animation-delay:150ms]" />
                              <span className="h-4 w-1 bg-sky-400 rounded-full animate-bounce [animation-delay:300ms]" />
                            </span>
                          </div>
                          <div className="text-base sm:text-lg font-bold text-sky-200">
                            Sacred Instrumental Music Animation Active
                          </div>
                          <p className="text-[11px] text-slate-400 max-w-sm line-clamp-2">
                            {activeLineIndex < 0
                              ? 'Intro solo playing — active lyrics will appear when singing begins.'
                              : 'Interlude gap — holding serene lotus visual on stage display.'}
                          </p>
                        </div>
                      ) : currentLine ? (
                        <div className="space-y-1.5 animate-in fade-in zoom-in-95 duration-150 w-full px-2">
                          <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-amber-100 tracking-wide drop-shadow-[0_2px_12px_rgba(245,185,66,0.35)] leading-snug line-clamp-3">
                            &ldquo;{currentLine.text}&rdquo;
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-500 text-xs sm:text-sm">
                          Press PLAY STAGE or Spacebar to begin presentation
                        </div>
                      )}
                    </div>

                    <div className="pt-2 shrink-0 border-t border-amber-500/15 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono text-amber-300/80">
                        {currentLine ? (
                          <>
                            <span>Timing: {formatClock(currentLine.startTime)} → {formatClock(currentLine.endTime)}</span>
                            <span>{(currentLine.endTime - currentLine.startTime).toFixed(1)}s</span>
                          </>
                        ) : (
                          <span className="text-slate-500">Ready</span>
                        )}
                      </div>
                      {currentLine && isPlaying && (
                        <PrompterLineProgressBar
                          engineRef={engineRef}
                          startTime={currentLine.startTime}
                          endTime={currentLine.endTime}
                          isPlaying={isPlaying}
                          glow={true}
                        />
                      )}
                    </div>
                  </div>

                  {/* Card 2: UPCOMING NEXT (GET READY) */}
                  <div className="flex-1 min-h-0 flex flex-col justify-between rounded-2xl border border-sky-500/40 bg-gradient-to-b from-sky-500/10 via-[#0a0d15] to-[#07090e] p-3 sm:p-3.5 shadow-md overflow-hidden">
                    <div className="flex items-center justify-between border-b border-sky-500/20 pb-2 shrink-0">
                      <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-sky-300">
                        <Eye className="h-3.5 w-3.5 text-sky-400" />
                        Upcoming Next (Get Ready)
                      </span>
                      <span className="rounded-full bg-sky-500/20 border border-sky-400/40 px-2 py-0.5 text-[11px] font-bold font-mono text-sky-200">
                        {nextLine ? `Next #${activeLineIndex + 2}` : 'End of Song'}
                      </span>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-1.5 text-center overflow-hidden w-full px-2">
                      {nextLine ? (
                        <div className="space-y-1.5 w-full">
                          <div className="text-base sm:text-lg lg:text-xl font-bold text-slate-100 tracking-wide line-clamp-2">
                            &ldquo;{nextLine.text}&rdquo;
                          </div>
                          <div className="flex items-center justify-center gap-2 text-xs font-mono">
                            <span className="text-sky-300 font-semibold">
                              Starts at {formatClock(nextLine.startTime)}
                            </span>
                            {timeUntilNext !== null && (
                              <span className="rounded-md bg-sky-400/20 border border-sky-400/40 px-1.5 py-0.2 text-sky-200 font-bold text-[10px]">
                                in {timeUntilNext.toFixed(1)}s
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-400 text-xs italic">
                          — Outro Music / Final Slide Complete —
                        </div>
                      )}
                    </div>

                    <div className="pt-1.5 text-center text-[10px] text-slate-500 border-t border-white/5 shrink-0">
                      Press <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-slate-300">↓</kbd> to skip directly to next slide
                    </div>
                  </div>
                </div>

                {/* Right: LIVE 16:9 AUDIENCE OUTPUT MIRROR */}
                <div className="flex-1 min-h-0 min-w-0 flex flex-col h-full rounded-2xl border border-stage-border bg-[#090b10] p-3 shadow-xl overflow-hidden justify-between">
                  <div className="flex items-center justify-between pb-2 border-b border-stage-border/60 shrink-0 gap-2">
                    <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 truncate">
                      <Tv className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">Live 16:9 Projector Mirror</span>
                    </span>

                    <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider shrink-0 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                      {activeSong?.styleConfig?.musicAnimation ?? 'lotus-pulse'}
                    </span>
                  </div>

                  {/* 16:9 Screen Fit Viewport */}
                  <ProjectorMirror
                    currentLine={currentLine}
                    styleConfig={activeSong?.styleConfig ?? DEFAULT_STYLE_CONFIG}
                    isBlank={isBlank}
                    isMusicInterlude={isMusicInterlude}
                  />

                  {/* Forward Situational Queue */}
                  {upcomingQueue.length > 0 && (
                    <div className="pt-2 border-t border-white/5 flex items-center gap-2 overflow-hidden shrink-0 text-[11px]">
                      <span className="text-slate-500 font-mono uppercase tracking-wider text-[9px] shrink-0">
                        Up Next:
                      </span>
                      <div className="flex-1 flex gap-2 overflow-hidden">
                        {upcomingQueue.slice(0, 2).map((qLine) => (
                          <div
                            key={qLine.id}
                            className="flex-1 min-w-0 truncate rounded-lg border border-slate-800 bg-black/40 px-2 py-0.5 text-slate-300 text-[10px]"
                          >
                            <span className="font-mono text-amber-400/80 mr-1">{formatClock(qLine.startTime)}</span>
                            <span className="truncate">{qLine.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : stageLayoutMode === 'prompter' ? (
              /* Prompter Focus: Wide Dual Cards + Floating PiP Mirror */
              <div className="h-full w-full flex flex-col md:flex-row gap-3 min-h-0 min-w-0 overflow-hidden relative">
                {/* Current Slide Card (Maximized) */}
                <div className="flex-1 min-h-0 flex flex-col justify-between rounded-2xl border-2 border-amber-400/80 bg-gradient-to-b from-amber-500/15 via-[#0d1017] to-[#090b10] p-4 shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between border-b border-amber-500/25 pb-2 shrink-0">
                    <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-300">
                      <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
                      Currently On Audience Screen
                    </span>
                    <span className="rounded-full bg-amber-400/20 border border-amber-400/50 px-2.5 py-0.5 text-xs font-bold font-mono text-amber-200">
                      {isMusicInterlude
                        ? '♪ Instrumental Music'
                        : `Slide #${(activeLineIndex >= 0 ? activeLineIndex : 0) + 1} / ${activeSong?.syncedLines.length || 0}`}
                    </span>
                  </div>

                  <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-4 text-center overflow-hidden">
                    {isMusicInterlude ? (
                      <div className="space-y-2 animate-in fade-in duration-200">
                        <Music2 className="h-8 w-8 text-sky-400 mx-auto animate-pulse" />
                        <div className="text-xl font-bold text-sky-200">
                          Sacred Instrumental Music Animation Active
                        </div>
                      </div>
                    ) : currentLine ? (
                      <div className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-amber-100 tracking-wide drop-shadow-[0_2px_14px_rgba(245,185,66,0.4)] leading-tight">
                        &ldquo;{currentLine.text}&rdquo;
                      </div>
                    ) : (
                      <div className="text-slate-500 text-sm">Press Spacebar to play</div>
                    )}
                  </div>

                  <div className="pt-2 shrink-0 border-t border-amber-500/15 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono text-amber-300/80">
                      {currentLine && (
                        <>
                          <span>Timing: {formatClock(currentLine.startTime)} → {formatClock(currentLine.endTime)}</span>
                          <span>{(currentLine.endTime - currentLine.startTime).toFixed(1)}s</span>
                        </>
                      )}
                    </div>
                    {currentLine && isPlaying && (
                      <PrompterLineProgressBar
                        engineRef={engineRef}
                        startTime={currentLine.startTime}
                        endTime={currentLine.endTime}
                        isPlaying={isPlaying}
                        glow={false}
                        heightClass="h-2"
                      />
                    )}
                  </div>
                </div>

                {/* Upcoming Next Card */}
                <div className="flex-1 min-h-0 flex flex-col justify-between rounded-2xl border border-sky-500/40 bg-gradient-to-b from-sky-500/10 via-[#0a0d15] to-[#07090e] p-4 shadow-md overflow-hidden">
                  <div className="flex items-center justify-between border-b border-sky-500/20 pb-2 shrink-0">
                    <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-sky-300">
                      <Eye className="h-4 w-4 text-sky-400" />
                      Upcoming Next (Get Ready)
                    </span>
                    <span className="rounded-full bg-sky-500/20 border border-sky-400/40 px-2.5 py-0.5 text-xs font-bold font-mono text-sky-200">
                      {nextLine ? `Next #${activeLineIndex + 2}` : 'End'}
                    </span>
                  </div>

                  <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-4 text-center overflow-hidden">
                    {nextLine ? (
                      <div className="space-y-2">
                        <div className="text-xl sm:text-2xl font-bold text-slate-100 tracking-wide">
                          &ldquo;{nextLine.text}&rdquo;
                        </div>
                        <div className="font-mono text-xs text-sky-300">
                          Starts at {formatClock(nextLine.startTime)}
                          {timeUntilNext !== null && ` • in ${timeUntilNext.toFixed(1)}s`}
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-400 text-sm italic">— Final Slide Complete —</div>
                    )}
                  </div>

                  <div className="pt-2 text-center text-xs text-slate-500 border-t border-white/5 shrink-0">
                    Press <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-slate-300">↓</kbd> to skip directly
                  </div>
                </div>

                {/* Picture-in-Picture Mini 16:9 Mirror */}
                <div className="hidden xl:block absolute bottom-4 right-4 w-48 aspect-video rounded-xl overflow-hidden border border-white/20 bg-black shadow-2xl z-20 pointer-events-none">
                  <SlideRenderer
                    activeLine={currentLine}
                    styleConfig={activeSong?.styleConfig ?? DEFAULT_STYLE_CONFIG}
                    isBlank={isBlank}
                    isMusicInterlude={isMusicInterlude}
                    isPreview={true}
                  />
                </div>
              </div>
            ) : (
              /* Mirror Focus: Maximized 16:9 Output Screen */
              <div className="h-full w-full flex flex-col gap-2.5 min-h-0 min-w-0 overflow-hidden">
                <div className="flex-1 min-h-0 min-w-0 flex flex-col p-2 rounded-2xl border border-stage-border bg-[#090b10] overflow-hidden">
                  <ProjectorMirror
                    currentLine={currentLine}
                    styleConfig={activeSong?.styleConfig ?? DEFAULT_STYLE_CONFIG}
                    isBlank={isBlank}
                    isMusicInterlude={isMusicInterlude}
                  />
                </div>

                {/* Bottom Compact Prompter Strip */}
                <div className="shrink-0 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-black/60 px-4 py-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-300 font-bold shrink-0">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                    <span>Active:</span>
                  </div>
                  <div className="flex-1 truncate text-amber-100 font-bold">
                    {isMusicInterlude ? '♪ Instrumental Music Animation Active' : currentLine?.text || 'Idle'}
                  </div>
                  {nextLine && (
                    <div className="flex items-center gap-2 text-slate-400 text-xs shrink-0 pl-3 border-l border-white/10">
                      <span className="text-sky-300 font-semibold">Next:</span>
                      <span className="truncate max-w-[200px] text-slate-200">&ldquo;{nextLine.text}&rdquo;</span>
                      <span className="font-mono text-sky-400">({formatClock(nextLine.startTime)})</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Transport Dock: Full Stage Controls */}
      <div className="border-t border-stage-border bg-stage-panel/95 px-4 sm:px-6 py-2.5 shrink-0 select-none">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            disabled={activeSongIndex <= 0}
            onClick={handlePrevSong}
            className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3 sm:px-4 py-2 text-xs font-bold text-slate-100 hover:border-amber-500/50 hover:bg-white/10 disabled:opacity-30 transition-all active:scale-95"
          >
            <SkipBack className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Previous Song</span>
            <span className="sm:hidden">Prev</span>
          </button>

          <button
            type="button"
            onClick={handleReplayCurrentLine}
            disabled={!activeSong || activeSong.syncedLines.length === 0}
            title="Replay active lyric line from start (R)"
            className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3 sm:px-4 py-2 text-xs font-bold text-amber-300 hover:border-amber-500/50 hover:bg-amber-500/10 disabled:opacity-30 transition-all active:scale-95"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Replay (R)</span>
          </button>

          <button
            type="button"
            disabled={!activeSong}
            onClick={handleTogglePlayPause}
            className={`flex flex-1 max-w-[240px] items-center justify-center gap-2 rounded-xl px-6 py-2 text-sm sm:text-base font-extrabold shadow-xl transition-all active:scale-95 disabled:opacity-30 ${
              isPlaying
                ? 'bg-amber-400 text-black hover:bg-amber-300 shadow-[0_0_20px_rgba(245,185,66,0.25)]'
                : 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4 sm:h-5 sm:w-5 fill-current" />
                <span>PAUSE (Space)</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 sm:h-5 sm:w-5 fill-current" />
                <span>PLAY STAGE (Space)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleNextLine}
            disabled={!activeSong || activeLineIndex >= activeSong.syncedLines.length - 1}
            title="Advance immediately to next lyric line (Down Arrow ↓)"
            className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3 sm:px-4 py-2 text-xs font-bold text-slate-100 hover:border-amber-500/50 hover:bg-white/10 disabled:opacity-30 transition-all active:scale-95"
          >
            <span>Next Line (↓)</span>
            <SkipForward className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={activeSongIndex < 0 || activeSongIndex >= songs.length - 1}
            onClick={handleNextSong}
            className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3 sm:px-4 py-2 text-xs font-bold text-slate-100 hover:border-amber-500/50 hover:bg-white/10 disabled:opacity-30 transition-all active:scale-95"
          >
            <span className="hidden sm:inline">Next Song</span>
            <span className="sm:hidden">Next</span>
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
