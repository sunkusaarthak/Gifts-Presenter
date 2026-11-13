import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  Clipboard,
  Eraser,
  FileText,
  Layers,
  ListOrdered,
  Music2,
  Plus,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { splitRawLyrics } from '../shared/lrc';

interface RawLyricsModalProps {
  open: boolean;
  initialLyrics: string;
  songTitle: string;
  songDuration?: number;
  onApply: (lyrics: string) => void;
  onClose: () => void;
}

const LINE_HEIGHT_PX = 28;
const FONT_SIZE_PX = 15;

function formatClock(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const RawLyricsModal: React.FC<RawLyricsModalProps> = ({
  open,
  initialLyrics,
  songTitle,
  songDuration,
  onApply,
  onClose,
}) => {
  const [text, setText] = useState(initialLyrics);
  const [viewMode, setViewMode] = useState<'text' | 'cards'>('text');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setText(initialLyrics);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [open, initialLyrics]);

  const rawLines = useMemo(() => text.split(/\r?\n/), [text]);
  const activeSlideLines = useMemo(() => splitRawLyrics(text), [text]);
  const wordCount = useMemo(() => {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }, [text]);

  const musicBreakCount = useMemo(() => {
    return rawLines.filter((l) => /\[.*(music|instrumental|interlude).*\]/i.test(l.trim())).length;
  }, [rawLines]);

  if (!open) return null;

  // Insert instrumental music tag [♪ Instrumental Music] at current cursor position
  const handleInsertMusicBreak = () => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => (prev ? `${prev.trim()}\n[♪ Instrumental Music]\n` : '[♪ Instrumental Music]\n'));
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const tag =
      (before.length > 0 && !before.endsWith('\n') ? '\n' : '') +
      '[♪ Instrumental Music]\n' +
      (after.length > 0 && !after.startsWith('\n') ? '' : '');
    const next = before + tag + after;
    setText(next);
    setTimeout(() => {
      el.focus();
      const pos = start + tag.length;
      el.setSelectionRange(pos, pos);
    }, 50);
  };

  const handleCleanBlankLines = () => {
    const cleaned = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join('\n');
    setText(cleaned);
  };

  const handleTrimWhitespace = () => {
    const cleaned = text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .join('\n');
    setText(cleaned);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setText(clip);
      }
    } catch {
      // Fallback
    }
  };

  const handleLoadFromFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.lrc,.text';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        if (content) {
          const stripped = content.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
          setText(stripped);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleSyncScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleSaveAndApply = () => {
    onApply(text);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 lg:p-8">
      <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl border border-amber-500/40 bg-[#0c0e14] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-stage-border bg-stage-panel px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Lyrics Studio & Raw Text Editor
                </h2>
                <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                  {songTitle} {formatClock(songDuration) ? `• ${formatClock(songDuration)}` : ''}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Every lyric line is 100% matched to its line number. Each row becomes one active presentation slide on stage.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Switcher: Raw Text vs Visual Slides */}
            <div className="flex items-center rounded-xl border border-stage-border bg-black/60 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('text')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-semibold transition-colors ${
                  viewMode === 'text'
                    ? 'bg-amber-500 text-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Raw Text View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-semibold transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-amber-500 text-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Slide Cards ({activeSlideLines.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Action & Formatting Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stage-border bg-[#0a0c12] px-6 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleInsertMusicBreak}
              title="Insert an explicit instrumental music break tag"
              className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 transition-colors"
            >
              <Music2 className="h-3.5 w-3.5 text-sky-300" />
              + [♪ Instrumental Music]
            </button>

            <button
              type="button"
              onClick={handleCleanBlankLines}
              title="Remove all empty lines"
              className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-amber-500/50 hover:text-white transition-colors"
            >
              <Eraser className="h-3.5 w-3.5" />
              Remove Blank Lines
            </button>

            <button
              type="button"
              onClick={handleTrimWhitespace}
              title="Trim unnecessary spaces"
              className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-amber-500/50 hover:text-white transition-colors"
            >
              <AlignLeft className="h-3.5 w-3.5" />
              Trim Spaces
            </button>

            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-amber-500/50 hover:text-white transition-colors"
            >
              <Clipboard className="h-3.5 w-3.5" />
              Paste
            </button>

            <button
              type="button"
              onClick={handleLoadFromFile}
              className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-amber-500/50 hover:text-white transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              Load .txt / .lrc
            </button>
          </div>

          {/* Live Statistics */}
          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <ListOrdered className="h-3.5 w-3.5 text-amber-400" />
              <strong className="text-white font-bold">{activeSlideLines.length}</strong> slides
            </span>
            <span>•</span>
            <span>
              <strong className="text-slate-200">{wordCount}</strong> words
            </span>
            {musicBreakCount > 0 && (
              <>
                <span>•</span>
                <span className="text-sky-300 font-medium">
                  {musicBreakCount} music break{musicBreakCount > 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Main Editor View: Either Pixel-Locked Textarea OR Visual Slide Cards */}
        {viewMode === 'text' ? (
          <div className="flex flex-1 overflow-hidden bg-[#07090e]">
            {/* 
              Pixel-Locked Line Numbers Column:
              - Exact matching paddingTop (16px) & paddingBottom (16px)
              - Exactly LINE_HEIGHT_PX (28px) per row with ZERO margin
              - Matches textarea lineHeight (28px) and fontSize (15px) 100% pixel-for-pixel
            */}
            <div
              ref={lineNumbersRef}
              className="w-14 shrink-0 select-none overflow-hidden border-r border-stage-border bg-[#090b10] text-right pr-2.5 text-slate-500"
              style={{
                paddingTop: '16px',
                paddingBottom: '16px',
                fontSize: `${FONT_SIZE_PX}px`,
                lineHeight: `${LINE_HEIGHT_PX}px`,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                boxSizing: 'border-box',
              }}
            >
              {rawLines.map((line, idx) => {
                const isMusicTag = /\[.*(music|instrumental|interlude).*\]/i.test(line.trim());
                return (
                  <div
                    key={idx}
                    style={{
                      height: `${LINE_HEIGHT_PX}px`,
                      lineHeight: `${LINE_HEIGHT_PX}px`,
                      margin: 0,
                      padding: 0,
                      boxSizing: 'border-box',
                    }}
                    className={`truncate ${
                      isMusicTag
                        ? 'text-sky-400 font-bold'
                        : line.trim().length === 0
                          ? 'opacity-20'
                          : 'text-slate-500'
                    }`}
                  >
                    {isMusicTag ? '♪' : idx + 1}
                  </div>
                );
              })}
            </div>

            {/* 
              Pixel-Locked Textarea:
              - wrap="off" prevents soft-wrap drift
              - Exactly LINE_HEIGHT_PX (28px) lineHeight & FONT_SIZE_PX (15px)
              - Exactly 16px padding on top and bottom
              - border: none and boxSizing: border-box matches line number column
            */}
            <textarea
              ref={textareaRef}
              value={text}
              wrap="off"
              onChange={(e) => setText(e.target.value)}
              onScroll={handleSyncScroll}
              placeholder="Paste your Satsang song, Bhajan, or Kirtan lyrics here...&#10;&#10;Line 1: Guru Brahma Guru Vishnu...&#10;Line 2: Guru Devo Maheshwara...&#10;[♪ Instrumental Music]&#10;Line 3: Gurus Sakshat Param Brahma...&#10;&#10;Tip: Click '+ [♪ Instrumental Music]' to insert an instrumental solo that automatically triggers the Sacred Music Animation on stage."
              className="flex-1 resize-none bg-transparent pl-4 pr-6 text-slate-100 placeholder-slate-600 focus:outline-none whitespace-pre overflow-x-auto"
              style={{
                paddingTop: '16px',
                paddingBottom: '16px',
                fontSize: `${FONT_SIZE_PX}px`,
                lineHeight: `${LINE_HEIGHT_PX}px`,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                border: 'none',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        ) : (
          /* Visual Slide Cards View: Physical Individual Rows (Zero Ambiguity) */
          <div className="flex-1 overflow-y-auto p-6 space-y-2.5 bg-[#07090e]">
            {activeSlideLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <FileText className="h-10 w-10 text-slate-600 mb-2" />
                <p>No lyric lines entered yet. Switch to Raw Text View to paste your lyrics.</p>
              </div>
            ) : (
              activeSlideLines.map((lineText, idx) => {
                const isMusicTag = /\[.*(music|instrumental|interlude).*\]/i.test(lineText.trim());
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                      isMusicTag
                        ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                        : 'border-stage-border bg-[#0b0e15] text-white hover:border-slate-500'
                    }`}
                  >
                    <span
                      className={`w-9 shrink-0 font-mono text-xs font-bold text-center rounded-lg py-1 ${
                        isMusicTag
                          ? 'bg-sky-500/20 text-sky-300'
                          : 'bg-white/5 text-amber-300'
                      }`}
                    >
                      {isMusicTag ? '♪' : `#${idx + 1}`}
                    </span>

                    <input
                      type="text"
                      value={lineText}
                      onChange={(e) => {
                        const updated = [...activeSlideLines];
                        updated[idx] = e.target.value;
                        setText(updated.join('\n'));
                      }}
                      className="flex-1 rounded-xl border border-transparent bg-transparent px-3 py-1.5 text-base font-medium focus:border-amber-500 focus:bg-stage-bg focus:outline-none"
                    />

                    <button
                      type="button"
                      title="Insert [♪ Instrumental Music] after this line"
                      onClick={() => {
                        const updated = [...activeSlideLines];
                        updated.splice(idx + 1, 0, '[♪ Instrumental Music]');
                        setText(updated.join('\n'));
                      }}
                      className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-sky-500/50 hover:text-sky-300"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Music
                    </button>

                    <button
                      type="button"
                      title="Delete this line"
                      onClick={() => {
                        const updated = activeSlideLines.filter((_, i) => i !== idx);
                        setText(updated.join('\n'));
                      }}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Footer & Apply Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stage-border bg-stage-panel px-6 py-4">
          <div className="text-xs text-slate-400">
            Clicking <strong>Apply to Timeline</strong> syncs exactly{' '}
            <strong className="text-amber-300">{activeSlideLines.length} lyric slides</strong> onto your timeline.
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stage-border px-5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveAndApply}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-bold text-black shadow-lg hover:bg-amber-400 active:scale-95 transition-all"
            >
              <Wand2 className="h-4 w-4" />
              Apply {activeSlideLines.length} Lines to Timeline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
