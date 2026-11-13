import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Eye,
  ListMusic,
  Monitor,
  Music,
  Music2,
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

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const [isMusicInterlude, setIsMusicInterlude] = useState<boolean>(true);

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

  const emitPresentationIfChanged = useCallback((force = false) => {
    const song = activeSongRef.current;
    const idx = activeLineIdxRef.current;
    const effectiveInterlude = isMusicInterludeRef.current;
    const line = !effectiveInterlude && song && idx >= 0 ? song.syncedLines[idx] ?? null : null;
    const styleConfig = song?.styleConfig ?? DEFAULT_STYLE_CONFIG;

    const sig = JSON.stringify({
      isPresenting: isPresentingRef.current,
      isBlank: isBlankRef.current,
      isMusicInterlude: effectiveInterlude,
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
      isMusicInterlude: effectiveInterlude,
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
    };

    engine.onError = (msg) => {
      setIsPlaying(false);
      showToast(msg, 'error');
    };

    if (settings.audioSinkId) {
      engine.setOutputDevice(settings.audioSinkId).catch(() => {});
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [showToast]);

  // Apply output device sink changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setOutputDevice(settings.audioSinkId).catch(() => {});
    }
  }, [settings.audioSinkId]);

  // Load selected song cleanly
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setIsPlaying(false);
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
  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const engine = engineRef.current;
      const song = activeSongRef.current;

      if (engine && song) {
        const isPaused = engine.isPaused();
        if (!isPaused) {
          const t = engine.getCurrentTime();
          setCurrentTime(t);
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

  // Heartbeat sync ensures Window 2 reflects immediately when presentation starts
  useEffect(() => {
    if (!isPresenting) return;
    const timer = window.setInterval(() => {
      const engine = engineRef.current;
      const song = activeSongRef.current;
      if (engine && song && !engine.isPaused()) {
        const t = engine.getCurrentTime();
        const effectiveTime = t + (song.globalOffsetSeconds ?? 0);
        const resolved = resolveStageDisplayState(song.syncedLines, effectiveTime);
        activeLineIdxRef.current = resolved.activeLineIndex;
        isMusicInterludeRef.current = resolved.isMusicInterlude;
        setActiveLineIndex(resolved.activeLineIndex);
        setIsMusicInterlude(resolved.isMusicInterlude);
        emitPresentationIfChanged(false);
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [isPresenting, emitPresentationIfChanged]);

  const handleTogglePlayPause = useCallback(async () => {
    const engine = engineRef.current;
    const song = activeSongRef.current;
    if (!engine || !song) return;

    if (engine.isPlayingOrResuming()) {
      setIsPlaying(false);
      engine.pauseWithFadeOut(() => {
        setIsPlaying(false);
      });
    } else {
      try {
        setIsPlaying(true);
        await engine.playWithFadeIn();
        const t = engine.getCurrentTime();
        setCurrentTime(t);
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
      setCurrentTime(target.startTime);
      if (engine.isPaused()) {
        engine.playWithFadeIn().catch(() => {});
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
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-stage-bg text-slate-100">
      {/* Main Console Workspace: 2-Column Split */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Song Library List */}
        <div
          style={{ width: `${stageSetlistWidth}px` }}
          className="relative shrink-0 flex flex-col border-r border-stage-border bg-[#0a0c12] select-none"
        >
          <div className="flex items-center justify-between border-b border-stage-border px-4 py-3 bg-stage-panel/60">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <ListMusic className="h-4 w-4 text-amber-400" />
              Gifts Setlist ({songs.length})
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {activeSongIndex >= 0 ? `#${activeSongIndex + 1} Selected` : ''}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5 slim-scrollbar">
            {songs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                <Music className="mb-2 h-8 w-8 text-slate-600" />
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
                    className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-all ${
                      isSelected
                        ? 'border-amber-400/80 bg-amber-500/15 text-white shadow-[0_0_20px_rgba(245,185,66,0.1)]'
                        : 'border-stage-border bg-stage-panel/40 text-slate-300 hover:border-slate-500 hover:bg-stage-panel'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`font-mono text-xs font-bold w-6 shrink-0 ${
                          isSelected ? 'text-amber-300' : 'text-slate-500'
                        }`}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate text-sm font-semibold tracking-tight">
                        {song.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pl-2">
                      {isSelected && isPlaying && (
                        <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                      )}
                      <span className="font-mono text-xs text-slate-500">
                        {formatClock(song.duration)}
                      </span>
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

        {/* Right Column: Live Stage Prompter ("Currently Happening", "What's Next", 16:9 Mirror) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-5 bg-gradient-to-b from-[#0b0d14] to-[#07080c] slim-scrollbar">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stage-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-wide">
                  {activeSong?.title || 'No Song Selected'}
                </h1>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                  <span>{activeSong?.syncedLines.length || 0} Lyric Slides</span>
                  <span>•</span>
                  <span>Duration: {formatClock(activeSong?.duration || 0)}</span>
                </p>
              </div>
            </div>

            {/* Live Status Indicators */}
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold ${
                  isPresenting
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                    : 'border-slate-700 bg-black/40 text-slate-400'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isPresenting ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                {isPresenting
                  ? isPreviewFallback
                    ? '16:9 Stage Preview Active'
                    : 'Audience Projector Live'
                  : 'Audience Screen Idle'}
              </div>

              <div className="flex items-center gap-1.5 font-mono text-sm rounded-xl border border-stage-border bg-black/50 px-3.5 py-1.5 text-amber-300">
                <Clock className="h-4 w-4 text-amber-400" />
                <strong>{formatClock(currentTime)}</strong>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400">{formatClock(activeSong?.duration || 0)}</span>
              </div>
            </div>
          </div>

          {/* Cards Grid: "Currently Happening" and "What's Next" */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Card 1: CURRENTLY ON AUDIENCE SCREEN */}
            <div className="flex flex-col rounded-3xl border-2 border-amber-400/80 bg-gradient-to-b from-amber-500/15 via-[#0d1017] to-[#090b10] p-5 shadow-[0_0_36px_rgba(245,185,66,0.1)] transition-all">
              <div className="flex items-center justify-between border-b border-amber-500/25 pb-3">
                <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
                  Currently On Audience Screen
                </span>
                <span className="rounded-full bg-amber-400/20 border border-amber-400/50 px-2.5 py-0.5 text-xs font-bold font-mono text-amber-200">
                  {isMusicInterlude
                    ? '♪ Instrumental Music'
                    : `Slide #${(activeLineIndex >= 0 ? activeLineIndex : 0) + 1} / ${
                        activeSong?.syncedLines.length || 0
                      }`}
                </span>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center py-6 text-center min-h-[140px]">
                {isMusicInterlude ? (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-center gap-1.5 text-sky-400">
                      <Music2 className="h-7 w-7 animate-pulse" />
                      <span className="flex gap-1">
                        <span className="h-4 w-1 bg-sky-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="h-6 w-1 bg-sky-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="h-5 w-1 bg-sky-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </span>
                    </div>
                    <div className="text-lg font-bold text-sky-200">
                      Sacred Instrumental Music Animation Active
                    </div>
                    <p className="text-xs text-slate-400 max-w-sm">
                      {activeLineIndex < 0
                        ? 'Intro solo playing — active lyrics will appear when singing begins.'
                        : 'Interlude gap — holding serene lotus visual on stadium display.'}
                    </p>
                  </div>
                ) : currentLine ? (
                  <div className="space-y-2 animate-in fade-in zoom-in-95 duration-150">
                    <div className="text-2xl lg:text-3xl font-extrabold text-amber-100 tracking-wide drop-shadow-[0_2px_12px_rgba(245,185,66,0.35)] leading-relaxed">
                      "{currentLine.text}"
                    </div>
                    <div className="font-mono text-xs text-amber-300/80">
                      Timing: {formatClock(currentLine.startTime)} → {formatClock(currentLine.endTime)} •{' '}
                      {(currentLine.endTime - currentLine.startTime).toFixed(1)}s
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm">
                    Press Play or Spacebar to start stage presentation
                  </div>
                )}
              </div>

              {/* Progress bar for active line */}
              {currentLine && isPlaying && (
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full transition-all duration-75 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          ((currentTime - currentLine.startTime) /
                            Math.max(0.1, currentLine.endTime - currentLine.startTime)) *
                            100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Card 2: WHAT'S NEXT (UPCOMING SLIDE) */}
            <div className="flex flex-col rounded-3xl border border-sky-500/40 bg-gradient-to-b from-sky-500/10 via-[#0a0d15] to-[#07090e] p-5 shadow-lg">
              <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
                <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-sky-300">
                  <Eye className="h-4 w-4 text-sky-400" />
                  Upcoming Next (Get Ready)
                </span>
                <span className="rounded-full bg-sky-500/20 border border-sky-400/40 px-2.5 py-0.5 text-xs font-bold font-mono text-sky-200">
                  {nextLine ? `Next #${activeLineIndex + 2}` : 'End of Song'}
                </span>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center py-6 text-center min-h-[140px]">
                {nextLine ? (
                  <div className="space-y-2.5">
                    <div className="text-lg lg:text-xl font-bold text-slate-100 tracking-wide">
                      "{nextLine.text}"
                    </div>
                    <div className="flex items-center justify-center gap-3 text-xs font-mono">
                      <span className="text-sky-300 font-semibold">
                        Starts at {formatClock(nextLine.startTime)}
                      </span>
                      {timeUntilNext !== null && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="rounded-md bg-sky-400/20 border border-sky-400/40 px-2 py-0.5 text-sky-200 font-bold">
                            in {timeUntilNext.toFixed(1)}s
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 text-sm italic">
                    — Final line complete / Outro Music —
                  </div>
                )}
              </div>

              <div className="pt-2 text-center text-[11px] text-slate-500 border-t border-white/5">
                Press <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-slate-300">↓</kbd> to skip directly to next slide
              </div>
            </div>
          </div>

          {/* 16:9 Live Audience Screen Mirror */}
          <div className="flex flex-col rounded-3xl border border-stage-border bg-[#090b10] p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 px-2">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <Tv className="h-4 w-4 text-amber-400" />
                Live 16:9 Audience Output Mirror (Exact Projector Feed)
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {activeSong?.styleConfig.musicAnimation || 'lotus-pulse'}
              </span>
            </div>

            <div className="aspect-[16/9] w-full max-w-2xl mx-auto rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl relative">
              <SlideRenderer
                activeLine={currentLine}
                styleConfig={activeSong?.styleConfig ?? DEFAULT_STYLE_CONFIG}
                isBlank={isBlank}
                isMusicInterlude={isMusicInterlude}
                isPreview={true}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Transport Dock: Full Stage Controls */}
      <div className="border-t border-stage-border bg-stage-panel px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <button
            type="button"
            disabled={activeSongIndex <= 0}
            onClick={handlePrevSong}
            className="flex items-center gap-2 rounded-2xl border border-stage-border bg-stage-card px-4 py-3 text-xs font-bold text-slate-100 hover:border-amber-500/50 hover:bg-white/10 disabled:opacity-30 transition-all active:scale-95"
          >
            <SkipBack className="h-4 w-4" />
            Previous Song
          </button>

          <button
            type="button"
            onClick={handleReplayCurrentLine}
            disabled={!activeSong || activeSong.syncedLines.length === 0}
            title="Replay active lyric line from start (R)"
            className="flex items-center gap-1.5 rounded-2xl border border-stage-border bg-stage-card px-4 py-3 text-xs font-bold text-amber-300 hover:border-amber-500/50 hover:bg-amber-500/10 disabled:opacity-30 transition-all active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
            Replay Line (R)
          </button>

          <button
            type="button"
            disabled={!activeSong}
            onClick={handleTogglePlayPause}
            className={`flex flex-1 max-w-[260px] items-center justify-center gap-2.5 rounded-2xl px-8 py-3.5 text-base font-extrabold shadow-xl transition-all active:scale-95 disabled:opacity-30 ${
              isPlaying
                ? 'bg-amber-400 text-black hover:bg-amber-300 shadow-[0_0_24px_rgba(245,185,66,0.25)]'
                : 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.25)]'
            }`}
          >
            {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
            {isPlaying ? 'PAUSE (Space)' : 'PLAY STAGE (Space)'}
          </button>

          <button
            type="button"
            onClick={handleNextLine}
            disabled={!activeSong || activeLineIndex >= activeSong.syncedLines.length - 1}
            title="Advance immediately to next lyric line (Down Arrow ↓)"
            className="flex items-center gap-1.5 rounded-2xl border border-stage-border bg-stage-card px-4 py-3 text-xs font-bold text-slate-100 hover:border-amber-500/50 hover:bg-white/10 disabled:opacity-30 transition-all active:scale-95"
          >
            Next Line (↓)
            <SkipForward className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={activeSongIndex < 0 || activeSongIndex >= songs.length - 1}
            onClick={handleNextSong}
            className="flex items-center gap-2 rounded-2xl border border-stage-border bg-stage-card px-4 py-3 text-xs font-bold text-slate-100 hover:border-amber-500/50 hover:bg-white/10 disabled:opacity-30 transition-all active:scale-95"
          >
            Next Song
            <SkipForward className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
