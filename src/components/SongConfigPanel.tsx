import React, { useState } from 'react';
import {
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Minus,
  Music2,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Type,
  Upload,
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
import { SlideRenderer } from './SlideRenderer';

interface SongConfigPanelProps {
  song: SongPackage;
  onGoToStage: () => void;
}

export const SongConfigPanel: React.FC<SongConfigPanelProps> = ({ song, onGoToStage }) => {
  const assets = usePresenterStore((s) => s.assets);
  const updateStyleConfig = usePresenterStore((s) => s.updateStyleConfig);
  const updateGlobalOffset = usePresenterStore((s) => s.updateGlobalOffset);
  const importBackgroundAsset = usePresenterStore((s) => s.importBackgroundAsset);
  const importFontAsset = usePresenterStore((s) => s.importFontAsset);
  const flushSaveActiveSong = usePresenterStore((s) => s.flushSaveActiveSong);

  const [previewMode, setPreviewMode] = useState<'lyric' | 'music' | 'blank'>('lyric');
  const [sampleLineIdx, setSampleLineIdx] = useState(0);

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
      text: song.title || 'Satsang Sacred Lyric Preview',
    };

  const interludeCount = song.syncedLines.reduce((acc, line, idx) => {
    const next = song.syncedLines[idx + 1];
    if (next && next.startTime - line.endTime >= 1.8) return acc + 1;
    return acc;
  }, song.syncedLines[0]?.startTime >= 0.8 ? 1 : 0);

  return (
    <div className="flex flex-1 overflow-hidden bg-stage-bg">
      {/* Left Scrollable Per-Song Configuration Studio */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-[#171209] to-[#111521] p-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              Per-Song Stage Package Configuration
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Every background, font, scale, music animation, and audio sync offset configured here is saved inside{' '}
              <strong className="text-white">{song.title}</strong> before entering Stage Console.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => flushSaveActiveSong(true)}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
            >
              <Save className="h-3.5 w-3.5" />
              Save Song Config
            </button>
            <button
              type="button"
              onClick={async () => {
                await flushSaveActiveSong(false);
                onGoToStage();
              }}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black hover:bg-amber-400"
            >
              Ready → Stage Console
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Card 1: Visual Backdrop, Dimming & Music Animation */}
          <div className="rounded-2xl border border-stage-border bg-stage-panel p-5 space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Sliders className="h-4 w-4 text-amber-400" />
              Backdrop, Dimming & Music Interludes
            </div>

            {/* Backdrop Dimming Slider */}
            <div className="space-y-2 rounded-xl border border-stage-border bg-stage-bg p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Backdrop Dimming Overlay</span>
                <span className="font-mono text-amber-300">{Math.round(style.backdropDim * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.85}
                step={0.05}
                value={style.backdropDim}
                onChange={(e) => updateStyleConfig({ backdropDim: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Instrumental Music Interlude Animation */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Music2 className="h-3.5 w-3.5 text-sky-400" />
                Instrumental Music Animation
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'lotus-pulse', label: 'Sacred Lotus', desc: 'Mandala bloom' },
                    { id: 'sacred-waves', label: 'Harmonic Waves', desc: 'Rhythmic bars' },
                    { id: 'aurora-orb', label: 'Radiant Diya Orb', desc: 'Ambient glow' },
                    { id: 'none', label: 'Backdrop Only', desc: 'Clean silence' },
                  ] as Array<{ id: MusicAnimationStyle; label: string; desc: string }>
                ).map((anim) => {
                  const selected = (style.musicAnimation ?? 'lotus-pulse') === anim.id;
                  return (
                    <button
                      key={anim.id}
                      type="button"
                      onClick={() => {
                        updateStyleConfig({ musicAnimation: anim.id });
                        setPreviewMode('music');
                      }}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                          : 'border-stage-border bg-stage-bg text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <div className="text-xs font-semibold">{anim.label}</div>
                      <div className="text-[10px] text-slate-400">{anim.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 1-Click Stage Gradients */}
            <div className="space-y-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Stage Gradients (800ms Crossfade)
              </span>
              <div className="grid grid-cols-3 gap-2">
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
                      className={`group relative h-14 rounded-xl border overflow-hidden transition-all ${
                        selected
                          ? 'border-amber-400 ring-2 ring-amber-400/30'
                          : 'border-stage-border hover:border-slate-500'
                      }`}
                      style={{ background: preset.css }}
                      title={preset.name}
                    >
                      <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-[10px] text-slate-200 truncate">
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Images & Looping Videos */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Images & Looping Videos
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
                  className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:border-amber-500/50"
                >
                  <Upload className="h-3 w-3" />
                  Add Media
                </button>
              </div>

              {mediaBackgrounds.length === 0 ? (
                <p className="text-xs text-slate-500 rounded-xl border border-dashed border-stage-border p-3 text-center">
                  Import offline .mp4/.webm loops or .jpg/.png backdrops.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
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
                        className={`relative h-16 rounded-xl border overflow-hidden ${
                          selected
                            ? 'border-amber-400 ring-2 ring-amber-400/30'
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
                        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                          {asset.kind === 'video' ? (
                            <Film className="h-2.5 w-2.5 shrink-0 text-amber-300" />
                          ) : (
                            <ImageIcon className="h-2.5 w-2.5 shrink-0 text-sky-300" />
                          )}
                          <span className="truncate">{asset.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Typography, Colors & Per-Song Sync Offset */}
          <div className="rounded-2xl border border-stage-border bg-stage-panel p-5 space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Type className="h-4 w-4 text-amber-400" />
              Stadium Typography & Latency Calibration
            </div>

            {/* Giant A- / A+ Lyric Scale + Font Weight */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2 rounded-xl border border-stage-border bg-stage-bg p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Lyric Scale</span>
                  <span className="font-mono text-amber-300">{style.fontSizeVw.toFixed(1)} vw</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateStyleConfig({
                        fontSizeVw: Math.max(2.0, Number((style.fontSizeVw - 0.3).toFixed(1))),
                      })
                    }
                    className="flex items-center justify-center gap-1 rounded-lg border border-stage-border bg-stage-card py-2 text-sm font-bold text-white hover:border-amber-500/60"
                  >
                    <Minus className="h-3.5 w-3.5" />
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateStyleConfig({
                        fontSizeVw: Math.min(9.0, Number((style.fontSizeVw + 0.3).toFixed(1))),
                      })
                    }
                    className="flex items-center justify-center gap-1 rounded-lg border border-stage-border bg-stage-card py-2 text-sm font-bold text-white hover:border-amber-500/60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    A+
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-stage-border bg-stage-bg p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Font Weight</span>
                  <span className="font-mono text-amber-300">{style.fontWeight}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['400', '500', '600', '700'] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => updateStyleConfig({ fontWeight: w })}
                      className={`rounded-lg border py-2 text-xs font-semibold ${
                        style.fontWeight === w
                          ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                          : 'border-stage-border bg-stage-card text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Font Family Selector + Custom Font Uploader */}
            <div className="space-y-2">
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
                  className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:border-amber-500/50"
                >
                  <Upload className="h-3 w-3" />
                  Upload .TTF/.OTF
                </button>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
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
                      className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition-colors ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                          : 'border-stage-border bg-stage-bg text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {f.label}
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
                      className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition-colors ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                          : 'border-stage-border bg-stage-bg text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      Custom: {cf.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color Presets */}
            <div className="space-y-2">
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
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 text-white'
                          : 'border-stage-border bg-stage-bg text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-white/25"
                        style={{ backgroundColor: preset.color }}
                      />
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Per-Song Broadcast / PA Latency Offset */}
            <div className="space-y-2 rounded-xl border border-stage-border bg-stage-bg p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Per-Song Lyric Timing Offset
                </span>
                <span className="font-mono text-xs font-bold text-amber-300">
                  {Math.round((song.globalOffsetSeconds ?? 0) * 1000)}ms
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {([-0.1, -0.05, -0.025, 0.025, 0.05, 0.1] as const).map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => updateGlobalOffset((song.globalOffsetSeconds ?? 0) + delta)}
                    className="rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-xs font-mono text-slate-200 hover:border-amber-500/50"
                  >
                    {delta > 0 ? `+${Math.round(delta * 1000)}` : Math.round(delta * 1000)}ms
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => updateGlobalOffset(0)}
                  className="ml-auto flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-xs text-slate-300 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live 16:9 Projector Preview & Package Readiness */}
      <aside className="w-88 xl:w-[420px] shrink-0 border-l border-stage-border bg-stage-panel p-5 flex flex-col gap-5 overflow-y-auto">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              16:9 Stage Screen Preview
            </span>
            <div className="flex items-center rounded-lg border border-stage-border bg-stage-bg p-0.5 text-[11px]">
              {(
                [
                  { id: 'lyric', label: 'Lyric' },
                  { id: 'music', label: 'Music Anim' },
                  { id: 'blank', label: 'Backdrop' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPreviewMode(tab.id)}
                  className={`rounded-md px-2 py-1 font-medium transition-colors ${
                    previewMode === tab.id
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-stage-border shadow-2xl">
            <SlideRenderer
              activeLine={previewMode === 'lyric' ? previewLine : null}
              styleConfig={style}
              isBlank={previewMode === 'blank'}
              isMusicInterlude={previewMode === 'music'}
              isPreview={true}
            />
          </div>

          {song.syncedLines.length > 0 && previewMode === 'lyric' && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-400">Sample Line:</span>
              <select
                value={safeSampleIdx}
                onChange={(e) => setSampleLineIdx(Number(e.target.value))}
                className="flex-1 rounded-lg border border-stage-border bg-stage-bg px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                {song.syncedLines.map((l, idx) => (
                  <option key={l.id} value={idx}>
                    #{idx + 1} — {l.text.slice(0, 46)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Pre-Stage Readiness Card */}
        <div className="rounded-2xl border border-stage-border bg-stage-bg p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            Pre-Stage Readiness Summary
          </div>
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                Synced Lyric Lines
              </span>
              <span className="font-mono text-white">{song.syncedLines.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />
                Auto Music Interludes
              </span>
              <span className="font-mono text-white">{interludeCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                Saved Global Offset
              </span>
              <span className="font-mono text-white">
                {Math.round((song.globalOffsetSeconds ?? 0) * 1000)}ms
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                Theme & Music Animation
              </span>
              <span className="font-mono text-slate-200">
                {style.musicAnimation ?? 'lotus-pulse'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

