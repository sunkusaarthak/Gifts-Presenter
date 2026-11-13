import React, { useCallback, useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronUp,
  Download,
  GripVertical,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { usePresenterStore } from '../store/usePresenterStore';
import { useUIStore } from '../store/useUIStore';

interface LibrarySidebarProps {
  onNewSong: () => void;
}

function formatDuration(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '--:--';
  const mins = Math.floor(sec / 60);
  const rem = Math.floor(sec % 60);
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export const LibrarySidebar: React.FC<LibrarySidebarProps> = ({ onNewSong }) => {
  const songs = usePresenterStore((s) => s.songs);
  const activeSongId = usePresenterStore((s) => s.activeSongId);
  const selectSong = usePresenterStore((s) => s.selectSong);
  const deleteSong = usePresenterStore((s) => s.deleteSong);
  const importBundle = usePresenterStore((s) => s.importBundle);
  const exportBundle = usePresenterStore((s) => s.exportBundle);
  const reorderSongs = usePresenterStore((s) => s.reorderSongs);
  const moveSong = usePresenterStore((s) => s.moveSong);

  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const toggleSidebarCollapsed = useUIStore((s) => s.toggleSidebarCollapsed);

  const [query, setQuery] = useState('');
  const [draggedSongId, setDraggedSongId] = useState<string | null>(null);
  const [dragOverSongId, setDragOverSongId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) => s.title.toLowerCase().includes(q));
  }, [songs, query]);

  const handleSortAlphabetical = useCallback(() => {
    const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title));
    reorderSongs(sorted.map((s) => s.id));
  }, [songs, reorderSongs]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (query.trim()) return;
    setDraggedSongId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (query.trim() || !draggedSongId || draggedSongId === targetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSongId(targetId);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (query.trim() || !draggedSongId || draggedSongId === targetId) {
      setDraggedSongId(null);
      setDragOverSongId(null);
      return;
    }

    const currentIds = songs.map((s) => s.id);
    const fromIndex = currentIds.indexOf(draggedSongId);
    const toIndex = currentIds.indexOf(targetId);
    if (fromIndex !== -1 && toIndex !== -1) {
      const nextIds = [...currentIds];
      const [removed] = nextIds.splice(fromIndex, 1);
      nextIds.splice(toIndex, 0, removed);
      reorderSongs(nextIds);
    }
    setDraggedSongId(null);
    setDragOverSongId(null);
  };

  const handleDragEnd = () => {
    setDraggedSongId(null);
    setDragOverSongId(null);
  };

  // Smooth drag-resizing with window mousemove / mouseup
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        setSidebarWidth(startWidth + delta);
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
    [sidebarWidth, setSidebarWidth],
  );

  if (sidebarCollapsed) {
    return (
      <aside className="relative flex h-full w-12 shrink-0 flex-col items-center border-r border-stage-border bg-stage-panel py-3 space-y-4">
        <button
          type="button"
          onClick={toggleSidebarCollapsed}
          title="Expand Song Library (Ctrl+B)"
          className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-amber-300 transition-colors"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>

        <img
          src="/logo.webp"
          alt="Gifts Logo"
          className="h-7 w-7 rounded-lg object-cover border border-amber-500/40 shadow-sm"
          title="Gifts Presenter"
        />

        <button
          type="button"
          onClick={onNewSong}
          title="Add New Song / Bhajan"
          className="rounded-xl bg-amber-500 p-2 text-black hover:bg-amber-400 shadow-md transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>

        <div className="flex-1 flex flex-col items-center justify-center">
          <span className="rotate-90 whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Gifts ({songs.length})
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className="relative flex h-full shrink-0 flex-col border-r border-stage-border bg-stage-panel select-none transition-none"
    >
      <div className="border-b border-stage-border p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title="Collapse Library Sidebar (Ctrl+B)"
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-amber-300 transition-colors shrink-0"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 truncate">
              Gifts Library
            </span>
            <span className="rounded-full bg-stage-bg border border-stage-border px-1.5 py-0.2 text-[10px] font-mono text-amber-400 font-semibold shrink-0">
              {songs.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleSortAlphabetical}
              title="Sort songs alphabetically (A-Z)"
              className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2 py-1 text-[10px] font-medium text-slate-300 hover:border-amber-500/50 hover:text-amber-300 transition-colors shrink-0"
            >
              <ArrowDownAZ className="h-3 w-3 text-amber-400" />
              <span>A-Z</span>
            </button>
            <button
              type="button"
              onClick={importBundle}
              title="Import single song package (.zip / .satsang.zip)"
              className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2 py-1 text-[10px] font-medium text-slate-300 hover:border-amber-500/50 hover:text-amber-300 transition-colors shrink-0"
            >
              <Upload className="h-3 w-3 text-amber-400" />
              <span>Import ZIP</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewSong}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-black hover:bg-amber-400 transition-all shadow-md active:scale-[0.98]"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          Add Song / Bhajan
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter songs by title..."
            className="w-full rounded-xl border border-stage-border bg-stage-bg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 slim-scrollbar">
        {filtered.length === 0 ? (
          songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-4 py-8 space-y-3">
              <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Music className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-300">No songs in library</div>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                  Click &ldquo;+ Add Song&rdquo; above to import an audio track (.mp3, .wav) with lyrics.
                </p>
              </div>
              <button
                type="button"
                onClick={onNewSong}
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-all active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add First Song</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center px-4 py-8 space-y-2">
              <div className="text-xs font-semibold text-slate-400">No matching songs</div>
              <p className="text-[11px] text-slate-500">
                No songs match &ldquo;{query}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs text-amber-400 hover:underline mt-1 cursor-pointer"
              >
                Clear filter
              </button>
            </div>
          )
        ) : (
          filtered.map((song) => {
            const isActive = song.id === activeSongId;
            return (
              <div
                key={song.id}
                onClick={() => selectSong(song.id)}
                className={`group flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer border transition-colors ${
                  isActive
                    ? 'border-amber-500/60 bg-amber-500/15 text-white shadow-sm'
                    : 'border-transparent hover:bg-white/5 text-slate-300'
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="truncate text-xs font-semibold">{song.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    <span>{song.syncedLines.length} lines</span>
                    <span>•</span>
                    <span>{formatDuration(song.duration)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title="Export .satsang.zip bundle"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportBundle(song.id);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-amber-300"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete song"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSong(song.id);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Interactive Horizontal Resizer Handle */}
      <div
        onMouseDown={handleResizeStart}
        title="Drag to resize library panel"
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:w-2 hover:bg-amber-500/60 transition-all z-20"
      />
    </aside>
  );
};
