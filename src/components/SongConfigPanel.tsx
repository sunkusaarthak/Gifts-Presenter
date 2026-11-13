import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CopyCheck,
  EyeOff,
  Film,
  Flame,
  Image as ImageIcon,
  Loader2,
  Minus,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Tv,
  Type,
  Upload,
  X,
} from 'lucide-react';
import {
  BUILTIN_FONTS,
  DEFAULT_STYLE_CONFIG,
  GRADIENT_PRESETS,
  TEXT_COLOR_PRESETS,
  toMediaUrl,
  type MusicAnimationStyle,
  type SongPackage,
} from '../shared/types';
import { usePresenterStore } from '../store/usePresenterStore';
import { useUIStore } from '../store/useUIStore';
import { registerAudioAnalyser } from '../utils/audioVisualizerBus';
import { SlideRenderer } from './SlideRenderer';

interface SongConfigPanelProps {
  song: SongPackage;
  onGoToStage: () => void;
}

export const SongConfigPanel: React.FC<SongConfigPanelProps> = ({ song, onGoToStage }) => {
  const songs = usePresenterStore((s) => s.songs);
  const assets = usePresenterStore((s) => s.assets);
  const updateStyleConfig = usePresenterStore((s) => s.updateStyleConfig);
  const updateGlobalOffset = usePresenterStore((s) => s.updateGlobalOffset);
  const importBackgroundAsset = usePresenterStore((s) => s.importBackgroundAsset);
  const importFontAsset = usePresenterStore((s) => s.importFontAsset);
  const flushSaveActiveSong = usePresenterStore((s) => s.flushSaveActiveSong);
  const applyStyleConfigToAllSongs = usePresenterStore((s) => s.applyStyleConfigToAllSongs);

  // UI preferences store (persisted across sessions)
  const configPreviewWidth = useUIStore((s) => s.configPreviewWidth);
  const setConfigPreviewWidth = useUIStore((s) => s.setConfigPreviewWidth);
  const configPreviewCollapsed = useUIStore((s) => s.configPreviewCollapsed);
  const toggleConfigPreviewCollapsed = useUIStore((s) => s.toggleConfigPreviewCollapsed);
  const applyAllModalOpen = useUIStore((s) => s.applyAllModalOpen);
  const setApplyAllModalOpen = useUIStore((s) => s.setApplyAllModalOpen);

  const [previewMode, setPreviewMode] = useState<'lyric' | 'music' | 'blank'>('lyric');
  const [sampleLineIdx, setSampleLineIdx] = useState(0);
  const [activeTabFilter, setActiveTabFilter] = useState<'backdrop' | 'typography'>('backdrop');
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [includeOffsetInApply, setIncludeOffsetInApply] = useState(false);
  const [isAuditioning, setIsAuditioning] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Stop, release and reset audio whenever the active song or its audio changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setIsAuditioning(false);
    registerAudioAnalyser(null);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      registerAudioAnalyser(null);
    };
  }, [song.id, song.audioPath]);

  const toggleAudition = () => {
    if (isAuditioning) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsAuditioning(false);
      registerAudioAnalyser(null);
    } else {
      if (!song.audioPath) return;

      const mediaUrl = toMediaUrl(song.audioPath);

      // Recreate audio element if missing or pointing to a different song's audio
      if (!audioRef.current || audioRef.current.src !== mediaUrl) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }

        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.src = mediaUrl;
        audioRef.current = audio;

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;

        source.connect(analyser);
        analyser.connect(ctx.destination);
        registerAudioAnalyser(analyser);

        audio.addEventListener('ended', () => {
          setIsAuditioning(false);
          registerAudioAnalyser(null);
        });
      }

      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }

      audioRef.current
        .play()
        .then(() => {
          setIsAuditioning(true);
          setPreviewMode('music');
        })
        .catch((err) => {
          console.error('Failed to audition song audio:', err);
          setIsAuditioning(false);
        });
    }
  };

  const style = song.styleConfig ?? DEFAULT_STYLE_CONFIG;
  const customFonts = assets.filter((a) => a.kind === 'font');
  const mediaBackgrounds = assets.filter((a) => a.kind === 'image' || a.kind === 'video');

  const safeSampleIdx =
    song.syncedLines.length > 0 ? Math.min(sampleLineIdx, song.syncedLines.length - 1) : 0;
  const previewLine =
    song.syncedLines[safeSampleIdx] ?? {
      id: 'sample-preview',
      index: 0,
      startTime: 0,
      endTime: 5,
      text: song.title || 'Sacred Stage Lyric Preview',
    };

  const interludeCount = song.syncedLines.reduce((acc, line, idx) => {
    const next = song.syncedLines[idx + 1];
    if (next && next.startTime - line.endTime >= 1.8) return acc + 1;
    return acc;
  }, song.syncedLines[0]?.startTime >= 0.8 ? 1 : 0);

  // Smooth drag-resizing for right preview panel
  const handlePreviewResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = configPreviewWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      setConfigPreviewWidth(startW + delta);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleApplyToAllSongs = async () => {
    setIsApplyingAll(true);
    try {
      await flushSaveActiveSong(false);
      await applyStyleConfigToAllSongs({ includeOffset: includeOffsetInApply });
      setApplyAllModalOpen(false);
    } finally {
      setIsApplyingAll(false);
    }
  };

  const activeFontLabel =
    BUILTIN_FONTS.find((f) => f.value === style.fontFamily)?.label.split('(')[0]?.trim() ||
    customFonts.find((f) => f.id === style.fontAssetPath)?.name ||
    'Stage Font';

  const activeBgLabel =
    style.backgroundType === 'gradient'
      ? (GRADIENT_PRESETS.find((g) => g.css === style.backgroundSrc)?.name || 'Stage Gradient')
      : style.backgroundType.toUpperCase();

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-stage-bg select-none">
      {/* Left Workspace: Stage Look Configuration Studio */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Clean Sub-Header Toolbar (Matching Sync Studio Toolbar Pill Style) */}
        <div className="flex items-center justify-between border-b border-stage-border px-5 py-2.5 bg-stage-panel/50 shrink-0">
          {/* Individual Category Filter Pills with Icons and Active Amber Glow */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTabFilter('backdrop')}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                activeTabFilter === 'backdrop'
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,185,66,0.2)]'
                  : 'border-stage-border bg-stage-card text-slate-300 hover:text-white hover:border-slate-500'
              }`}
            >
              <Sliders
                className={`h-3.5 w-3.5 ${activeTabFilter === 'backdrop' ? 'text-amber-400' : 'text-slate-400'}`}
              />
              <span>Backdrop & Anim</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTabFilter('typography')}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                activeTabFilter === 'typography'
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,185,66,0.2)]'
                  : 'border-stage-border bg-stage-card text-slate-300 hover:text-white hover:border-slate-500'
              }`}
            >
              <Type
                className={`h-3.5 w-3.5 ${activeTabFilter === 'typography' ? 'text-amber-400' : 'text-slate-400'}`}
              />
              <span>Typography & Colors</span>
            </button>
          </div>

          {configPreviewCollapsed && (
            <button
              type="button"
              onClick={toggleConfigPreviewCollapsed}
              className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-amber-500/50 transition-colors"
              title="Show Stage Screen Preview Panel"
            >
              <Tv className="h-3.5 w-3.5 text-amber-400" />
              <span>Show Preview</span>
            </button>
          )}
        </div>

        {/* Scrollable Configuration Canvas */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6 slim-scrollbar">
          <div className="w-full min-w-0 space-y-6">
            {/* Card 1: Visual Backdrop, Dimming & Music Interludes */}
            {activeTabFilter === 'backdrop' && (
              <div className="rounded-2xl border border-stage-border bg-stage-panel p-5 space-y-5 shadow-lg">
                <div className="flex items-center justify-between border-b border-stage-border/70 pb-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                    <Sliders className="h-4 w-4 text-amber-400" />
                    Backdrop, Dimming & Music Interludes
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Type: <strong className="text-slate-200 capitalize">{style.backgroundType}</strong>
                  </span>
                </div>

                {/* Backdrop Dimming Overlay Slider + Quick Presets */}
                <div className="space-y-2.5 rounded-xl border border-stage-border bg-stage-bg p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">Backdrop Dimming Overlay</span>
                    <span className="font-mono text-amber-300 font-bold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                      {Math.round(style.backdropDim * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.85}
                    step={0.05}
                    value={style.backdropDim}
                    onChange={(e) => updateStyleConfig({ backdropDim: Number(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                  />
                  <div className="flex items-center justify-between gap-1.5 pt-1">
                    {[
                      { p: 0, label: '0% Clear' },
                      { p: 0.25, label: '25% Soft' },
                      { p: 0.5, label: '50% Medium' },
                      { p: 0.75, label: '75% Deep' },
                    ].map((item) => (
                      <button
                        key={item.p}
                        type="button"
                        onClick={() => updateStyleConfig({ backdropDim: item.p })}
                        className={`flex-1 rounded-xl py-1.5 text-xs font-semibold border transition-all active:scale-95 ${
                          Math.abs(style.backdropDim - item.p) < 0.04
                            ? 'border-amber-400 bg-amber-500/20 text-amber-300 font-bold shadow-sm'
                            : 'border-stage-border bg-stage-card text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Instrumental Music Interlude Animation (4 Cards) */}
                <div className="space-y-3">
                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 border-b border-stage-border/60 pb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 shrink-0">
                        <Music2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                            Instrumental Music Animation
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 border border-sky-400/30 px-2 py-0.5 text-[10px] font-bold text-sky-300 whitespace-nowrap shadow-sm shrink-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                            Music-Reactive
                          </span>
                        </div>
                      </div>
                    </div>

                    {song.audioPath && (
                      <button
                        type="button"
                        onClick={toggleAudition}
                        className={`shrink-0 flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shadow-md active:scale-95 ${
                          isAuditioning
                            ? 'border border-amber-400 bg-amber-500/30 text-amber-200 ring-2 ring-amber-400/50 shadow-[0_0_12px_rgba(245,185,66,0.25)] animate-pulse'
                            : 'border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400/60'
                        }`}
                        title="Play or pause audio to audition music reactivity live"
                      >
                        {isAuditioning ? (
                          <>
                            <Pause className="h-3.5 w-3.5 fill-amber-300 stroke-[2.5]" />
                            <span>Stop Audition</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 fill-amber-300 stroke-[2.5]" />
                            <span>Audition with Music</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                    {(
                      [
                        {
                          id: 'sacred-waves',
                          label: 'Harmonic Waves',
                          desc: 'Dynamic audio spectrum',
                          icon: Activity,
                        },
                        {
                          id: 'lotus-pulse',
                          label: 'Sacred Lotus',
                          desc: 'Golden mandala bloom',
                          icon: Sparkles,
                        },
                        {
                          id: 'aurora-orb',
                          label: 'Radiant Diya Orb',
                          desc: 'Warm ambient glow pulse',
                          icon: Flame,
                        },
                        {
                          id: 'none',
                          label: 'Backdrop Only',
                          desc: 'Quiet stage background',
                          icon: EyeOff,
                        },
                      ] as Array<{
                        id: MusicAnimationStyle;
                        label: string;
                        desc: string;
                        icon: typeof Activity;
                      }>
                    ).map((anim) => {
                      const selected = (style.musicAnimation ?? 'lotus-pulse') === anim.id;
                      const IconComp = anim.icon;

                      return (
                        <button
                          key={anim.id}
                          type="button"
                          onClick={() => {
                            updateStyleConfig({ musicAnimation: anim.id });
                            setPreviewMode('music');
                          }}
                          className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                            selected
                              ? 'border-amber-400 bg-gradient-to-b from-amber-500/20 via-amber-500/10 to-amber-950/20 text-white ring-1 ring-amber-400/40 shadow-lg shadow-amber-500/10'
                              : 'border-stage-border/80 bg-stage-bg/60 text-slate-300 hover:border-slate-500/80 hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-2.5">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                                selected
                                  ? 'border-amber-400/50 bg-amber-400/20 text-amber-300 shadow-sm'
                                  : 'border-stage-border bg-black/40 text-slate-400 group-hover:text-slate-200'
                              }`}
                            >
                              <IconComp className="h-4 w-4" />
                            </div>

                            <div
                              className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                                selected
                                  ? 'border-amber-400 bg-amber-400 text-black shadow-sm'
                                  : 'border-slate-700 bg-black/40 text-transparent group-hover:border-slate-500'
                              }`}
                            >
                              <Check className="h-3 w-3 stroke-[3]" />
                            </div>
                          </div>

                          <div className="space-y-0.5">
                            <div
                              className={`text-xs font-bold leading-tight ${
                                selected ? 'text-amber-200' : 'text-slate-200 group-hover:text-white'
                              }`}
                            >
                              {anim.label}
                            </div>
                            <div className="text-[11px] text-slate-400 leading-tight">
                              {anim.desc}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 1-Click Stage Gradients (800ms Crossfade) */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Stage Gradients (800ms Crossfade)
                    </span>
                    <span className="text-[10px] text-slate-500">6 Ambient Presets</span>
                  </div>
                  <div className="grid gap-2.5 grid-cols-3 sm:grid-cols-6">
                    {GRADIENT_PRESETS.map((preset) => {
                      const selected =
                        style.backgroundType === 'gradient' && style.backgroundSrc === preset.css;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            updateStyleConfig({
                              backgroundType: 'gradient',
                              backgroundSrc: preset.css,
                            })
                          }
                          className={`group relative h-16 rounded-xl border overflow-hidden transition-all text-left ${
                            selected
                              ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-lg scale-[1.02]'
                              : 'border-stage-border hover:border-slate-500'
                          }`}
                          style={{ background: preset.css }}
                          title={preset.name}
                        >
                          {selected && (
                            <div className="absolute top-1.5 right-1.5 rounded-full bg-amber-500 p-0.5 shadow">
                              <Check className="h-2.5 w-2.5 text-black stroke-[3]" />
                            </div>
                          )}
                          <span className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-1 text-[10px] font-semibold text-slate-200 truncate">
                            {preset.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Images & Looping Video Backdrops */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Images & Looping Video Backdrops
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const asset = await importBackgroundAsset();
                        if (asset) {
                          updateStyleConfig({
                            backgroundType: asset.kind === 'video' ? 'video' : 'image',
                            backgroundSrc: asset.relativePath,
                          });
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3 py-1.5 text-xs font-semibold text-amber-300 hover:border-amber-500/50 hover:bg-amber-500/10 transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Add Media
                    </button>
                  </div>

                  {mediaBackgrounds.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-stage-border bg-stage-bg/50 p-4 text-center text-xs text-slate-500 space-y-1">
                      <p className="font-medium text-slate-400">No custom stage backdrops imported yet.</p>
                      <p className="text-[11px]">Click &quot;Add Media&quot; to import looping .mp4 / .webm videos or .jpg / .png photos.</p>
                    </div>
                  ) : (
                    <div className="grid gap-2.5 overflow-y-auto pr-1 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 max-h-72">
                      {mediaBackgrounds.map((asset) => {
                        const selected = style.backgroundSrc === asset.relativePath;
                        const url = toMediaUrl(asset.relativePath);
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() =>
                              updateStyleConfig({
                                backgroundType: asset.kind === 'video' ? 'video' : 'image',
                                backgroundSrc: asset.relativePath,
                              })
                            }
                            className={`group relative h-20 rounded-xl border overflow-hidden transition-all text-left ${
                              selected
                                ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-md'
                                : 'border-stage-border hover:border-slate-500'
                            }`}
                          >
                            {asset.kind === 'video' ? (
                              <video
                                src={url}
                                muted
                                loop
                                autoPlay
                                playsInline
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <img src={url} alt={asset.name} className="h-full w-full object-cover" />
                            )}
                            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/80 px-2 py-1 text-[10px] text-white">
                              <span className="flex items-center gap-1 truncate">
                                {asset.kind === 'video' ? (
                                  <Film className="h-3 w-3 text-amber-300 shrink-0" />
                                ) : (
                                  <ImageIcon className="h-3 w-3 text-sky-300 shrink-0" />
                                )}
                                <span className="truncate">{asset.name}</span>
                              </span>
                              {selected && <Check className="h-3 w-3 text-amber-400 shrink-0 stroke-[3]" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Card 2: Typography, Colors & Per-Song Sync Calibration */}
            {activeTabFilter === 'typography' && (
              <div className="rounded-2xl border border-stage-border bg-stage-panel p-5 space-y-5 shadow-lg">
                <div className="flex items-center justify-between border-b border-stage-border/70 pb-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                    <Type className="h-4 w-4 text-amber-400" />
                    Stadium Typography & Latency Calibration
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Scale: <strong className="text-amber-300">{style.fontSizeVw.toFixed(1)}vw</strong>
                  </span>
                </div>

                {/* Lyric Scale & Font Weight (Clean Inline Layout — Zero Squishing / Overlapping) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Lyric Scale Slider with Inline A- / A+ Controls */}
                  <div className="rounded-xl border border-stage-border bg-stage-bg p-3.5 space-y-2.5 overflow-hidden flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">Lyric Scale (Viewport Sizing)</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-amber-300 font-bold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-xs">
                          {style.fontSizeVw.toFixed(1)} vw
                        </span>
                        <button
                          type="button"
                          onClick={() => updateStyleConfig({ fontSizeVw: 4.4 })}
                          title="Reset to standard 4.4 vw"
                          className="rounded p-1 text-slate-500 hover:text-white transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateStyleConfig({
                            fontSizeVw: Math.max(2.0, Number((style.fontSizeVw - 0.2).toFixed(1))),
                          })
                        }
                        title="Decrease font size (A-)"
                        className="flex h-9 items-center gap-1 rounded-xl border border-stage-border bg-stage-card px-2.5 text-xs font-bold text-slate-200 hover:text-white hover:border-amber-400/60 active:scale-95 shrink-0 transition-all shadow-sm"
                      >
                        <Minus className="h-3.5 w-3.5" />
                        <span>A-</span>
                      </button>

                      <div className="flex-1 relative flex items-center min-w-0">
                        <input
                          type="range"
                          min={2.0}
                          max={9.0}
                          step={0.1}
                          value={style.fontSizeVw}
                          onChange={(e) =>
                            updateStyleConfig({ fontSizeVw: Number(Number(e.target.value).toFixed(1)) })
                          }
                          className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-700/80 rounded-lg"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          updateStyleConfig({
                            fontSizeVw: Math.min(9.0, Number((style.fontSizeVw + 0.2).toFixed(1))),
                          })
                        }
                        title="Increase font size (A+)"
                        className="flex h-9 items-center gap-1 rounded-xl border border-stage-border bg-stage-card px-2.5 text-xs font-bold text-slate-200 hover:text-white hover:border-amber-400/60 active:scale-95 shrink-0 transition-all shadow-sm"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>A+</span>
                      </button>
                    </div>
                  </div>

                  {/* Font Weight (Segmented Row with Spacious Buttons — No Overlapping & No Ellipsis) */}
                  <div className="rounded-xl border border-stage-border bg-stage-bg p-3.5 space-y-2.5 overflow-hidden flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">Font Weight</span>
                      <span className="font-mono text-amber-300 font-bold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-xs">
                        {style.fontWeight} ({style.fontWeight === '400' ? 'Regular' : style.fontWeight === '500' ? 'Medium' : style.fontWeight === '600' ? 'Semi' : 'Bold'})
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 w-full min-w-0">
                      {[
                        { w: '400', short: 'Reg', full: 'Regular', num: '400', cls: 'font-normal' },
                        { w: '500', short: 'Med', full: 'Medium', num: '500', cls: 'font-medium' },
                        { w: '600', short: 'Semi', full: 'Semi', num: '600', cls: 'font-semibold' },
                        { w: '700', short: 'Bold', full: 'Bold', num: '700', cls: 'font-bold' },
                      ].map((item) => {
                        const isSelected = style.fontWeight === item.w;
                        return (
                          <button
                            key={item.w}
                            type="button"
                            onClick={() => updateStyleConfig({ fontWeight: item.w as any })}
                            title={`${item.full} (${item.num})`}
                            className={`h-9 rounded-xl border text-center transition-all min-w-0 overflow-hidden flex flex-col items-center justify-center cursor-pointer active:scale-95 shadow-sm ${
                              isSelected
                                ? 'border-amber-500/70 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,185,66,0.2)] font-bold'
                                : 'border-stage-border bg-stage-card text-slate-300 hover:text-white hover:border-slate-500'
                            }`}
                          >
                            <span className={`text-xs leading-none ${item.cls} ${isSelected ? 'text-amber-300 font-extrabold' : ''}`}>
                              <span className="hidden xl:inline">{item.full}</span>
                              <span className="xl:hidden">{item.short}</span>
                            </span>
                            <span
                              className={`text-[9px] leading-none mt-0.5 ${
                                isSelected ? 'text-amber-400/90 font-bold' : 'text-slate-500'
                              }`}
                            >
                              {item.num}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Font Family Selector + Upload Custom Font */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Font Family
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const asset = await importFontAsset();
                        if (asset?.fontFamily) {
                          updateStyleConfig({
                            fontFamily: `"${asset.fontFamily}", sans-serif`,
                            fontAssetPath: asset.relativePath,
                          });
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-2.5 py-1.5 text-xs font-semibold text-amber-300 hover:border-amber-500/50 hover:bg-amber-500/10 transition-colors"
                    >
                      <Upload className="h-3 w-3" />
                      Upload .TTF/.OTF
                    </button>
                  </div>

                  <div className="overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64">
                    {BUILTIN_FONTS.map((f) => {
                      const selected = style.fontFamily === f.value && !style.fontAssetPath;
                      return (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() =>
                            updateStyleConfig({
                              fontFamily: f.value,
                              fontAssetPath: undefined,
                            })
                          }
                          className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                            selected
                              ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
                              : 'border-stage-border bg-stage-bg text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <span style={{ fontFamily: f.value }}>{f.label}</span>
                          {selected && <Check className="h-3.5 w-3.5 text-amber-400 stroke-[3]" />}
                        </button>
                      );
                    })}

                    {customFonts.map((cf) => {
                      const selected = style.fontAssetPath === cf.relativePath;
                      return (
                        <button
                          key={cf.id}
                          type="button"
                          onClick={() =>
                            updateStyleConfig({
                              fontFamily: `"${cf.fontFamily}", sans-serif`,
                              fontAssetPath: cf.relativePath,
                            })
                          }
                          className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                            selected
                              ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
                              : 'border-stage-border bg-stage-bg text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <span>Custom: {cf.name}</span>
                          {selected && <Check className="h-3.5 w-3.5 text-amber-400 stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Presets */}
                <div className="space-y-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    High-Contrast Color Presets
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {TEXT_COLOR_PRESETS.map((preset) => {
                      const selected = style.textColor === preset.color;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() =>
                            updateStyleConfig({
                              textColor: preset.color,
                              textShadow: preset.shadow,
                            })
                          }
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                            selected
                              ? 'border-amber-400 bg-amber-500/20 text-white font-bold ring-1 ring-amber-400/40'
                              : 'border-stage-border bg-stage-bg text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-white/30 shrink-0"
                            style={{ backgroundColor: preset.color }}
                          />
                          <span className="truncate">{preset.label}</span>
                          {selected && <Check className="h-3 w-3 text-amber-400 ml-auto stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Per-Song Broadcast Latency Offset */}
                <div className="space-y-2.5 rounded-xl border border-stage-border bg-stage-bg p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Per-Song Lyric Latency Offset
                    </span>
                    <span className="font-mono text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                      {Math.round((song.globalOffsetSeconds ?? 0) * 1000)}ms
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Compensate for stage PA, Bluetooth, or projector transmission latency.
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {([-0.1, -0.05, -0.025, 0.025, 0.05, 0.1] as const).map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        onClick={() => updateGlobalOffset((song.globalOffsetSeconds ?? 0) + delta)}
                        className="rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-xs font-mono text-slate-200 hover:border-amber-500/50 hover:text-amber-300 transition-colors"
                      >
                        {delta > 0 ? `+${Math.round(delta * 1000)}` : Math.round(delta * 1000)}ms
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateGlobalOffset(0)}
                      className="ml-auto flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Live 16:9 Stage Screen Preview & Readiness Inspector */}
      {!configPreviewCollapsed && (
        <>
          {/* Vertical Draggable Divider Handle */}
          <div
            onMouseDown={handlePreviewResizeStart}
            className="group relative w-1.5 shrink-0 cursor-col-resize bg-stage-border/60 hover:bg-amber-400 transition-colors flex items-center justify-center select-none z-10"
            title="Drag to resize Stage Screen Preview"
          >
            <div className="h-8 w-0.5 rounded-full bg-slate-500 group-hover:bg-black transition-colors" />
          </div>

          <aside
            style={{ width: `${configPreviewWidth}px` }}
            className="shrink-0 flex flex-col min-h-0 bg-stage-panel border-l border-stage-border overflow-hidden"
          >
            {/* Preview Header */}
            <div className="flex items-center justify-between border-b border-stage-border px-3.5 py-2.5 bg-[#090b10] shrink-0 gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Tv className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 whitespace-nowrap truncate">
                  Stage Preview
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center rounded-lg border border-stage-border bg-stage-bg p-0.5 text-[11px]">
                  {(
                    [
                      { id: 'lyric', label: 'Lyric' },
                      { id: 'music', label: 'Music' },
                      { id: 'blank', label: 'Backdrop' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPreviewMode(tab.id)}
                      className={`rounded-md px-2 py-0.5 font-semibold transition-colors ${
                        previewMode === tab.id
                          ? 'bg-amber-500/25 text-amber-300 font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={toggleConfigPreviewCollapsed}
                  title="Collapse Preview Panel"
                  className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Preview Body (Scrollable) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 slim-scrollbar">
              {/* 16:9 Slide Renderer Display */}
              <div className="aspect-video w-full overflow-hidden rounded-2xl border border-stage-border/80 shadow-2xl bg-black">
                <SlideRenderer
                  activeLine={previewMode === 'lyric' ? previewLine : null}
                  styleConfig={style}
                  isBlank={previewMode === 'blank'}
                  isMusicInterlude={previewMode === 'music'}
                  isPreview={true}
                />
              </div>

              {/* Sample Line Selector for Testing */}
              {song.syncedLines.length > 0 && previewMode === 'lyric' && (
                <div className="rounded-xl border border-stage-border bg-stage-bg p-2.5 space-y-2 min-w-0 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between text-xs text-slate-400 min-w-0">
                    <span className="font-semibold truncate">Sample Lyric Line:</span>
                    <span className="font-mono text-amber-300 font-bold shrink-0 ml-2">
                      #{safeSampleIdx + 1} / {song.syncedLines.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 w-full min-w-0">
                    <button
                      type="button"
                      disabled={safeSampleIdx <= 0}
                      onClick={() => setSampleLineIdx((idx) => Math.max(0, idx - 1))}
                      className="shrink-0 flex items-center justify-center h-7 w-7 rounded-lg border border-stage-border bg-stage-card text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
                      title="Previous line"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>

                    <select
                      value={safeSampleIdx}
                      onChange={(e) => setSampleLineIdx(Number(e.target.value))}
                      className="flex-1 min-w-0 w-0 truncate rounded-lg border border-stage-border bg-stage-card px-2 py-1 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                    >
                      {song.syncedLines.map((l, idx) => (
                        <option key={l.id} value={idx}>
                          #{idx + 1} — {l.text.slice(0, 42)}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={safeSampleIdx >= song.syncedLines.length - 1}
                      onClick={() =>
                        setSampleLineIdx((idx) => Math.min(song.syncedLines.length - 1, idx + 1))
                      }
                      className="shrink-0 flex items-center justify-center h-7 w-7 rounded-lg border border-stage-border bg-stage-card text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
                      title="Next line"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Pre-Stage Readiness Summary Card */}
              <div className="rounded-2xl border border-stage-border bg-stage-bg p-4 space-y-3 min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Pre-Stage Readiness Summary</span>
                </div>

                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">Synced Lyric Lines</span>
                    </span>
                    <span className="font-mono font-bold text-white shrink-0 ml-2">{song.syncedLines.length}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      <CheckCircle2 className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                      <span className="truncate">Auto Music Interludes</span>
                    </span>
                    <span className="font-mono font-bold text-white shrink-0 ml-2">{interludeCount}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">Saved Latency Offset</span>
                    </span>
                    <span className="font-mono font-bold text-white shrink-0 ml-2">
                      {Math.round((song.globalOffsetSeconds ?? 0) * 1000)}ms
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">Music Animation Theme</span>
                    </span>
                    <span className="font-mono font-semibold text-slate-200 capitalize truncate shrink-0 ml-2 max-w-[130px] text-right">
                      {(style.musicAnimation ?? 'lotus-pulse').replace('-', ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => flushSaveActiveSong(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 transition-colors shadow-sm"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Song Configuration
                </button>

                <button
                  type="button"
                  onClick={() => setApplyAllModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-sky-500/50 bg-sky-500/15 px-4 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/25 transition-colors shadow-sm active:scale-95"
                  title={`Apply this Stage Look to all ${songs.length} songs in library`}
                >
                  <CopyCheck className="h-3.5 w-3.5 text-sky-400" />
                  Apply Stage Look to All Songs ({songs.length})
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await flushSaveActiveSong(false);
                    onGoToStage();
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-black hover:bg-amber-400 transition-colors shadow-lg active:scale-95"
                >
                  <Tv className="h-3.5 w-3.5" />
                  Ready → Launch Stage Console
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Apply Stage Look to All Songs Confirmation Modal */}
      {applyAllModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => !isApplyingAll && setApplyAllModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-sky-500/35 bg-[#0e131f] p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-stage-border pb-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/15 text-sky-400">
                  <CopyCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Apply Stage Look to All Songs</h3>
                  <p className="text-xs text-slate-400">
                    Synchronize visual background & typography across entire library
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isApplyingAll}
                onClick={() => setApplyAllModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Source & Scope Snapshot */}
            <div className="space-y-3">
              <div className="rounded-xl border border-stage-border bg-stage-bg p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Source Song Look</span>
                  <span className="text-amber-300 font-semibold truncate max-w-[220px]">"{song.title}"</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col rounded-lg bg-black/40 p-2.5 border border-white/5">
                    <span className="text-[10px] text-slate-400 font-medium">Backdrop Style</span>
                    <span className="font-semibold text-slate-200 capitalize truncate mt-0.5">
                      {activeBgLabel} ({Math.round(style.backdropDim * 100)}% Dim)
                    </span>
                  </div>
                  <div className="flex flex-col rounded-lg bg-black/40 p-2.5 border border-white/5">
                    <span className="text-[10px] text-slate-400 font-medium">Music Animation</span>
                    <span className="font-semibold text-slate-200 capitalize truncate mt-0.5">
                      {(style.musicAnimation ?? 'lotus-pulse').replace('-', ' ')}
                    </span>
                  </div>
                  <div className="flex flex-col rounded-lg bg-black/40 p-2.5 border border-white/5">
                    <span className="text-[10px] text-slate-400 font-medium">Typography Scale</span>
                    <span className="font-semibold text-slate-200 truncate mt-0.5">
                      {style.fontSizeVw}vw • Weight {style.fontWeight}
                    </span>
                  </div>
                  <div className="flex flex-col rounded-lg bg-black/40 p-2.5 border border-white/5">
                    <span className="text-[10px] text-slate-400 font-medium">Primary Font</span>
                    <span className="font-semibold text-slate-200 truncate mt-0.5">
                      {activeFontLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Latency Calibration Checkbox */}
              <label className="flex items-start gap-3 rounded-xl border border-stage-border bg-stage-bg/60 p-3.5 cursor-pointer hover:bg-stage-bg transition-colors">
                <input
                  type="checkbox"
                  disabled={isApplyingAll}
                  checked={includeOffsetInApply}
                  onChange={(e) => setIncludeOffsetInApply(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-stage-border text-sky-500 focus:ring-sky-500 bg-black/40"
                />
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-200">
                    Also apply audio latency calibration offset ({Math.round((song.globalOffsetSeconds ?? 0) * 1000)}ms)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Enable only if all songs run through the same audio hardware delay. Off by default to preserve song-specific offsets.
                  </div>
                </div>
              </label>

              {/* Non-destructive guarantee callout */}
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  <strong>Safe bulk operation:</strong> Lyrics text, timestamp sync timings, and audio tracks are preserved. Only visual stage styling will be updated across all <strong>{songs.length}</strong> songs.
                </span>
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stage-border">
              <button
                type="button"
                disabled={isApplyingAll}
                onClick={() => setApplyAllModalOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isApplyingAll}
                onClick={handleApplyToAllSongs}
                className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-extrabold text-black hover:bg-sky-400 disabled:opacity-50 transition-colors shadow-lg active:scale-95"
              >
                {isApplyingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Applying to {songs.length} Songs...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 stroke-[3]" />
                    Apply to All {songs.length} Songs
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
