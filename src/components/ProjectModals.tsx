import React from 'react';
import {
  AppWindow,
  ArrowDownToLine,
  ExternalLink,
  FileArchive,
  FolderPlus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { usePresenterStore } from '../store/usePresenterStore';

export const ImportDestinationModal: React.FC = () => {
  const pendingZip = usePresenterStore((s) => s.pendingZip);
  const setPendingZip = usePresenterStore((s) => s.setPendingZip);
  const importProjectFromPath = usePresenterStore((s) => s.importProjectFromPath);
  const openInNewWindow = usePresenterStore((s) => s.openInNewWindow);

  if (!pendingZip) return null;

  const handleImportCurrent = async () => {
    const path = pendingZip.filePath;
    setPendingZip(null);
    await importProjectFromPath(path);
  };

  const handleOpenNewWindow = async () => {
    const path = pendingZip.filePath;
    setPendingZip(null);
    await openInNewWindow(path);
  };

  const handleCancel = () => {
    setPendingZip(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-stage-border bg-[#0e1118] p-6 shadow-2xl relative text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleCancel}
          className="absolute top-4 right-4 rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3.5 mb-5">
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2.5 text-sky-400 shrink-0">
            <FileArchive className="h-6 w-6" />
          </div>
          <div className="min-w-0 pr-6">
            <h3 className="text-base font-bold text-white tracking-wide">Import Project Archive</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Select where you would like to open this archive
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-stage-border bg-stage-bg px-2.5 py-1 text-[11px] font-mono text-sky-300 truncate max-w-full">
              <span className="truncate">{pendingZip.fileName}</span>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleImportCurrent}
            className="group flex w-full items-start gap-4 rounded-xl border border-stage-border bg-stage-card p-4 text-left transition-all hover:border-sky-500/60 hover:bg-sky-500/5 hover:shadow-lg active:scale-[0.99]"
          >
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2.5 text-sky-400 group-hover:bg-sky-500/20 group-hover:text-sky-300 transition-colors shrink-0">
              <ArrowDownToLine className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-white group-hover:text-sky-300 transition-colors">
                Import to Current Window
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Loads songs and assets directly into this active workspace. Ideal for working within your existing session.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleOpenNewWindow}
            className="group flex w-full items-start gap-4 rounded-xl border border-stage-border bg-stage-card p-4 text-left transition-all hover:border-amber-500/60 hover:bg-amber-500/5 hover:shadow-lg active:scale-[0.99]"
          >
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-400 group-hover:bg-amber-500/20 group-hover:text-amber-300 transition-colors shrink-0">
              <ExternalLink className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-white group-hover:text-amber-300 transition-colors">
                Open in New Window
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Launches a separate independent window for this project. Leaves your current workspace completely untouched.
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-stage-border bg-stage-card px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export const NewProjectConfirmModal: React.FC = () => {
  const songs = usePresenterStore((s) => s.songs);
  const newProjectModalOpen = usePresenterStore((s) => s.newProjectModalOpen);
  const setNewProjectModalOpen = usePresenterStore((s) => s.setNewProjectModalOpen);
  const newProject = usePresenterStore((s) => s.newProject);
  const exportProject = usePresenterStore((s) => s.exportProject);
  const openNewEmptyWindow = usePresenterStore((s) => s.openNewEmptyWindow);

  if (!newProjectModalOpen) return null;

  const handleSaveAndNew = async () => {
    setNewProjectModalOpen(false);
    await exportProject();
    await newProject();
  };

  const handleStartBlank = async () => {
    setNewProjectModalOpen(false);
    await newProject();
  };

  const handleOpenNewWindow = async () => {
    setNewProjectModalOpen(false);
    await openNewEmptyWindow();
  };

  const handleCancel = () => {
    setNewProjectModalOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-stage-border bg-[#0e1118] p-6 shadow-2xl relative text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleCancel}
          className="absolute top-4 right-4 rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3.5 mb-5">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-400 shrink-0">
            <FolderPlus className="h-6 w-6" />
          </div>
          <div className="min-w-0 pr-6">
            <h3 className="text-base font-bold text-white tracking-wide">Create New Project</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Your active workspace currently contains{' '}
              <strong className="text-amber-300 font-semibold">{songs.length} song{songs.length > 1 ? 's' : ''}</strong>.
            </p>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleSaveAndNew}
            className="group flex w-full items-start gap-4 rounded-xl border border-stage-border bg-stage-card p-4 text-left transition-all hover:border-amber-500/60 hover:bg-amber-500/5 hover:shadow-lg active:scale-[0.99]"
          >
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-400 group-hover:bg-amber-500/20 group-hover:text-amber-300 transition-colors shrink-0">
              <Save className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-white group-hover:text-amber-300 transition-colors">
                Save Backup (.gifts.zip) & Start New
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Exports your current songs to a project archive first, then resets to a fresh blank workspace.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleOpenNewWindow}
            className="group flex w-full items-start gap-4 rounded-xl border border-stage-border bg-stage-card p-4 text-left transition-all hover:border-sky-500/60 hover:bg-sky-500/5 hover:shadow-lg active:scale-[0.99]"
          >
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2.5 text-sky-400 group-hover:bg-sky-500/20 group-hover:text-sky-300 transition-colors shrink-0">
              <AppWindow className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-white group-hover:text-sky-300 transition-colors">
                Open in New Window
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Keep your current workspace open and launch a fresh blank project in a new window.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleStartBlank}
            className="group flex w-full items-start gap-4 rounded-xl border border-rose-500/20 bg-stage-card p-4 text-left transition-all hover:border-rose-500/60 hover:bg-rose-500/5 hover:shadow-lg active:scale-[0.99]"
          >
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-400 group-hover:bg-rose-500/20 group-hover:text-rose-300 transition-colors shrink-0">
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-white group-hover:text-rose-300 transition-colors">
                Discard Current & Start Blank
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Clears current songs from this window without saving.
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-stage-border bg-stage-card px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export const CloseWindowConfirmModal: React.FC = () => {
  const songs = usePresenterStore((s) => s.songs);
  const closeWindowModalOpen = usePresenterStore((s) => s.closeWindowModalOpen);
  const setCloseWindowModalOpen = usePresenterStore((s) => s.setCloseWindowModalOpen);
  const flushSaveActiveSong = usePresenterStore((s) => s.flushSaveActiveSong);
  const exportProject = usePresenterStore((s) => s.exportProject);
  const confirmCloseWindow = usePresenterStore((s) => s.confirmCloseWindow);
  const [isSaving, setIsSaving] = React.useState(false);

  if (!closeWindowModalOpen) return null;

  const handleSaveAndExit = async () => {
    setIsSaving(true);
    try {
      await flushSaveActiveSong(false);
      const res = await exportProject();
      if (!res.canceled) {
        setCloseWindowModalOpen(false);
        await confirmCloseWindow();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardAndExit = async () => {
    setCloseWindowModalOpen(false);
    await confirmCloseWindow();
  };

  const handleCancel = () => {
    if (isSaving) return;
    setCloseWindowModalOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-stage-border bg-[#0e1118] p-6 shadow-2xl relative text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          className="absolute top-4 right-4 rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3.5 mb-5">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-400 shrink-0">
            <Save className="h-6 w-6" />
          </div>
          <div className="min-w-0 pr-6">
            <h3 className="text-base font-bold text-white tracking-wide">Save Project Before Closing?</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Your active workspace currently contains{' '}
              <strong className="text-amber-300 font-semibold">{songs.length} song{songs.length > 1 ? 's' : ''}</strong>.
            </p>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleSaveAndExit}
            disabled={isSaving}
            className="group flex w-full items-start gap-4 rounded-xl border border-amber-500/60 bg-amber-500/10 p-4 text-left transition-all hover:border-amber-400 hover:bg-amber-500/20 hover:shadow-lg active:scale-[0.99]"
          >
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/20 p-2.5 text-amber-300 group-hover:bg-amber-500/30 group-hover:text-amber-200 transition-colors shrink-0">
              <Save className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-white group-hover:text-amber-200 transition-colors flex items-center gap-2">
                Save Project Backup (.gifts.zip) & Exit
                {isSaving && <span className="text-[11px] font-mono text-amber-300">Saving...</span>}
              </div>
              <p className="text-xs text-slate-300/90 mt-1 leading-relaxed">
                Flushes all timing alignments & stage styles for all {songs.length} song{songs.length > 1 ? 's' : ''} into a complete portable archive, then closes safely.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleDiscardAndExit}
            disabled={isSaving}
            className="group flex w-full items-start gap-4 rounded-xl border border-rose-500/20 bg-stage-card p-4 text-left transition-all hover:border-rose-500/60 hover:bg-rose-500/5 hover:shadow-lg active:scale-[0.99]"
          >
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-400 group-hover:bg-rose-500/20 group-hover:text-rose-300 transition-colors shrink-0">
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-white group-hover:text-rose-300 transition-colors">
                Exit Without Saving
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Closes this window immediately. Unsaved changes to this project will be lost.
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="rounded-xl border border-stage-border bg-stage-card px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            Cancel (Keep Working)
          </button>
        </div>
      </div>
    </div>
  );
};

