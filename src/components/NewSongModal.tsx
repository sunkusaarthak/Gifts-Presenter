import React, { useState } from 'react';
import { FileAudio, FileText, Upload, X } from 'lucide-react';
import { parseLrc, splitRawLyrics } from '../shared/lrc';
import { reconcileSyncedLinesWithRawLyrics } from '../shared/reconcileLyrics';
import { DEFAULT_STYLE_CONFIG, type SyncedLine } from '../shared/types';
import { usePresenterStore } from '../store/usePresenterStore';

interface NewSongModalProps {
  open: boolean;
  onClose: () => void;
}

export const NewSongModal: React.FC<NewSongModalProps> = ({ open, onClose }) => {
  const createSong = usePresenterStore((s) => s.createSong);
  const showToast = usePresenterStore((s) => s.showToast);

  const [title, setTitle] = useState('');
  const [audioPath, setAudioPath] = useState('');
  const [audioFileName, setAudioFileName] = useState('');
  const [rawLyrics, setRawLyrics] = useState('');
  const [importedLines, setImportedLines] = useState<SyncedLine[] | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handlePickAudio = async () => {
    const res = await window.satsangAPI.pickAudioFile();
    if (!res) return;
    setAudioPath(res.filePath);
    setAudioFileName(res.fileName);
    if (!title.trim()) {
      setTitle(res.fileName.replace(/\.[^.]+$/, ''));
    }
  };

  const handleImportLrc = async () => {
    const res = await window.satsangAPI.importLrcDialog();
    if (!res) return;
    const parsed = parseLrc(res.content);
    setRawLyrics(parsed.rawLyrics);
    setImportedLines(parsed.syncedLines);
    if (!title.trim() && parsed.title) {
      setTitle(parsed.title);
    }
    showToast(`Parsed ${parsed.syncedLines.length} timed lines from ${res.fileName}`, 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioPath) {
      showToast('Please select an audio file (.mp3, .wav, .flac, .m4a).', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const linesText = splitRawLyrics(rawLyrics);
      const initialLines: SyncedLine[] =
        importedLines && importedLines.length > 0
          ? reconcileSyncedLinesWithRawLyrics(importedLines, rawLyrics)
          : linesText.map((text, idx) => ({
              id: `line-${idx}-${Math.random().toString(36).slice(2, 7)}`,
              index: idx,
              startTime: idx * 4,
              endTime: idx * 4 + 3.8,
              text,
            }));

      await createSong({
        title: title.trim() || audioFileName.replace(/\.[^.]+$/, ''),
        audioSourcePath: audioPath,
        rawLyrics,
        duration: 0,
        syncedLines: initialLines,
        styleConfig: { ...DEFAULT_STYLE_CONFIG },
      });

      setTitle('');
      setAudioPath('');
      setAudioFileName('');
      setRawLyrics('');
      setImportedLines(undefined);
      onClose();
    } catch (err) {
      showToast(`Failed to create song: ${(err as Error).message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-stage-border bg-stage-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-stage-border px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Add Satsang Track to Offline Library</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
              Audio File (.mp3, .wav, .flac, .m4a)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePickAudio}
                className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-500/20"
              >
                <FileAudio className="h-4 w-4" />
                Select Audio
              </button>
              <span className="truncate text-sm text-slate-300">
                {audioFileName || 'No file selected'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
              Song / Bhajan Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Guru Vandana"
              className="w-full rounded-xl border border-stage-border bg-stage-bg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                Lyrics (One slide / line per row)
              </label>
              <button
                type="button"
                onClick={handleImportLrc}
                className="flex items-center gap-1.5 rounded-lg border border-stage-border bg-stage-card px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-amber-500/50 hover:text-amber-300"
              >
                <Upload className="h-3.5 w-3.5" />
                Import .LRC Timecodes
              </button>
            </div>
            <textarea
              rows={8}
              value={rawLyrics}
              onChange={(e) => {
                setRawLyrics(e.target.value);
                setImportedLines(undefined);
              }}
              placeholder="Paste lyrics here (1–2 lines per slide row), or import a .lrc file..."
              className="w-full rounded-xl border border-stage-border bg-stage-bg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono"
            />
            {importedLines && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-400">
                <FileText className="h-3.5 w-3.5" />
                {importedLines.length} pre-timed .LRC regions ready
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stage-border px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !audioPath}
              className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
            >
              {submitting ? 'Copying Offline...' : 'Add to Library'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

