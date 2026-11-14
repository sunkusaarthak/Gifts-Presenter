import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CornerDownLeft,
  Download,
  FolderUp,
  Layers,
  Maximize2,
  Monitor,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Sliders,
  Sparkles,
  Undo2,
  Upload,
  X,
} from 'lucide-react';

export type GuideDestination =
  | 'new-song'
  | 'studio'
  | 'stage'
  | 'settings'
  | 'load-demo'
  | 'import-bundle';

interface PresentationGuideModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate?: (destination: GuideDestination) => void;
}

type GuideTab = 'importing' | 'syncing' | 'presenting';

export const PresentationGuideModal: React.FC<PresentationGuideModalProps> = ({
  open,
  onClose,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('importing');

  if (!open) return null;

  const handleNavigate = (dest: GuideDestination) => {
    onClose();
    onNavigate?.(dest);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-stage-border/80 bg-[#0d0f17] shadow-2xl overflow-hidden animate-music-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stage-border/70 bg-[#090b10] shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                Gifts Presenter — Seva & Operations Guide
              </h2>
              <p className="text-xs text-slate-400">
                Click any step or feature card below to navigate directly to it
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            title="Close Guide (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-stage-border/40 bg-[#0a0d14] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('importing')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'importing'
                ? 'bg-amber-500 text-black shadow-md font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FolderUp className="h-4 w-4" />
            <span>1. Importing a Song</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('syncing')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'syncing'
                ? 'bg-amber-500 text-black shadow-md font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>2. Manual Syncing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('presenting')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'presenting'
                ? 'bg-amber-500 text-black shadow-md font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Monitor className="h-4 w-4" />
            <span>3. Presenting Live</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 slim-scrollbar text-xs sm:text-sm leading-relaxed text-slate-300">
          {activeTab === 'importing' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <FolderUp className="h-4 w-4" />
                  <span>Step 1: Adding Audio & Structuring Lyrics</span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Gifts Presenter operates 100% offline with local audio. Click any card below to launch that tool directly.
                </p>
              </div>

              <div className="space-y-3">
                {/* Step A */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('new-song')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('new-song')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-mono text-xs font-bold text-amber-400 shrink-0 group-hover:bg-amber-500 group-hover:text-black transition-colors">
                      <Plus className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Create a New Song
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Create a blank devotional song entry with title, composer, and audio file.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 group-hover:bg-amber-500 group-hover:text-black transition-all shrink-0">
                    <span>Add Song</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* Step B */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('new-song')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('new-song')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-mono text-xs font-bold text-amber-400 shrink-0 group-hover:border-amber-400/50">
                      B
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Select Audio Track
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Supports <span className="font-mono text-slate-300">.mp3</span>, <span className="font-mono text-slate-300">.wav</span>, <span className="font-mono text-slate-300">.flac</span>, or <span className="font-mono text-slate-300">.m4a</span>. The audio engine caches waveforms immediately.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-slate-300 group-hover:border-amber-500/50 group-hover:text-white transition-all shrink-0">
                    <span>Select Audio</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* Step C */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('studio')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('studio')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-mono text-xs font-bold text-amber-400 shrink-0 group-hover:border-amber-400/50">
                      C
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Format 1–2 Lines per Slide in Sync Studio
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Paste devotional verses into the Raw Lyrics drawer. Blank lines automatically create separate verse slides.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-slate-300 group-hover:border-amber-500/50 group-hover:text-white transition-all shrink-0">
                    <span>Sync Studio</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* Step D */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('load-demo')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('load-demo')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 group-hover:bg-amber-500 group-hover:text-black transition-colors">
                      <Download className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Load Pre-Synced Demo Bhajan (.zip)
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Loads the Kabir bhajan with 4 pre-timed verses and Sacred Lotus visuals ready for stage test.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNavigate('import-bundle');
                      }}
                      className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2 py-1 text-[10px] font-medium text-slate-300 hover:border-amber-500/40 hover:text-white transition-colors"
                      title="Import external ZIP archive"
                    >
                      <Upload className="h-3 w-3 text-amber-400" />
                      <span>Import ZIP</span>
                    </button>
                    <div className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 group-hover:bg-amber-500 group-hover:text-black transition-all">
                      <span>Load Demo</span>
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'syncing' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <Sliders className="h-4 w-4" />
                  <span>Step 2: Calibrating Timing & Verse Alignments</span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Real-time manual sync allows natural vocal pacing. Click any feature below to jump into Sync Studio.
                </p>
              </div>

              <div className="space-y-3">
                {/* 2A */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('studio')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('studio')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shrink-0 group-hover:border-amber-400/50">
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Start Audio Playback
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Press <kbd className="px-1.5 py-0.5 rounded bg-black border border-white/20 font-mono text-xs text-amber-300">Spacebar</kbd> inside Sync Studio to play the audio waveform.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-slate-300 group-hover:border-amber-500/50 group-hover:text-white transition-all shrink-0">
                    <span>Sync Studio</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* 2B */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('studio')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('studio')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shrink-0 group-hover:border-amber-400/50">
                      <CornerDownLeft className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Tap Enter on Vocal Attack
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        The moment each verse begins, tap <kbd className="px-1.5 py-0.5 rounded bg-black border border-white/20 font-mono text-xs text-amber-300">Enter</kbd> (or click <strong className="text-amber-300">Sync Next Line</strong>). The timestamp records instantly.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-slate-300 group-hover:border-amber-500/50 group-hover:text-white transition-all shrink-0">
                    <span>Sync Studio</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* 2C */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('studio')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('studio')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shrink-0 group-hover:border-amber-400/50">
                      <Layers className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Waveform Edge Dragging & Nudging
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Drag region edges directly on the waveform. Use <span className="font-mono text-amber-300">-0.1s</span> and <span className="font-mono text-amber-300">+0.1s</span> buttons in the inspector.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-slate-300 group-hover:border-amber-500/50 group-hover:text-white transition-all shrink-0">
                    <span>Sync Studio</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* 2D */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('studio')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('studio')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shrink-0 group-hover:border-amber-400/50">
                      <Undo2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Instant Timing Undo
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Tapped too early or late? Press <kbd className="px-1.5 py-0.5 rounded bg-black border border-white/20 font-mono text-xs text-amber-300">Ctrl + Z</kbd> (or <kbd className="px-1.5 py-0.5 rounded bg-black border border-white/20 font-mono text-xs text-amber-300">Cmd + Z</kbd>) to revert the last sync stamp cleanly.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-slate-300 group-hover:border-amber-500/50 group-hover:text-white transition-all shrink-0">
                    <span>Sync Studio</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'presenting' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <Monitor className="h-4 w-4" />
                  <span>Step 3: Operating the Live Stage Screen</span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Stage Console provides confidence monitoring for the operator and borderless projection for the congregation.
                </p>
              </div>

              <div className="space-y-3">
                {/* 3A */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('stage')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('stage')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 group-hover:bg-amber-500 group-hover:text-black transition-colors">
                      <Maximize2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Borderless Fullscreen Presentation
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Connect external HDMI/projector. Switch to Stage Console and click <strong className="text-amber-300">Start Presentation</strong> for cursor-hidden output.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 group-hover:bg-amber-500 group-hover:text-black transition-all shrink-0">
                    <span>Stage Console</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* 3B */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('stage')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('stage')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shrink-0 group-hover:border-amber-400/50">
                      <Pause className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Discourse Pause: 700ms Audio Fade & Lyric Hold
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        When Pujya Master pauses to speak, tap <kbd className="px-1.5 py-0.5 rounded bg-black border border-white/20 font-mono text-xs text-amber-300">Spacebar</kbd>. Audio fades out smoothly and the active lyric holds on screen.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-slate-300 group-hover:border-amber-500/50 group-hover:text-white transition-all shrink-0">
                    <span>Stage Console</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* 3C */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('stage')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('stage')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shrink-0 group-hover:border-amber-400/50">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Replay Active Verse (Key: R)
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        If Pujya Master re-sings or explains a verse, press <kbd className="px-1.5 py-0.5 rounded bg-black border border-white/20 font-mono text-xs text-amber-300">R</kbd> on the stage console to re-cue that verse instantly.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-slate-300 group-hover:border-amber-500/50 group-hover:text-white transition-all shrink-0">
                    <span>Stage Console</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* 3D */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate('settings')}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate('settings')}
                  className="group flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-stage-border/60 hover:border-amber-500/60 hover:bg-amber-500/[0.05] transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-amber-400 shrink-0 group-hover:border-amber-400/50">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-amber-200 transition-colors">
                        Stage Appearance & Music Interlude Animation
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Configure Sacred Lotus, Harmonic Waves, font scale (<span className="font-mono text-amber-300">A- / A+</span>), and backdrop dimming in Stage Settings.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-[11px] font-medium text-slate-300 group-hover:border-amber-500/50 group-hover:text-white transition-all shrink-0">
                    <Settings className="h-3 w-3 text-amber-400" />
                    <span>Settings</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-stage-border/70 bg-[#090b10] shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Clicking any step takes you directly to that screen in Gifts Presenter.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-amber-500 px-5 py-1.5 text-xs font-bold text-black hover:bg-amber-400 shadow-md transition-all active:scale-[0.98]"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
