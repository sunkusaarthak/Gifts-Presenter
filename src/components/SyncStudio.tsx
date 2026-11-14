import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import {
  Activity,
  ArrowDownRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
    Columns,
  CopyCheck,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  FolderDown,
  Hand,
  HelpCircle,
  Info,
  ListMusic,
  Loader2,
  Lock,
  Magnet,
  Music2,
  Palette,
  Pause,
  Play,
  PlayCircle,
  Plus,
  RotateCcw,
  Rows,
  Save,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { normalizeSyncedLines, resolveStageDisplayState } from '../shared/binarySearch';
import { reconcileSyncedLinesWithRawLyrics } from '../shared/reconcileLyrics';
import { parseLrc, serializeLrc, serializeSrt, serializeVtt, splitRawLyrics } from '../shared/lrc';
import {
  DEFAULT_STYLE_CONFIG,
  toMediaUrl,
  type SyncedLine,
} from '../shared/types';
import { usePresenterStore } from '../store/usePresenterStore';
import { useUIStore } from '../store/useUIStore';
import appLogo from '../assets/logo.webp';
import {
  analyzeSongAudio,
  runOfflineVocalOnsetAlignment,
  type AnalyzedAudioData,
} from '../utils/waveformAnalysis';
import { runWhisperAlignment, type WhisperProgressEvent } from '../utils/whisperController';
import { SlideRenderer } from './SlideRenderer';
import { SongConfigPanel } from './SongConfigPanel';
import { RawLyricsModal } from './RawLyricsModal';

const REGION_PALETTE = [
  'rgba(245, 185, 66, 0.24)',
  'rgba(56, 189, 248, 0.22)',
  'rgba(52, 211, 153, 0.22)',
  'rgba(167, 139, 250, 0.22)',
];

function getRegionColor(line: SyncedLine, index: number): string {
  if (/^\[.*(music|instrumental|interlude|♪).*\]$/i.test(line.text.trim())) {
    return 'rgba(14, 165, 233, 0.35)'; // Sky blue: instrumental music interlude
  }
  if (line.confidence !== undefined) {
    return line.confidence >= 0.5
      ? 'rgba(16, 185, 129, 0.28)' // Green: high-confidence exact speech match
      : 'rgba(245, 158, 11, 0.32)'; // Amber: low-confidence / interpolated line
  }
  return REGION_PALETTE[index % REGION_PALETTE.length];
}

function formatTimeMs(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms % 100).padStart(2, '0')}`;
}

/**
 * Controlled-when-blurred numeric time input so Tap-to-Sync and drag updates
 * update values smoothly without unmounting or refreshing input DOM nodes.
 */
const SyncedTimeInput: React.FC<{
  value: number;
  min?: number;
  disabled?: boolean;
  title?: string;
  className?: string;
  onCommit: (val: number) => void;
}> = ({ value, min = 0, disabled = false, title, className, onCommit }) => {
  const [draft, setDraft] = useState(value.toFixed(2));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(value.toFixed(2));
    }
  }, [value, focused]);

  return (
    <input
      type="number"
      step="0.01"
      min={min}
      disabled={disabled}
      value={draft}
      title={title}
      className={className}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const parsed = Number(draft);
        if (Number.isFinite(parsed)) {
          onCommit(Number(Math.max(min, parsed).toFixed(3)));
        } else {
          setDraft(value.toFixed(2));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
};

interface SyncStudioProps {
  onNewSong?: () => void;
}

export const SyncStudio: React.FC<SyncStudioProps> = ({ onNewSong }) => {
  const songs = usePresenterStore((s) => s.songs);
  const activeSongId = usePresenterStore((s) => s.activeSongId);
  const updateSyncedLines = usePresenterStore((s) => s.updateSyncedLines);
  const saveSong = usePresenterStore((s) => s.saveSong);
  const flushSaveActiveSong = usePresenterStore((s) => s.flushSaveActiveSong);
  const setMode = usePresenterStore((s) => s.setMode);
  const showToast = usePresenterStore((s) => s.showToast);
  const isPresenting = usePresenterStore((s) => s.isPresenting);
  const isBlank = usePresenterStore((s) => s.isBlank);
  const exportBundle = usePresenterStore((s) => s.exportBundle);
  const importProject = usePresenterStore((s) => s.importProject);

  // Persisted UI preferences from useUIStore
  const waveformHeight = useUIStore((s) => s.waveformHeight);
  const setWaveformHeight = useUIStore((s) => s.setWaveformHeight);
  const rightPanelWidth = useUIStore((s) => s.rightPanelWidth);
  const setRightPanelWidth = useUIStore((s) => s.setRightPanelWidth);
  const previewEnabled = useUIStore((s) => s.previewEnabled);
  const togglePreviewEnabled = useUIStore((s) => s.togglePreviewEnabled);
  const waveformZoom = useUIStore((s) => s.waveformZoom);
  const setWaveformZoom = useUIStore((s) => s.setWaveformZoom);
  const manualSyncVisible = useUIStore((s) => s.manualSyncVisible);
  const setManualSyncVisible = useUIStore((s) => s.setManualSyncVisible);
  const toggleManualSyncVisible = useUIStore((s) => s.toggleManualSyncVisible);
  const lyricsTimelineVisible = useUIStore((s) => s.lyricsTimelineVisible);
  const setLyricsTimelineVisible = useUIStore((s) => s.setLyricsTimelineVisible);
  const toggleLyricsTimelineVisible = useUIStore((s) => s.toggleLyricsTimelineVisible);
  const syncLayoutMode = useUIStore((s) => s.syncLayoutMode);
  const toggleSyncLayoutMode = useUIStore((s) => s.toggleSyncLayoutMode);
  const manualSyncWidth = useUIStore((s) => s.manualSyncWidth);
  const setManualSyncWidth = useUIStore((s) => s.setManualSyncWidth);
  const setApplyAllModalOpen = useUIStore((s) => s.setApplyAllModalOpen);

  const isPresentingRef = useRef(isPresenting);
  isPresentingRef.current = isPresenting;
  const isBlankRef = useRef(isBlank);
  isBlankRef.current = isBlank;

  const activeSong = useMemo(
    () => songs.find((s) => s.id === activeSongId) ?? null,
    [songs, activeSongId],
  );

  const waveformContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const isInternalRegionSyncRef = useRef(false);

  const [studioTab, setStudioTab] = useState<'sync' | 'config'>('sync');
  const [isPlaying, setIsPlaying] = useState(false);
  const [wsTime, setWsTime] = useState(0);
  const [wsDuration, setWsDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<0.75 | 1 | 1.25 | 1.5>(1);
  const [zoomPxPerSec, setZoomPxPerSec] = useState(waveformZoom);
  const [zoomToast, setZoomToast] = useState<string | null>(null);
  const zoomToastTimerRef = useRef<number | null>(null);

  const [vocalBandpass, setVocalBandpass] = useState(false);
  const [magneticSnap, setMagneticSnap] = useState(true);
  const [analyzedData, setAnalyzedData] = useState<AnalyzedAudioData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAligning, setIsAligning] = useState(false);
  const [showRawModal, setShowRawModal] = useState(false);
  const [showAutoMenu, setShowAutoMenu] = useState(false);
  const autoMenuRef = useRef<HTMLDivElement | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const [rawDraft, setRawDraft] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  // Safe "Look, Verify & Then Edit" Working Draft Buffer
  const [draftLines, setDraftLines] = useState<SyncedLine[]>(() =>
    activeSong ? activeSong.syncedLines.map((l) => ({ ...l })) : [],
  );
  const draftLinesRef = useRef<SyncedLine[]>(draftLines);
  draftLinesRef.current = draftLines;

  // Locked/Unlocked Mode: Default to Unlocked so waveform dragging is immediately responsive
  const [isEditingUnlocked, setIsEditingUnlocked] = useState(true);
  const isEditingUnlockedRef = useRef(isEditingUnlocked);
  isEditingUnlockedRef.current = isEditingUnlocked;

  // Manual Lyrics Sync Flow: Hold-to-Sing (Natural) vs Single Tap (Rhythmic) - Enabled by default below waveforms!
  const [tapMode, setTapMode] = useState(true);
  const syncMethod: 'hold' = 'hold';
  const [tapIndex, setTapIndex] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [prevClosedByMusic, setPrevClosedByMusic] = useState(false);
  const [showTimelineInfo, setShowTimelineInfo] = useState(false);

  useEffect(() => {
    if (!showExportMenu && !showAutoMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (showExportMenu && exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
      if (showAutoMenu && autoMenuRef.current && !autoMenuRef.current.contains(e.target as Node)) {
        setShowAutoMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu, showAutoMenu]);

  // Focus & hover tracking: distinguishes Timeline Zoom vs Whole UI Zoom
  const [isTimelineFocused, setIsTimelineFocused] = useState(false);
  const [isTimelineHovered, setIsTimelineHovered] = useState(false);
  const isTimelineActive = isTimelineFocused || isTimelineHovered;
  const isTimelineActiveRef = useRef(isTimelineActive);
  isTimelineActiveRef.current = isTimelineActive;

  const tapHistoryRef = useRef<
    Array<{
      lines: SyncedLine[];
      tapIndex: number;
      prevClosedByMusic: boolean;
      stampTime: number;
    }>
  >([]);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Timeline Loading State & Alignment Modals
  const [isTimelineLoading, setIsTimelineLoading] = useState(true);
  const [showWhisperModal, setShowWhisperModal] = useState(false);
  const [whisperLanguage, setWhisperLanguage] = useState<string>('auto');
  const [isWhisperAligning, setIsWhisperAligning] = useState(false);
  const [whisperProgress, setWhisperProgress] = useState<WhisperProgressEvent | null>(null);
  const whisperAbortControllerRef = useRef<AbortController | null>(null);

  const activeSongRef = useRef(activeSong);
  activeSongRef.current = activeSong;
  const liveLinesRef = useRef<SyncedLine[]>(activeSong?.syncedLines ?? []);

  const holdStartTimeRef = useRef<number | null>(null);
  const magneticSnapRef = useRef(magneticSnap);
  magneticSnapRef.current = magneticSnap;
  const tapModeRef = useRef(tapMode);
  tapModeRef.current = tapMode;
  const syncMethodRef = useRef(syncMethod);
  syncMethodRef.current = syncMethod;
  const isHoldingRef = useRef(isHolding);
  isHoldingRef.current = isHolding;
  const tapIndexRef = useRef(tapIndex);
  tapIndexRef.current = tapIndex;

  // Initialize draft buffer when active song changes
  useEffect(() => {
    if (activeSong) {
      const fresh = activeSong.syncedLines.map((l) => ({ ...l }));
      setDraftLines(fresh);
      draftLinesRef.current = fresh;
      liveLinesRef.current = fresh;
      setIsEditingUnlocked(true);
      isEditingUnlockedRef.current = true;
      setRawDraft(activeSong.rawLyrics);
      setTapMode(true);
      setTapIndex(0);
      setIsHolding(false);
      setPrevClosedByMusic(false);
      tapHistoryRef.current = [];
      setSelectedLineId(activeSong.syncedLines[0]?.id ?? null);
    }
  }, [activeSong?.id]);

  // Track if current working draft has uncommitted edits compared to saved song package
  const isDirty = useMemo(() => {
    if (!activeSong) return false;
    if (draftLines.length !== activeSong.syncedLines.length) return true;
    return draftLines.some((dl, idx) => {
      const sl = activeSong.syncedLines[idx];
      if (!sl) return true;
      return (
        dl.id !== sl.id ||
        Math.abs(dl.startTime - sl.startTime) > 0.001 ||
        Math.abs(dl.endTime - sl.endTime) > 0.001 ||
        dl.text !== sl.text
      );
    });
  }, [activeSong, draftLines]);

  const isLineModified = useCallback(
    (lineId: string) => {
      if (!activeSong) return false;
      const dl = draftLines.find((l) => l.id === lineId);
      const sl = activeSong.syncedLines.find((l) => l.id === lineId);
      if (!dl || !sl) return true;
      return (
        Math.abs(dl.startTime - sl.startTime) > 0.001 ||
        Math.abs(dl.endTime - sl.endTime) > 0.001 ||
        dl.text !== sl.text
      );
    },
    [activeSong, draftLines],
  );

  // Pause WaveSurfer cleanly if operator hops to Stage Look & Config tab
  useEffect(() => {
    if (studioTab === 'config' && wsRef.current?.isPlaying()) {
      wsRef.current.pause();
    }
  }, [studioTab]);

  // Trigger floating zoom feedback HUD
  const showZoomNotice = useCallback((text: string) => {
    if (zoomToastTimerRef.current !== null) {
      window.clearTimeout(zoomToastTimerRef.current);
    }
    setZoomToast(text);
    zoomToastTimerRef.current = window.setTimeout(() => {
      setZoomToast(null);
      zoomToastTimerRef.current = null;
    }, 1400);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomPxPerSec((z) => {
      const next = Math.min(200, z + 25);
      setWaveformZoom(next);
      showZoomNotice(`Waveform Zoom: ${next} px/s`);
      return next;
    });
  }, [setWaveformZoom, showZoomNotice]);

  const handleZoomOut = useCallback(() => {
    setZoomPxPerSec((z) => {
      const next = Math.max(20, z - 25);
      setWaveformZoom(next);
      showZoomNotice(`Waveform Zoom: ${next} px/s`);
      return next;
    });
  }, [setWaveformZoom, showZoomNotice]);

  const handleZoomReset = useCallback(() => {
    setZoomPxPerSec(75);
    setWaveformZoom(75);
    showZoomNotice('Waveform Zoom: 75 px/s (Default)');
  }, [setWaveformZoom, showZoomNotice]);

  // Patch WaveSurfer regions in place without rebuilding DOM
  const syncRegionsToWaveform = useCallback((lines: readonly SyncedLine[]) => {
    const plugin = regionsPluginRef.current;
    if (!plugin) return;

    const canEdit = isEditingUnlockedRef.current;
    isInternalRegionSyncRef.current = true;
    try {
      const existing = plugin.getRegions();
      const existingById = new Map(existing.map((r) => [r.id, r]));
      const sameIdSet =
        existing.length === lines.length && lines.every((l) => existingById.has(l.id));

      if (sameIdSet) {
        lines.forEach((line) => {
          const region = existingById.get(line.id)!;
          const targetStart = line.startTime;
          const targetEnd = Math.max(line.startTime + 0.1, line.endTime);
          region.setOptions({
            start: targetStart,
            end: targetEnd,
            color: getRegionColor(line, line.index),
            drag: canEdit,
            resize: canEdit,
          });
          if (region.element) {
            const labelEl = region.element.querySelector('.ws-region-label');
            if (labelEl) {
              const isMusic = /^\[.*(music|instrumental|interlude|♪).*\]$/i.test(line.text.trim());
              labelEl.textContent = isMusic ? `♪ ${line.text}` : `${line.index + 1}. ${line.text}`;
            }
          }
        });
        return;
      }

      plugin.clearRegions();
      lines.forEach((line, idx) => {
        const isMusic = /^\[.*(music|instrumental|interlude|♪).*\]$/i.test(line.text.trim());
        const contentEl = document.createElement('div');
        contentEl.className = isMusic
          ? 'ws-region-label px-1.5 py-0.5 text-[11px] font-bold text-sky-200 truncate bg-sky-950/80 border border-sky-400/40 rounded pointer-events-none max-w-full'
          : 'ws-region-label px-1.5 py-0.5 text-[11px] font-medium text-white truncate bg-black/60 rounded pointer-events-none max-w-full';
        contentEl.textContent = isMusic ? `♪ ${line.text}` : `${idx + 1}. ${line.text}`;

        plugin.addRegion({
          id: line.id,
          start: line.startTime,
          end: Math.max(line.startTime + 0.1, line.endTime),
          content: contentEl,
          color: getRegionColor(line, idx),
          drag: canEdit,
          resize: canEdit,
          minLength: 0.1,
        });
      });
    } finally {
      isInternalRegionSyncRef.current = false;
    }
  }, []);

  // Update working draft and refresh regions (does NOT mutate backend store)
  const applyDraftLinesAndRefreshRegions = useCallback(
    (lines: SyncedLine[]) => {
      draftLinesRef.current = lines;
      liveLinesRef.current = lines;
      setDraftLines(lines);
      const dur = wsDuration || activeSongRef.current?.duration || undefined;
      syncRegionsToWaveform(normalizeSyncedLines(lines, dur));
    },
    [syncRegionsToWaveform, wsDuration],
  );

  // Explicit Lock/Unlock Toggle
  const handleToggleUnlock = useCallback(() => {
    const nextUnlocked = !isEditingUnlockedRef.current;
    setIsEditingUnlocked(nextUnlocked);
    isEditingUnlockedRef.current = nextUnlocked;
    const plugin = regionsPluginRef.current;
    if (plugin) {
      plugin.getRegions().forEach((r) => {
        r.setOptions({ drag: nextUnlocked, resize: nextUnlocked });
      });
    }
    showToast(
      nextUnlocked
        ? 'Timeline Unlocked: Drag regions and nudge timestamps enabled.'
        : 'Timeline Locked: Scrubbing and auditioning safe from accidental edits.',
      'info',
    );
  }, [showToast]);

  // Audition / Verify Changes: Play from first modified line
  const handleAuditionChanges = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || !activeSong) return;
    const modifiedLine =
      draftLines.find((dl, idx) => {
        const sl = activeSong.syncedLines[idx];
        if (!sl) return true;
        return (
          Math.abs(dl.startTime - sl.startTime) > 0.001 ||
          Math.abs(dl.endTime - sl.endTime) > 0.001 ||
          dl.text !== sl.text
        );
      }) ?? draftLines.find((l) => l.id === selectedLineId) ?? draftLines[0];

    if (modifiedLine) {
      setSelectedLineId(modifiedLine.id);
      const cueTime = Math.max(0, modifiedLine.startTime - 1.2);
      ws.setTime(cueTime);
      ws.play().catch(() => {});
      showToast(`Auditioning verified changes from Line #${modifiedLine.index + 1}...`, 'info');
    }
  }, [draftLines, activeSong, selectedLineId, showToast]);

  // Discard Changes: Revert working draft to saved song package
  const handleDiscardChanges = useCallback(() => {
    if (!activeSong) return;
    const restored = activeSong.syncedLines.map((l) => ({ ...l }));
    setDraftLines(restored);
    draftLinesRef.current = restored;
    liveLinesRef.current = restored;
    syncRegionsToWaveform(restored);
    showToast('Reverted all unsaved edits to saved song timestamps.', 'info');
  }, [activeSong, syncRegionsToWaveform, showToast]);

  // Save Verified Sync: Commit draft to store and flush to disk
  const handleSaveVerifiedSync = useCallback(async () => {
    if (!activeSong) return;
    liveLinesRef.current = draftLines;
    await updateSyncedLines(draftLines);
    await flushSaveActiveSong(true);
    setIsEditingUnlocked(false);
    isEditingUnlockedRef.current = false;
    const plugin = regionsPluginRef.current;
    if (plugin) {
      plugin.getRegions().forEach((r) => r.setOptions({ drag: false, resize: false }));
    }
    showToast('Verified sync timestamps saved to song package!', 'success');
  }, [activeSong, draftLines, updateSyncedLines, flushSaveActiveSong, showToast]);

  // Interactive Resizers
  const handleWaveformResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = waveformHeight;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      setWaveformHeight(startH + delta);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleRightPanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightPanelWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      setRightPanelWidth(startW + delta);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleManualSyncResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = manualSyncWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setManualSyncWidth(startW + delta);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Adjust WaveSurfer canvas height dynamically when waveformHeight changes
  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.setOptions({ height: Math.max(60, waveformHeight - 44) });
    }
  }, [waveformHeight]);

  // Initialize WaveSurfer v7 for activeSong with safe isolated DOM mounting
  useEffect(() => {
    const container = waveformContainerRef.current;
    const timelineContainer = timelineContainerRef.current;
    if (!activeSong || !container || !timelineContainer) {
      return;
    }

    let cancelled = false;
    setIsTimelineLoading(true);
    setIsPlaying(false);
    setWsTime(0);
    setAnalyzedData(null);

    // Dedicated inner DOM elements for WaveSurfer & Timeline
    // Isolates WaveSurfer's internal DOM cleanup from React Virtual DOM reconciliation
    const innerWaveformEl = document.createElement('div');
    innerWaveformEl.className = 'w-full h-full';
    container.innerHTML = '';
    container.appendChild(innerWaveformEl);

    const timelineInnerEl = document.createElement('div');
    timelineInnerEl.className = 'w-full';
    timelineContainer.innerHTML = '';
    timelineContainer.appendChild(timelineInnerEl);

    const regions = RegionsPlugin.create();
    const timeline = TimelinePlugin.create({
      container: timelineInnerEl,
      height: 22,
      style: { fontSize: '10px', color: '#94a3b8' },
    });

    regionsPluginRef.current = regions;

    const ws = WaveSurfer.create({
      container: innerWaveformEl,
      height: Math.max(60, waveformHeight - 44),
      waveColor: vocalBandpass ? '#38bdf8' : '#64748b',
      progressColor: '#f5b942',
      cursorColor: '#fbbf24',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      autoScroll: true,
      autoCenter: true,
      minPxPerSec: zoomPxPerSec,
      plugins: [regions, timeline],
    });

    wsRef.current = ws;

    const audioUrl = toMediaUrl(activeSong.audioPath);
    ws.load(audioUrl).catch((err) => {
      if (!cancelled) {
        setIsTimelineLoading(false);
        showToast(`Waveform load error: ${(err as Error).message}`, 'error');
      }
    });

    setIsAnalyzing(true);
    analyzeSongAudio(activeSong.audioPath)
      .then((data) => {
        if (cancelled) return;
        setAnalyzedData(data);
        setIsAnalyzing(false);
        const cur = activeSongRef.current;
        if (cur && Math.abs(cur.duration - data.duration) > 0.25) {
          saveSong({ ...cur, duration: Number(data.duration.toFixed(3)) }).catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setIsAnalyzing(false);
      });

    ws.on('ready', (dur) => {
      if (cancelled) return;
      setIsTimelineLoading(false);
      setWsDuration(dur);
      ws.setPlaybackRate(playbackRate, true);
      ws.zoom(zoomPxPerSec);

      // Inject dark theme scrollbar styling into WaveSurfer Shadow DOM / wrapper
      try {
        const wrapper = ws.getWrapper();
        const root = (wrapper?.getRootNode && wrapper.getRootNode()) as ShadowRoot | Document | null;
        if (root && !root.querySelector?.('#ws-scrollbar-style')) {
          const style = document.createElement('style');
          style.id = 'ws-scrollbar-style';
          style.textContent = `
            ::-webkit-scrollbar {
              height: 8px !important;
              width: 8px !important;
            }
            ::-webkit-scrollbar-track {
              background: #0f172a !important;
              border-radius: 9999px !important;
            }
            ::-webkit-scrollbar-thumb {
              background: #334155 !important;
              border-radius: 9999px !important;
            }
            ::-webkit-scrollbar-thumb:hover {
              background: #f59e0b !important;
            }
          `;
          if (root instanceof ShadowRoot) {
            root.appendChild(style);
          } else if (wrapper) {
            wrapper.appendChild(style);
          }
        }
      } catch {}

      syncRegionsToWaveform(draftLinesRef.current);
    });

    ws.on('play', () => {
      setIsPlaying(true);
      if (isPresentingRef.current && activeSongRef.current) {
        const curSong = activeSongRef.current;
        const t = ws.getCurrentTime();
        const effective = t + (curSong.globalOffsetSeconds ?? 0);
        const linesToUse =
          draftLinesRef.current.length > 0 ? draftLinesRef.current : curSong.syncedLines;
        const resolved = resolveStageDisplayState(linesToUse, effective);
        const line =
          !resolved.isMusicInterlude && resolved.activeLineIndex >= 0
            ? linesToUse[resolved.activeLineIndex] ?? null
            : null;
        window.satsangAPI.syncPresentation({
          isPresenting: true,
          isBlank: isBlankRef.current,
          isMusicInterlude: resolved.isMusicInterlude,
          songId: curSong.id,
          songTitle: curSong.title,
          activeLine: line,
          styleConfig: curSong.styleConfig ?? DEFAULT_STYLE_CONFIG,
          isPreviewFallback: false,
        });
      }
    });

    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    ws.on('timeupdate', (t) => {
      setWsTime(t);
      if (isPresentingRef.current && activeSongRef.current) {
        const curSong = activeSongRef.current;
        const effective = t + (curSong.globalOffsetSeconds ?? 0);
        const linesToUse =
          draftLinesRef.current.length > 0 ? draftLinesRef.current : curSong.syncedLines;
        const resolved = resolveStageDisplayState(linesToUse, effective);
        const line =
          !resolved.isMusicInterlude && resolved.activeLineIndex >= 0
            ? linesToUse[resolved.activeLineIndex] ?? null
            : null;
        window.satsangAPI.syncPresentation({
          isPresenting: true,
          isBlank: isBlankRef.current,
          isMusicInterlude: resolved.isMusicInterlude,
          songId: curSong.id,
          songTitle: curSong.title,
          activeLine: line,
          styleConfig: curSong.styleConfig ?? DEFAULT_STYLE_CONFIG,
          isPreviewFallback: false,
        });
      }
    });

    regions.on('region-clicked', (region: Region, e: MouseEvent) => {
      e.stopPropagation();
      setSelectedLineId(region.id);
      if (!tapModeRef.current) {
        region.play(true);
      }
    });

    // Region drag/resize updates the working draft ONLY if unlocked
    regions.on('region-updated', (region: Region, side) => {
      if (isInternalRegionSyncRef.current) return;
      if (!isEditingUnlockedRef.current) return;
      const curLines = draftLinesRef.current;
      if (curLines.length === 0) return;

      let nextStart = Math.max(0, region.start);
      let nextEnd = Math.max(nextStart + 0.1, region.end);

      if (magneticSnapRef.current) {
        const snapThresh = 0.08;
        const others = curLines.filter((l) => l.id !== region.id);
        for (const o of others) {
          if (side !== 'end' && Math.abs(nextStart - o.endTime) <= snapThresh) {
            nextStart = o.endTime;
          }
          if (side !== 'start' && Math.abs(nextEnd - o.startTime) <= snapThresh) {
            nextEnd = o.startTime;
          }
        }
        nextStart = Math.round(nextStart * 100) / 100;
        nextEnd = Math.max(nextStart + 0.1, Math.round(nextEnd * 100) / 100);
        if (Math.abs(nextStart - region.start) > 0.001 || Math.abs(nextEnd - region.end) > 0.001) {
          isInternalRegionSyncRef.current = true;
          region.setOptions({ start: nextStart, end: nextEnd });
          isInternalRegionSyncRef.current = false;
        }
      }

      const updated = curLines.map((l) =>
        l.id === region.id ? { ...l, startTime: nextStart, endTime: nextEnd } : l,
      );
      setDraftLines(updated);
      draftLinesRef.current = updated;
      liveLinesRef.current = updated;
    });

    return () => {
      cancelled = true;
      setIsTimelineLoading(false);
      try {
        if (ws.isPlaying()) {
          ws.pause();
        }
      } catch {}
      try {
        regions.unAll();
        ws.unAll();
      } catch {}
      try {
        ws.destroy();
      } catch {}
      try {
        if (container.contains(innerWaveformEl)) {
          container.removeChild(innerWaveformEl);
        }
        if (timelineContainer.contains(timelineInnerEl)) {
          timelineContainer.removeChild(timelineInnerEl);
        }
      } catch {}
      wsRef.current = null;
      regionsPluginRef.current = null;
    };
  }, [activeSong?.id]);

  // Support Ctrl + MouseWheel to zoom waveform smoothly
  useEffect(() => {
    const el = waveformContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 20 : -20;
        setZoomPxPerSec((z) => {
          const next = Math.max(20, Math.min(200, z + delta));
          setWaveformZoom(next);
          showZoomNotice(`Waveform Zoom: ${next} px/s`);
          return next;
        });
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setWaveformZoom, showZoomNotice]);

  // Swap waveform peaks seamlessly when Vocal Bandpass filter toggles
  useEffect(() => {
    const ws = wsRef.current;
    const cur = activeSongRef.current;
    if (!ws || !cur || !analyzedData) return;

    const wasPlaying = ws.isPlaying();
    const curTime = ws.getCurrentTime();
    const peaks = vocalBandpass ? analyzedData.vocalPeaks : analyzedData.rawPeaks;

    ws.setOptions({
      waveColor: vocalBandpass ? '#38bdf8' : '#64748b',
    });

    ws.load(toMediaUrl(cur.audioPath), [peaks], analyzedData.duration)
      .then(() => {
        ws.setTime(curTime);
        ws.zoom(zoomPxPerSec);
        ws.setPlaybackRate(playbackRate, true);
        syncRegionsToWaveform(draftLinesRef.current);
        if (wasPlaying) {
          ws.play().catch(() => {});
        }
      })
      .catch(() => {});
  }, [vocalBandpass]);

  useEffect(() => {
    if (wsRef.current && wsDuration > 0) {
      wsRef.current.zoom(zoomPxPerSec);
    }
  }, [zoomPxPerSec, wsDuration]);

  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.setPlaybackRate(playbackRate, true);
    }
  }, [playbackRate]);

  // ==========================================
  // 1. Natural "Hold-to-Sing" Mode Mechanics:
  // Press & Hold = Singing. Release = Music Break!
  // ==========================================
  const handleHoldStart = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (isHoldingRef.current) return;

    const curLines = draftLinesRef.current;
    if (curLines.length === 0) return;

    if (!ws.isPlaying()) {
      ws.play().catch(() => {});
    }

    const t = Number(ws.getCurrentTime().toFixed(3));
    const curIdx = tapIndexRef.current;
    if (curIdx >= curLines.length) return;

    setIsHolding(true);
    isHoldingRef.current = true;
    holdStartTimeRef.current = t;

    const lines = curLines.map((l) => ({ ...l }));
    tapHistoryRef.current.push({
      lines: lines.map((l) => ({ ...l })),
      tapIndex: curIdx,
      prevClosedByMusic: prevClosedByMusic,
      stampTime: t,
    });

    // Stamp start of active line, placeholder duration 3s while holding
    const holdEnd = Math.min(wsDuration || t + 3.0, t + 3.0);
    lines[curIdx] = {
      ...lines[curIdx],
      startTime: t,
      endTime: holdEnd,
    };

    // Cascade subsequent lines immediately so they never have startTime < holdEnd
    let minNext = holdEnd;
    for (let j = curIdx + 1; j < lines.length; j++) {
      if (lines[j].startTime < minNext) {
        const oldDur = Math.max(0.5, lines[j].endTime - lines[j].startTime);
        lines[j] = {
          ...lines[j],
          startTime: Number(minNext.toFixed(3)),
          endTime: Number(Math.min(wsDuration || minNext + oldDur, minNext + oldDur).toFixed(3)),
        };
      }
      minNext = Math.max(minNext + 0.1, lines[j].endTime);
    }

    setSelectedLineId(lines[curIdx].id);
    applyDraftLinesAndRefreshRegions(lines);
  }, [wsDuration, prevClosedByMusic, applyDraftLinesAndRefreshRegions]);

  const handleHoldEnd = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || !isHoldingRef.current) return;

    setIsHolding(false);
    isHoldingRef.current = false;

    const t = Number(ws.getCurrentTime().toFixed(3));
    const curIdx = tapIndexRef.current;
    const curLines = draftLinesRef.current;
    const lines = curLines.map((l) => ({ ...l }));
    const target = lines[curIdx];
    if (!target) return;

    const start = holdStartTimeRef.current !== null ? holdStartTimeRef.current : target.startTime;
    holdStartTimeRef.current = null;
    const safeEnd = Math.max(start + 0.15, t);
    lines[curIdx] = { ...target, startTime: start, endTime: safeEnd };

    // Cascade subsequent lines after this point
    let minNext = safeEnd;
    for (let j = curIdx + 1; j < lines.length; j++) {
      if (lines[j].startTime < minNext) {
        const oldDur = Math.max(0.5, lines[j].endTime - lines[j].startTime);
        lines[j] = {
          ...lines[j],
          startTime: Number(minNext.toFixed(3)),
          endTime: Number(Math.min(wsDuration || minNext + oldDur, minNext + oldDur).toFixed(3)),
        };
      }
      minNext = Math.max(minNext + 0.1, lines[j].endTime);
    }

    const nextIdx = curIdx + 1;
    setTapIndex(nextIdx);
    tapIndexRef.current = nextIdx;
    applyDraftLinesAndRefreshRegions(lines);

    if (nextIdx >= lines.length) {
      setTapMode(false);
      showToast('All lyrics synchronized! Click "Save Verified Sync" to commit.', 'success');
    }
  }, [wsDuration, applyDraftLinesAndRefreshRegions, showToast]);

  // ==========================================
  // 2. Single-Tap (Rhythmic) Mode Mechanics
  // Space / Down = Next Line, Right = Music Interlude
  // ==========================================
  const handleTapStampNext = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;

    const curLines = draftLinesRef.current;
    if (curLines.length === 0) return;

    if (!ws.isPlaying()) {
      ws.play().catch(() => {});
    }

    const t = Number(ws.getCurrentTime().toFixed(3));
    const curIdx = tapIndexRef.current;
    const lines = curLines.map((l) => ({ ...l }));

    if (curIdx >= lines.length) {
      const last = lines[lines.length - 1];
      if (t > last.startTime + 0.1 && !prevClosedByMusic) {
        tapHistoryRef.current.push({
          lines: lines.map((l) => ({ ...l })),
          tapIndex: curIdx,
          prevClosedByMusic,
          stampTime: t,
        });
        lines[lines.length - 1] = { ...last, endTime: t };
        applyDraftLinesAndRefreshRegions(lines);
      }
      setTapMode(false);
      showToast('Tap-to-Sync complete! Click "Save Verified Sync" to commit.', 'success');
      return;
    }

    tapHistoryRef.current.push({
      lines: lines.map((l) => ({ ...l })),
      tapIndex: curIdx,
      prevClosedByMusic,
      stampTime: t,
    });

    if (curIdx > 0 && !prevClosedByMusic) {
      const prev = lines[curIdx - 1];
      lines[curIdx - 1] = {
        ...prev,
        endTime: Math.max(prev.startTime + 0.15, t),
      };
    }

    const nextEnd =
      curIdx < lines.length - 1
        ? Math.max(
            t + 2.5,
            lines[curIdx + 1]?.startTime > t ? lines[curIdx + 1].startTime : t + 3.5,
          )
        : Math.max(t + 3.5, wsDuration || t + 4);

    const clampedEnd = Math.min(wsDuration || nextEnd, nextEnd);
    lines[curIdx] = {
      ...lines[curIdx],
      startTime: t,
      endTime: clampedEnd,
    };

    let minNextStart = clampedEnd;
    for (let j = curIdx + 1; j < lines.length; j++) {
      if (lines[j].startTime < minNextStart) {
        const oldDur = Math.max(0.5, lines[j].endTime - lines[j].startTime);
        lines[j] = {
          ...lines[j],
          startTime: Number(minNextStart.toFixed(3)),
          endTime: Number(
            Math.min(wsDuration || minNextStart + oldDur, minNextStart + oldDur).toFixed(3),
          ),
        };
      }
      minNextStart = Math.max(minNextStart + 0.1, lines[j].endTime);
    }

    setSelectedLineId(lines[curIdx].id);
    setPrevClosedByMusic(false);
    const nextIdx = curIdx + 1;
    setTapIndex(nextIdx);
    tapIndexRef.current = nextIdx;
    applyDraftLinesAndRefreshRegions(lines);
  }, [prevClosedByMusic, wsDuration, applyDraftLinesAndRefreshRegions, showToast]);

  const handleTapEndToMusic = useCallback(() => {
    const ws = wsRef.current;
    const curIdx = tapIndexRef.current;
    if (!ws || curIdx <= 0) return;

    const curLines = draftLinesRef.current;
    const targetIdx = curIdx - 1;
    const lines = curLines.map((l) => ({ ...l }));
    const target = lines[targetIdx];
    if (!target) return;

    const t = Number(ws.getCurrentTime().toFixed(3));
    const endT = Math.max(target.startTime + 0.15, t);

    tapHistoryRef.current.push({
      lines: lines.map((l) => ({ ...l })),
      tapIndex: curIdx,
      prevClosedByMusic,
      stampTime: t,
    });

    lines[targetIdx] = { ...target, endTime: endT };
    setPrevClosedByMusic(true);
    applyDraftLinesAndRefreshRegions(lines);
  }, [prevClosedByMusic, applyDraftLinesAndRefreshRegions]);

  const handleTapUndo = useCallback(
    (rewind = false) => {
      const snap = tapHistoryRef.current.pop();
      if (!snap) return;
      setIsHolding(false);
      isHoldingRef.current = false;
      holdStartTimeRef.current = null;
      setTapIndex(snap.tapIndex);
      tapIndexRef.current = snap.tapIndex;
      setPrevClosedByMusic(snap.prevClosedByMusic);
      applyDraftLinesAndRefreshRegions(snap.lines);
      if (rewind && wsRef.current) {
        const targetSeek = Math.max(0, snap.stampTime - 1.5);
        wsRef.current.setTime(targetSeek);
      }
    },
    [applyDraftLinesAndRefreshRegions],
  );

  const startTapFromIndex = useCallback((idx: number) => {
    const lines = draftLinesRef.current;
    if (lines.length === 0) return;
    const clamped = Math.max(0, Math.min(lines.length - 1, idx));
    setTapIndex(clamped);
    tapIndexRef.current = clamped;
    setIsHolding(false);
    isHoldingRef.current = false;
    setPrevClosedByMusic(false);
    tapHistoryRef.current = [];
    setSelectedLineId(lines[clamped].id);
    holdStartTimeRef.current = null;
    setIsEditingUnlocked(true);
    isEditingUnlockedRef.current = true;
    setTapMode(true);
    setManualSyncVisible(true);
    setStudioTab('sync');

    if (wsRef.current && clamped > 0) {
      const prevEnd = lines[clamped - 1]?.endTime ?? 0;
      const cueSeek = Math.max(0, Math.min(lines[clamped].startTime - 1.5, prevEnd));
      wsRef.current.setTime(cueSeek);
    }
  }, []);

  useEffect(() => {
    if (!tapMode || !activeSong) return;
    const target = draftLines[tapIndex];
    if (!target) return;
    rowRefs.current.get(target.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [tapMode, tapIndex, activeSong, draftLines]);

  // ==========================================
  // Unified Keyboard Shortcuts & Zoom Listeners
  // Handles Ctrl++, Ctrl+-, Ctrl+0, Hold-to-Sing, Single Tap, and Aegisub shortcuts
  // ==========================================
  useEffect(() => {
    if (studioTab !== 'sync') return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Zoom Shortcuts: If focused or hovering over timeline, zoom waveform audio;
      // otherwise let event bubble to App.tsx for whole UI zoom
      if (e.ctrlKey || e.metaKey) {
        const isZoomPlus =
          e.key === '=' || e.key === '+' || e.code === 'NumpadAdd' || e.code === 'Equal';
        const isZoomMinus =
          e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' || e.code === 'Minus';
        const isZoomZero =
          e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0';

        if (isZoomPlus || isZoomMinus || isZoomZero) {
          if (isTimelineActiveRef.current) {
            e.preventDefault();
            e.stopPropagation();
            if (isZoomPlus) handleZoomIn();
            else if (isZoomMinus) handleZoomOut();
            else handleZoomReset();
            return;
          }
          return;
        }
      }

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const ws = wsRef.current;
      const song = activeSongRef.current;
      if (!ws || !song) return;

      // Tap-to-Sync Mode Hotkeys (Active when Manual Sync deck is open)
      if (manualSyncVisible && tapMode) {
        if (e.repeat) return;

        if (e.code === 'Space' || e.code === 'ArrowDown') {
          e.preventDefault();
          handleHoldStart();
          return;
        }
        if (e.code === 'Enter' || e.code === 'KeyM') {
          e.preventDefault();
          handleHoldEnd();
          const lines = draftLinesRef.current;
          if (tapIndexRef.current < lines.length - 1) {
            setTapIndex(tapIndexRef.current + 1);
            tapIndexRef.current = tapIndexRef.current + 1;
            setSelectedLineId(lines[tapIndexRef.current]?.id ?? null);
          }
          return;
        }

        if (e.code === 'ArrowLeft' || e.code === 'KeyU') {
          e.preventDefault();
          handleTapUndo(true);
        } else if (e.code === 'Backspace') {
          e.preventDefault();
          handleTapUndo(false);
        } else if (e.code === 'Escape') {
          e.preventDefault();
          setIsHolding(false);
          isHoldingRef.current = false;
          setManualSyncVisible(false);
        }
        return;
      }

      // Normal Timeline Navigation / Aegisub-style Shortcuts
      if (e.code === 'Space') {
        e.preventDefault();
        ws.playPause();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        const curLines = draftLinesRef.current;
        if (curLines.length === 0) return;
        const curIdx = curLines.findIndex((l) => l.id === selectedLineId);
        const nextIdx = Math.min(curLines.length - 1, curIdx + 1);
        const nextLine = curLines[nextIdx];
        if (nextLine) {
          setSelectedLineId(nextLine.id);
          rowRefs.current.get(nextLine.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        ws.skip(e.shiftKey ? -0.5 : -2);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        ws.skip(e.shiftKey ? 0.5 : 2);
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        const curLines = draftLinesRef.current;
        if (curLines.length === 0) return;
        e.preventDefault();
        const curIdx = curLines.findIndex((l) => l.id === selectedLineId);
        const nextIdx =
          e.code === 'ArrowUp'
            ? Math.max(0, (curIdx < 0 ? 0 : curIdx) - 1)
            : Math.min(curLines.length - 1, (curIdx < 0 ? -1 : curIdx) + 1);
        const nextLine = curLines[nextIdx];
        if (nextLine) {
          setSelectedLineId(nextLine.id);
          rowRefs.current.get(nextLine.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        if (!isEditingUnlockedRef.current) {
          showToast('Timeline is locked. Click "Unlock to Edit" to change timestamps.', 'info');
          return;
        }
        const curLines = draftLinesRef.current;
        const cur = curLines.find((l) => l.id === selectedLineId);
        if (!cur) return;
        e.preventDefault();
        const t = Number(ws.getCurrentTime().toFixed(3));
        const next = curLines.map((l) => {
          if (l.id !== cur.id) return l;
          return e.code === 'BracketLeft'
            ? { ...l, startTime: t, endTime: Math.max(t + 0.15, l.endTime) }
            : { ...l, endTime: Math.max(l.startTime + 0.15, t) };
        });
        applyDraftLinesAndRefreshRegions(next);
      } else if (e.code === 'Comma' || e.code === 'Period') {
        if (!isEditingUnlockedRef.current) {
          showToast('Timeline is locked. Click "Unlock to Edit" to change timestamps.', 'info');
          return;
        }
        const curLines = draftLinesRef.current;
        const cur = curLines.find((l) => l.id === selectedLineId);
        if (!cur) return;
        e.preventDefault();
        const step = (e.shiftKey ? 0.01 : 0.05) * (e.code === 'Comma' ? -1 : 1);
        const nextStart = Math.max(
          0,
          Math.min(cur.endTime - 0.1, Number((cur.startTime + step).toFixed(3))),
        );
        const next = curLines.map((l) =>
          l.id === cur.id ? { ...l, startTime: nextStart } : l,
        );
        applyDraftLinesAndRefreshRegions(next);
      } else if (e.code === 'KeyP') {
        if (!selectedLineId) return;
        e.preventDefault();
        const region = regionsPluginRef.current?.getRegions().find((r) => r.id === selectedLineId);
        region?.play(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (manualSyncVisible && tapMode && syncMethod === 'hold') {
        if (e.code === 'Space' || e.code === 'ArrowDown') {
          e.preventDefault();
          handleHoldEnd();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    studioTab,
    manualSyncVisible,
    tapMode,
    syncMethod,
    selectedLineId,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleHoldStart,
    handleHoldEnd,
    handleTapStampNext,
    handleTapEndToMusic,
    handleTapUndo,
    applyDraftLinesAndRefreshRegions,
    showToast,
  ]);

  if (!activeSong) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 bg-gradient-to-b from-[#0e111a] via-[#090b10] to-[#07080c] select-none overflow-y-auto slim-scrollbar">
        <div className="w-full max-w-2xl space-y-8 text-center my-auto">
          {/* Hero Branding */}
          <div className="space-y-3">
            <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 shadow-[0_0_30px_rgba(245,185,66,0.12)]">
              <img
                src={appLogo}
                alt="Gifts Presenter Logo"
                className="h-14 w-14 rounded-xl object-cover shadow"
              />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Gifts Presenter Studio
            </h1>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Live lyrics synchronization & stage projection. Import audio, synchronize lyrics with live tap-to-sing, and project borderless slides to the audience.
            </p>
          </div>

          {/* Quickstart Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-xl mx-auto">
            {/* Card 1: Add New Song */}
            <div
              onClick={() => onNewSong?.()}
              className="group relative flex flex-col justify-between rounded-2xl border border-stage-border bg-stage-panel/80 p-5 hover:border-amber-500/60 hover:bg-stage-panel hover:shadow-xl hover:shadow-amber-500/5 transition-all cursor-pointer"
            >
              <div className="space-y-2">
                <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                  <Plus className="h-5 w-5 stroke-[2.5]" />
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                  Add Song / Track
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Import an MP3, WAV, or FLAC track with lyrics to start synchronizing.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <span>Add Track</span>
                <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Card 2: Restore Project Backup */}
            <div
              onClick={importProject}
              className="group relative flex flex-col justify-between rounded-2xl border border-stage-border bg-stage-panel/80 p-5 hover:border-sky-500/60 hover:bg-stage-panel hover:shadow-xl hover:shadow-sky-500/5 transition-all cursor-pointer"
            >
              <div className="space-y-2">
                <div className="h-10 w-10 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
                  <FolderDown className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-sky-300 transition-colors">
                  Restore Project
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Restore a complete project backup (.gifts.zip) with songs, audio & media.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 text-xs font-semibold text-sky-400">
                <span>Import Backup</span>
                <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>

          {/* Quick Keyboard Shortcuts Reference Pill */}
          <div className="rounded-2xl border border-stage-border/80 bg-stage-panel/40 p-4 max-w-xl mx-auto backdrop-blur-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Live Stage & Studio Shortcuts
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-xl border border-white/5 bg-stage-bg/60 p-2">
                <kbd className="font-mono text-amber-300 font-bold">Space</kbd>
                <div className="text-[10px] text-slate-400 mt-0.5">Play / Pause</div>
              </div>
              <div className="rounded-xl border border-white/5 bg-stage-bg/60 p-2">
                <kbd className="font-mono text-amber-300 font-bold">Hold Space</kbd>
                <div className="text-[10px] text-slate-400 mt-0.5">Hold-to-Sing</div>
              </div>
              <div className="rounded-xl border border-white/5 bg-stage-bg/60 p-2">
                <kbd className="font-mono text-amber-300 font-bold">Ctrl + +/-</kbd>
                <div className="text-[10px] text-slate-400 mt-0.5">Waveform Zoom</div>
              </div>
              <div className="rounded-xl border border-white/5 bg-stage-bg/60 p-2">
                <kbd className="font-mono text-amber-300 font-bold">F5 / Present</kbd>
                <div className="text-[10px] text-slate-400 mt-0.5">Audience Screen</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleStartWhisperAlign = async () => {
    if (!activeSong) return;
    const lyricsSource = rawDraft.trim() ? rawDraft : activeSong.rawLyrics;
    if (!splitRawLyrics(lyricsSource).length) {
      showToast('Add lyric lines before running Whisper alignment.', 'error');
      return;
    }

    setIsWhisperAligning(true);
    setWhisperProgress({
      stage: 'extracting_audio',
      progress: 5,
      message: 'Extracting stereo-center vocals & resampling to 16kHz...',
    });

    const controller = new AbortController();
    whisperAbortControllerRef.current = controller;

    try {
      const res = await runWhisperAlignment({
        audioRelativePath: activeSong.audioPath,
        rawLyrics: lyricsSource,
        totalDuration: wsDuration || activeSong.duration,
        language: whisperLanguage,
        onProgress: (p) => setWhisperProgress(p),
        signal: controller.signal,
      });

      applyDraftLinesAndRefreshRegions(res.syncedLines);
      setIsEditingUnlocked(true);
      isEditingUnlockedRef.current = true;
      setShowWhisperModal(false);
      showToast(
        `Whisper mapped ${res.detectedWordCount} words to ${res.syncedLines.length} lines (${res.highConfidenceCount} anchor matches). Review & save when ready.`,
        'success',
      );
    } catch (err) {
      if ((err as Error).message.includes('cancelled')) {
        showToast('Whisper alignment cancelled.', 'info');
      } else {
        showToast(`Whisper alignment failed: ${(err as Error).message}`, 'error');
      }
    } finally {
      setIsWhisperAligning(false);
      setWhisperProgress(null);
      whisperAbortControllerRef.current = null;
    }
  };

  const handleCancelWhisperAlign = () => {
    whisperAbortControllerRef.current?.abort();
  };

  const handleRunOfflineDpAlign = async () => {
    const lyricsSource = rawDraft.trim() ? rawDraft : activeSong.rawLyrics;
    if (!splitRawLyrics(lyricsSource).length) {
      showToast('Add lyric lines before running deterministic alignment.', 'error');
      return;
    }
    setIsAligning(true);
    try {
      const res = await runOfflineVocalOnsetAlignment(
        lyricsSource,
        activeSong.audioPath,
        analyzedData,
      );
      setAnalyzedData(res.analyzed);
      applyDraftLinesAndRefreshRegions(res.syncedLines);
      setIsEditingUnlocked(true);
      isEditingUnlockedRef.current = true;
      showToast(
        `Offline DP Aligner mapped ${res.syncedLines.length} lines across ${res.segments.length} vocal phrases. Review and save when ready.`,
        'success',
      );
    } catch (err) {
      showToast(`Offline alignment failed: ${(err as Error).message}`, 'error');
    } finally {
      setIsAligning(false);
    }
  };

  const handleExportSrt = async () => {
    if (!activeSong) return;
    const srt = serializeSrt(draftLines);
    const ok = await window.satsangAPI.exportTextFileDialog(
      activeSong.title,
      srt,
      'srt',
      'SubRip Subtitles (*.srt)',
    );
    if (ok) {
      showToast('Exported SubRip (.srt) subtitles for external video editors.', 'success');
    }
  };

  const handleExportVtt = async () => {
    if (!activeSong) return;
    const vtt = serializeVtt(draftLines);
    const ok = await window.satsangAPI.exportTextFileDialog(
      activeSong.title,
      vtt,
      'vtt',
      'WebVTT Subtitles (*.vtt)',
    );
    if (ok) {
      showToast('Exported WebVTT (.vtt) file.', 'success');
    }
  };

  const handleExportJson = async () => {
    if (!activeSong) return;
    const json = JSON.stringify(
      {
        songId: activeSong.id,
        title: activeSong.title,
        duration: wsDuration || activeSong.duration,
        syncedLines: draftLines,
      },
      null,
      2,
    );
    const ok = await window.satsangAPI.exportTextFileDialog(
      activeSong.title,
      json,
      'json',
      'Synced Lyrics JSON (*.json)',
    );
    if (ok) {
      showToast('Exported synced lyrics JSON file.', 'success');
    }
  };

  const handleExportSongBundle = async () => {
    if (!activeSong) return;
    await exportBundle(activeSong.id);
  };

  const handleImportLrc = async () => {
    const res = await window.satsangAPI.importLrcDialog();
    if (!res) return;
    const parsed = parseLrc(res.content, wsDuration || activeSong.duration || undefined);
    setRawDraft(parsed.rawLyrics);
    applyDraftLinesAndRefreshRegions(parsed.syncedLines);
    setIsEditingUnlocked(true);
    isEditingUnlockedRef.current = true;
    showToast(`Imported ${parsed.syncedLines.length} lines from ${res.fileName}. Review and save when ready.`, 'success');
  };

  const handleExportLrc = async () => {
    const lrc = serializeLrc(draftLines, activeSong.title);
    const saved = await window.satsangAPI.exportLrcDialog(activeSong.title, lrc);
    if (saved) {
      showToast('Exported standard .LRC timecode file.', 'success');
    }
  };

  const handlePlayLine = (lineId: string) => {
    setSelectedLineId(lineId);
    const regions = regionsPluginRef.current?.getRegions() ?? [];
    const region = regions.find((r) => r.id === lineId);
    if (region) {
      region.play(true);
    }
  };

  const handleAddLineAtPlayhead = () => {
    const t = Number((wsRef.current?.getCurrentTime() ?? 0).toFixed(2));
    const dur = wsDuration || activeSong.duration || t + 4;
    const newLine: SyncedLine = {
      id: `line-${Date.now().toString(36)}`,
      index: draftLines.length,
      startTime: t,
      endTime: Math.min(dur, Number((t + 3).toFixed(2))),
      text: 'New lyric line',
    };
    const next = [...draftLines, newLine];
    setSelectedLineId(newLine.id);
    applyDraftLinesAndRefreshRegions(next);
  };

  const handleAddMusicBreakAtPlayhead = () => {
    const t = Number((wsRef.current?.getCurrentTime() ?? 0).toFixed(2));
    const dur = wsDuration || activeSong.duration || t + 5;
    const newBreak: SyncedLine = {
      id: `music-${Date.now().toString(36)}`,
      index: draftLines.length,
      startTime: t,
      endTime: Math.min(dur, Number((t + 4).toFixed(2))),
      text: '[♪ Instrumental Music]',
      confidence: 1.0,
    };
    const next = [...draftLines, newBreak];
    setSelectedLineId(newBreak.id);
    applyDraftLinesAndRefreshRegions(next);
    setIsEditingUnlocked(true);
    isEditingUnlockedRef.current = true;
    showToast('Added instrumental Music Animation break at playhead.', 'success');
  };

  const selectedIndex = draftLines.findIndex((l) => l.id === selectedLineId);
  const selectedLine = selectedIndex >= 0 ? draftLines[selectedIndex] : null;

  const updateLineTiming = (lineId: string, start: number, end: number) => {
    const safeStart = Math.max(0, Number(start.toFixed(3)));
    const safeEnd = Math.max(safeStart + 0.1, Number(end.toFixed(3)));
    const next = draftLines.map((l) =>
      l.id === lineId ? { ...l, startTime: safeStart, endTime: safeEnd } : l,
    );
    applyDraftLinesAndRefreshRegions(next);
  };

  const liveStageState = resolveStageDisplayState(
    draftLines,
    wsTime + (activeSong.globalOffsetSeconds ?? 0),
  );
  const livePreviewLine =
    liveStageState.activeLineIndex >= 0
      ? draftLines[liveStageState.activeLineIndex] ?? null
      : null;

  const renderManualSyncDeck = (isSideBySide: boolean) => {
    // --- SIDE-BY-SIDE COLUMN LAYOUT ---
    if (isSideBySide) {
      return (
        <div
          style={{
            width: lyricsTimelineVisible ? `${manualSyncWidth}px` : '100%',
            minWidth: lyricsTimelineVisible ? '280px' : 'auto',
            maxWidth: lyricsTimelineVisible ? '800px' : 'none',
          }}
          className={`flex flex-col min-h-0 shrink-0 border-r border-stage-border bg-[#0d1017] overflow-hidden ${
            !lyricsTimelineVisible ? 'flex-1' : ''
          }`}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-stage-border px-3 py-2 bg-[#090b10] shrink-0">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                <Zap className="h-3 w-3 text-amber-400" />
                {tapMode ? 'LIVE SYNC' : 'MANUAL SYNC'}
              </span>
              {tapMode && (
                <span className="font-mono text-xs font-bold text-amber-400">
                  #{Math.min(tapIndex + 1, draftLines.length)} / {draftLines.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {tapMode && (
                <button
                  type="button"
                  disabled={tapHistoryRef.current.length === 0}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    handleTapUndo(true);
                  }}
                  title="Undo last stamp & rewind 1.5s (← / U)"
                  className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-30 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Undo
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setIsHolding(false);
                  isHoldingRef.current = false;
                  setTapMode(!tapMode);
                }}
                title={tapMode ? 'Switch to timestamp fine-tune inspector' : 'Switch to live sync mode'}
                className="rounded-lg border border-stage-border bg-stage-card px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
              >
                {tapMode ? 'Inspector' : 'Live Sync'}
              </button>

              {/* Layout Switcher (Columns -> Rows) */}
              <button
                type="button"
                onClick={toggleSyncLayoutMode}
                title="Move panel to Stacked (Top / Bottom)"
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Rows className="h-3.5 w-3.5 text-sky-400" />
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  setIsHolding(false);
                  isHoldingRef.current = false;
                  setManualSyncVisible(false);
                }}
                title="Hide Live Sync Panel"
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Sub-header Transport Bar (Speed & Seek) */}
          <div className="flex items-center justify-between border-b border-stage-border/60 px-3 py-1.5 bg-black/40 shrink-0 text-[11px]">
            <div className="flex items-center gap-1">
              <span className="text-slate-500 text-[10px] uppercase font-bold mr-1">Speed:</span>
              {([0.75, 1, 1.25] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setPlaybackRate(r);
                  }}
                  className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
                    playbackRate === r ? 'bg-amber-500/25 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  wsRef.current?.skip(-2);
                }}
                className="rounded border border-stage-border/80 bg-stage-card px-1.5 py-0.5 text-slate-300 hover:text-white"
              >
                -2s
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  wsRef.current?.skip(2);
                }}
                className="rounded border border-stage-border/80 bg-stage-card px-1.5 py-0.5 text-slate-300 hover:text-white"
              >
                +2s
              </button>
            </div>
          </div>

          {/* Panel Main Content Area (Compact, NO scroll needed) */}
          <div className="flex-1 flex flex-col justify-between p-3 gap-2.5 overflow-hidden">
            {tapMode ? (
              <>
                {/* Hold to Sing Interactive Card */}
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleHoldStart();
                  }}
                  onMouseUp={(e) => {
                    e.preventDefault();
                    handleHoldEnd();
                  }}
                  onMouseLeave={() => {
                    if (isHoldingRef.current) handleHoldEnd();
                  }}
                  className={`w-full flex-1 min-h-[110px] cursor-pointer select-none rounded-2xl border-2 p-3 transition-all duration-150 flex flex-col items-center justify-center text-center shadow-lg ${
                    isHolding
                      ? 'border-amber-400 bg-amber-500/25 scale-[1.005] shadow-[0_0_24px_rgba(245,185,66,0.3)]'
                      : 'border-amber-500/50 bg-black/60 hover:border-amber-400 hover:bg-black/80'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider">
                    {isHolding ? (
                      <span className="flex items-center gap-1.5 text-amber-300 animate-pulse">
                        <Hand className="h-3.5 w-3.5" />
                        SINGING ACTIVE — RELEASE FOR MUSIC GAP
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <Hand className="h-3.5 w-3.5 text-amber-400" />
                        HOLD SPACEBAR / CLICK TO SING
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-base font-bold text-white max-w-full px-2 line-clamp-2">
                    {draftLines[tapIndex]?.text ?? 'All lines complete!'}
                  </div>

                  <div className="mt-2 text-xs text-slate-400 truncate max-w-full">
                    Up Next: <span className="text-slate-300 font-medium">{draftLines[tapIndex + 1]?.text ?? '— End of Song —'}</span>
                  </div>
                </div>

                {/* Footer Controls: Backtrack, Advance, Save */}
                <div className="flex items-center justify-between gap-2 shrink-0 pt-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={tapIndex <= 0}
                      onClick={() => {
                        const prev = Math.max(0, tapIndex - 1);
                        setTapIndex(prev);
                        tapIndexRef.current = prev;
                        setSelectedLineId(draftLines[prev]?.id ?? null);
                      }}
                      title="Backtrack to previous line"
                      className="rounded-lg border border-stage-border bg-stage-card px-2 py-1 text-xs text-slate-300 hover:text-white disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={tapIndex >= draftLines.length - 1}
                      onClick={() => {
                        const next = Math.min(draftLines.length - 1, tapIndex + 1);
                        setTapIndex(next);
                        tapIndexRef.current = next;
                        setSelectedLineId(draftLines[next]?.id ?? null);
                      }}
                      title="Advance to next line"
                      className="rounded-lg border border-stage-border bg-stage-card px-2 py-1 text-xs text-slate-300 hover:text-white disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {isDirty && (
                    <button
                      type="button"
                      onClick={handleSaveVerifiedSync}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 shadow transition-colors"
                    >
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                      Save Verified Sync
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* Fine-Tune Timestamp Inspector */
              <div className="flex-1 flex flex-col justify-between gap-2 overflow-hidden">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleToggleUnlock}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-2 py-1 text-xs font-semibold transition-all ${
                        isEditingUnlocked
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,185,66,0.2)]'
                          : 'border-stage-border bg-stage-card text-slate-300 hover:text-white'
                      }`}
                    >
                      {isEditingUnlocked ? (
                        <>
                          <Unlock className="h-3.5 w-3.5 text-amber-400" />
                          <span>Unlocked</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-3.5 w-3.5 text-slate-400" />
                          <span>Locked</span>
                        </>
                      )}
                    </button>

                    {isDirty && (
                      <button
                        type="button"
                        onClick={handleSaveVerifiedSync}
                        className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1 text-xs font-bold text-black hover:bg-emerald-400 shadow"
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                        Save
                      </button>
                    )}
                  </div>

                  {selectedLine ? (
                    <div className="rounded-xl border border-stage-border bg-black/40 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-sky-500/20 border border-sky-500/40 px-1.5 py-0.5 font-mono text-[11px] font-bold text-sky-300">
                          Line #{selectedIndex + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!wsRef.current) return;
                            const lead = Math.max(0, selectedLine.startTime - 1);
                            wsRef.current.setTime(lead);
                            wsRef.current.play().catch(() => {});
                          }}
                          className="rounded border border-stage-border bg-stage-card px-2 py-0.5 text-[10px] text-slate-300 hover:text-white"
                        >
                          -1s Cue Check
                        </button>
                      </div>

                      <div className="text-xs font-semibold text-white truncate">
                        {selectedLine.text}
                      </div>

                      {/* Start Nudge */}
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="text-[10px] text-slate-400 font-bold uppercase w-10">Start</span>
                        <button
                          type="button"
                          disabled={!isEditingUnlocked}
                          onClick={() => updateLineTiming(selectedLine.id, selectedLine.startTime - 0.1, selectedLine.endTime)}
                          className="rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-30"
                        >
                          -100
                        </button>
                        <SyncedTimeInput
                          value={selectedLine.startTime}
                          min={0}
                          disabled={!isEditingUnlocked}
                          className="w-16 rounded border border-stage-border bg-stage-panel px-1 py-0.5 text-center font-mono text-[11px] text-amber-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                          onCommit={(val) => updateLineTiming(selectedLine.id, val, Math.max(val + 0.1, selectedLine.endTime))}
                        />
                        <button
                          type="button"
                          disabled={!isEditingUnlocked}
                          onClick={() => updateLineTiming(selectedLine.id, selectedLine.startTime + 0.1, selectedLine.endTime)}
                          className="rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-30"
                        >
                          +100
                        </button>
                        <button
                          type="button"
                          disabled={!isEditingUnlocked}
                          title="Set Start = Playhead ([)"
                          onClick={() => {
                            const t = wsRef.current?.getCurrentTime() ?? 0;
                            updateLineTiming(selectedLine.id, t, Math.max(t + 0.15, selectedLine.endTime));
                          }}
                          className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30 disabled:opacity-30"
                        >
                          @Now [
                        </button>
                      </div>

                      {/* End Nudge */}
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="text-[10px] text-slate-400 font-bold uppercase w-10">End</span>
                        <button
                          type="button"
                          disabled={!isEditingUnlocked}
                          onClick={() => updateLineTiming(selectedLine.id, selectedLine.startTime, selectedLine.endTime - 0.1)}
                          className="rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-30"
                        >
                          -100
                        </button>
                        <SyncedTimeInput
                          value={selectedLine.endTime}
                          min={selectedLine.startTime + 0.1}
                          disabled={!isEditingUnlocked}
                          className="w-16 rounded border border-stage-border bg-stage-panel px-1 py-0.5 text-center font-mono text-[11px] text-sky-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                          onCommit={(val) => updateLineTiming(selectedLine.id, selectedLine.startTime, val)}
                        />
                        <button
                          type="button"
                          disabled={!isEditingUnlocked}
                          onClick={() => updateLineTiming(selectedLine.id, selectedLine.startTime, selectedLine.endTime + 0.1)}
                          className="rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-30"
                        >
                          +100
                        </button>
                        <button
                          type="button"
                          disabled={!isEditingUnlocked}
                          title="Set End = Playhead (])"
                          onClick={() => {
                            const t = wsRef.current?.getCurrentTime() ?? 0;
                            updateLineTiming(selectedLine.id, selectedLine.startTime, t);
                          }}
                          className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300 hover:bg-sky-500/30 disabled:opacity-30"
                        >
                          @Now ]
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-stage-border p-3 text-center text-xs text-slate-400">
                      Select any lyric line to inspect and adjust timestamps.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    startTapFromIndex(selectedIndex > 0 ? selectedIndex : 0);
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black shadow-lg hover:bg-amber-400 transition-transform active:scale-95"
                >
                  <Zap className="h-3.5 w-3.5" />
                  {selectedIndex > 0 ? `Start Live Sync (#${selectedIndex + 1})` : 'Start Live Sync Studio'}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // --- STACKED HORIZONTAL BANNER LAYOUT ---
    return (
      tapMode ? (
        <div className="border-b border-amber-500/40 bg-gradient-to-r from-[#1a1308] via-[#12151f] to-[#0f131c] px-4 py-2 space-y-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-amber-500 px-2 py-0.5 text-[11px] font-extrabold text-black tracking-wide">
                LIVE SYNC
              </span>
              <span className="text-xs font-semibold text-slate-200">
                Cue <span className="text-amber-300 font-mono font-bold">#{Math.min(tapIndex + 1, draftLines.length)} / {draftLines.length}</span>
              </span>

              {/* Speed Pills */}
              <div className="flex items-center rounded-lg border border-stage-border bg-black/40 p-0.5 text-[11px] ml-2">
                {([0.75, 1, 1.25] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setPlaybackRate(r);
                    }}
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      playbackRate === r ? 'bg-amber-500/25 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {r}x
                  </button>
                ))}
              </div>

              {/* Seek Buttons */}
              <button
                type="button"
                onClick={() => wsRef.current?.skip(-2)}
                className="rounded border border-stage-border bg-stage-card px-2 py-0.5 text-xs text-slate-200 hover:border-amber-500/50"
              >
                -2s
              </button>
              <button
                type="button"
                onClick={() => wsRef.current?.skip(2)}
                className="rounded border border-stage-border bg-stage-card px-2 py-0.5 text-xs text-slate-200 hover:border-amber-500/50"
              >
                +2s
              </button>

              <button
                type="button"
                disabled={tapHistoryRef.current.length === 0}
                onClick={() => handleTapUndo(true)}
                title="Undo last stamp & rewind (← / U)"
                className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-30"
              >
                <RotateCcw className="h-3 w-3" />
                Undo
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsHolding(false);
                  isHoldingRef.current = false;
                  setTapMode(false);
                }}
                className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
              >
                Inspector
              </button>

              {/* Layout Switcher (Rows -> Columns) */}
              <button
                type="button"
                onClick={toggleSyncLayoutMode}
                title="Move panel to Side-by-Side (Columns)"
                className="flex items-center gap-1 rounded-xl border border-stage-border bg-stage-card px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:border-amber-500/50 transition-colors"
              >
                <Columns className="h-3.5 w-3.5 text-amber-400" />
                Side-by-Side
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsHolding(false);
                  isHoldingRef.current = false;
                  setManualSyncVisible(false);
                }}
                title="Hide Live Sync Panel"
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Hold to Sing Card */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              handleHoldStart();
            }}
            onMouseUp={(e) => {
              e.preventDefault();
              handleHoldEnd();
            }}
            onMouseLeave={() => {
              if (isHoldingRef.current) handleHoldEnd();
            }}
            className={`w-full cursor-pointer select-none rounded-2xl border-2 px-4 py-2.5 transition-all duration-150 flex flex-col items-center justify-center text-center shadow-lg ${
              isHolding
                ? 'border-amber-400 bg-amber-500/25 scale-[1.005] shadow-[0_0_24px_rgba(245,185,66,0.25)]'
                : 'border-stage-border bg-black/60 hover:border-amber-500/60 hover:bg-black/70'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider">
              {isHolding ? (
                <span className="flex items-center gap-2 text-amber-300 animate-pulse">
                  <Hand className="h-3.5 w-3.5" />
                  SINGING ACTIVE — RELEASE SPACEBAR WHEN LINE ENDS
                </span>
              ) : (
                <span className="flex items-center gap-2 text-slate-300">
                  <Hand className="h-3.5 w-3.5 text-amber-400" />
                  HOLD SPACEBAR (OR CLICK) WHILE VOCALS SING
                </span>
              )}
            </div>

            <div className="mt-1 text-base font-bold tracking-tight text-white max-w-2xl truncate">
              {draftLines[tapIndex]?.text ?? 'All lines complete!'}
            </div>

            <div className="mt-1 text-xs text-slate-400">
              Up Next: <strong className="text-slate-300">{draftLines[tapIndex + 1]?.text ?? '— End of Song —'}</strong>
            </div>
          </div>
        </div>
      ) : (
        /* Stacked Inspector Mode */
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stage-border bg-[#0e1118] px-4 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleUnlock}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold transition-all ${
                isEditingUnlocked
                  ? 'border-amber-400 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,185,66,0.2)]'
                  : 'border-stage-border bg-stage-card text-slate-300 hover:text-white'
              }`}
            >
              {isEditingUnlocked ? (
                <>
                  <Unlock className="h-3 w-3 text-amber-400" />
                  <span>Unlocked</span>
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3 text-slate-400" />
                  <span>Locked</span>
                </>
              )}
            </button>

            {isDirty && (
              <>
                <button
                  type="button"
                  onClick={handleAuditionChanges}
                  className="flex items-center gap-1 rounded-xl border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-300 hover:bg-sky-500/20"
                >
                  <PlayCircle className="h-3 w-3" />
                  Audition
                </button>
                <button
                  type="button"
                  onClick={handleDiscardChanges}
                  className="flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
                >
                  <RotateCcw className="h-3 w-3" />
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSaveVerifiedSync}
                  className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1 text-xs font-bold text-black hover:bg-emerald-400 shadow"
                >
                  <Check className="h-3 w-3 stroke-[3]" />
                  Save Verified Sync
                </button>
              </>
            )}
          </div>

          {selectedLine ? (
            <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
              <span className="rounded bg-sky-500/15 border border-sky-500/40 px-2 py-0.5 font-mono text-xs font-bold text-sky-300">
                Line #{selectedIndex + 1}
              </span>

              {/* Start Nudge */}
              <div className="flex items-center gap-1 rounded-xl border border-stage-border bg-stage-bg px-2 py-0.5 text-xs">
                <span className="text-[10px] text-slate-400 font-semibold mr-1">Start</span>
                <button
                  type="button"
                  disabled={!isEditingUnlocked}
                  onClick={() => updateLineTiming(selectedLine.id, selectedLine.startTime - 0.1, selectedLine.endTime)}
                  className="rounded px-1 text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-30"
                >
                  -100
                </button>
                <SyncedTimeInput
                  value={selectedLine.startTime}
                  min={0}
                  disabled={!isEditingUnlocked}
                  className="w-14 rounded border border-stage-border bg-stage-panel px-1 py-0.5 text-center font-mono text-xs text-amber-300 focus:outline-none"
                  onCommit={(val) => updateLineTiming(selectedLine.id, val, Math.max(val + 0.1, selectedLine.endTime))}
                />
                <button
                  type="button"
                  disabled={!isEditingUnlocked}
                  onClick={() => updateLineTiming(selectedLine.id, selectedLine.startTime + 0.1, selectedLine.endTime)}
                  className="rounded px-1 text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-30"
                >
                  +100
                </button>
                <button
                  type="button"
                  disabled={!isEditingUnlocked}
                  title="Set Start = Playhead ([)"
                  onClick={() => {
                    const t = wsRef.current?.getCurrentTime() ?? 0;
                    updateLineTiming(selectedLine.id, t, Math.max(t + 0.15, selectedLine.endTime));
                  }}
                  className="rounded bg-amber-500/20 px-1 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30 disabled:opacity-30"
                >
                  @Now [
                </button>
              </div>

              {/* End Nudge */}
              <div className="flex items-center gap-1 rounded-xl border border-stage-border bg-stage-bg px-2 py-0.5 text-xs">
                <span className="text-[10px] text-slate-400 font-semibold mr-1">End</span>
                <button
                  type="button"
                  disabled={!isEditingUnlocked}
                  onClick={() => updateLineTiming(selectedLine.id, selectedLine.startTime, selectedLine.endTime - 0.1)}
                  className="rounded px-1 text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-30"
                >
                  -100
                </button>
                <SyncedTimeInput
                  value={selectedLine.endTime}
                  min={selectedLine.startTime + 0.1}
                  disabled={!isEditingUnlocked}
                  className="w-14 rounded border border-stage-border bg-stage-panel px-1 py-0.5 text-center font-mono text-xs text-sky-300 focus:outline-none"
                  onCommit={(val) => updateLineTiming(selectedLine.id, selectedLine.startTime, val)}
                />
                <button
                  type="button"
                  disabled={!isEditingUnlocked}
                  onClick={() => updateLineTiming(selectedLine.id, selectedLine.startTime, selectedLine.endTime + 0.1)}
                  className="rounded px-1 text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-30"
                >
                  +100
                </button>
                <button
                  type="button"
                  disabled={!isEditingUnlocked}
                  title="Set End = Playhead (])"
                  onClick={() => {
                    const t = wsRef.current?.getCurrentTime() ?? 0;
                    updateLineTiming(selectedLine.id, selectedLine.startTime, t);
                  }}
                  className="rounded bg-sky-500/20 px-1 text-[10px] font-bold text-sky-300 hover:bg-sky-500/30 disabled:opacity-30"
                >
                  @Now ]
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!wsRef.current) return;
                  const lead = Math.max(0, selectedLine.startTime - 1);
                  wsRef.current.setTime(lead);
                  wsRef.current.play().catch(() => {});
                }}
                className="rounded-xl border border-stage-border bg-stage-card px-2 py-1 text-xs text-slate-300 hover:text-white"
              >
                -1s Cue Check
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-400">
              Select any lyric line to inspect timestamps.
            </span>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startTapFromIndex(selectedIndex > 0 ? selectedIndex : 0)}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-black shadow hover:bg-amber-400"
            >
              <Zap className="h-3 w-3" />
              Start Live Sync
            </button>
            <button
              type="button"
              onClick={toggleSyncLayoutMode}
              title="Move panel to Side-by-Side (Columns)"
              className="flex items-center gap-1 rounded-xl border border-stage-border bg-stage-card px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
            >
              <Columns className="h-3.5 w-3.5 text-amber-400" />
              Side-by-Side
            </button>
            <button
              type="button"
              onClick={() => setManualSyncVisible(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )
    );
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-stage-bg relative">
      {/* Floating Zoom Notice HUD */}
      {zoomToast && (
        <div className="pointer-events-none absolute top-16 right-8 z-40 flex items-center gap-2 rounded-xl border border-amber-400/50 bg-black/85 px-4 py-2 font-mono text-xs font-bold text-amber-300 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
          <ZoomIn className="h-4 w-4 text-amber-400" />
          <span>{zoomToast}</span>
        </div>
      )}

      {/* Song Preparation Header Bar: Sync vs Per-Song Stage Config */}
      <div className="flex flex-nowrap items-center justify-between gap-3 border-b border-stage-border bg-[#0b0d13] px-4 py-2 min-w-0 shrink-0 relative z-30 overflow-visible">
        <div className="flex items-center gap-2.5 min-w-0 shrink">
          <div className="min-w-0 max-w-[120px] sm:max-w-[160px] md:max-w-[200px] shrink">
            <div className="truncate text-sm font-bold text-white" title={activeSong.title}>
              {activeSong.title}
            </div>
            <div className="truncate text-[11px] text-slate-400">
              {draftLines.length} lines • Offset{' '}
              {Math.round((activeSong.globalOffsetSeconds ?? 0) * 1000)}ms
            </div>
          </div>

          <div className="h-5 w-px bg-stage-border mx-0.5 shrink-0" />

          {/* Mode Switcher Tabs */}
          <div className="flex items-center rounded-xl border border-stage-border bg-stage-bg p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setStudioTab('sync')}
              title="Lyrics & Manual Sync"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                studioTab === 'sync'
                  ? 'bg-stage-card text-amber-300 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Lyrics & Sync</span>
            </button>
            <button
              type="button"
              onClick={() => setStudioTab('config')}
              title="Stage Look & Visual Package"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                studioTab === 'config'
                  ? 'bg-stage-card text-amber-300 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Palette className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Stage Look</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {studioTab === 'sync' ? (
            <>
              {/* If uncommitted lyric sync edits exist */}
              {isDirty && (
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-bold text-amber-300 animate-pulse shrink-0">
                    ● <span className="hidden md:inline">Unsaved</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleDiscardChanges}
                    title="Discard uncommitted edits and revert to saved"
                    className="flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 active:scale-95 transition-all shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Discard</span>
                  </button>
                </div>
              )}

              {/* Save Verified Sync Button */}
              <button
                type="button"
                onClick={handleSaveVerifiedSync}
                title="Save verified sync timestamps to song package"
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shadow-sm shrink-0 active:scale-95 ${
                  isDirty
                    ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-md'
                    : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                }`}
              >
                <Check className="h-3.5 w-3.5 stroke-[3] text-current" />
                <span className="hidden sm:inline">Save Verified Sync</span>
                <span className="sm:hidden">Save Sync</span>
              </button>

              {/* Export Song Menu (After Save button in Lyrics & Sync) */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowExportMenu((v) => !v)}
                  title="Export song in various formats (.zip, .lrc, .srt, .vtt, .json)"
                  className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 active:scale-95 transition-all shadow-sm shrink-0"
                >
                  <Download className="h-3.5 w-3.5 text-sky-400" />
                  <span className="hidden sm:inline">Export Song</span>
                  <span className="sm:hidden">Export</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>

                {showExportMenu && (
                  <div
                    className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-2xl border border-stage-border bg-[#0e1118]/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 space-y-0.5"
                  >
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Export Formats
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportSongBundle();
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-amber-200 hover:bg-amber-500/15 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Download className="h-3.5 w-3.5 text-amber-400" />
                        <span>Song Package (.zip)</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Audio + Sync</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportLrc();
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs font-semibold text-emerald-200 hover:bg-emerald-500/15 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Download className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Standard LRC (.lrc)</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Players</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportSrt();
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Download className="h-3.5 w-3.5 text-sky-400" />
                        <span>SubRip Subtitles (.srt)</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Premiere / DaVinci</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportVtt();
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Download className="h-3.5 w-3.5 text-sky-400" />
                        <span>WebVTT Captions (.vtt)</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Web / Video</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportJson();
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-purple-400" />
                        <span>Synced JSON (.json)</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Data</span>
                    </button>

                    <div className="my-1 border-t border-stage-border/60" />

                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Import & Replace
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        handleImportLrc();
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-white/5 transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5 text-slate-400" />
                      <span>Import .LRC Timecode File</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Stage Look Tab: Save Song Config Button */}
              <button
                type="button"
                onClick={async () => {
                  if (isDirty) {
                    await updateSyncedLines(draftLines);
                  }
                  await flushSaveActiveSong(true);
                }}
                title="Save changes to this song package"
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-all shadow-sm shrink-0"
              >
                <Save className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Save Song Config</span>
                <span className="sm:hidden">Save</span>
              </button>

              {/* Stage Look Tab: Apply to All Songs Button */}
              <button
                type="button"
                onClick={() => setApplyAllModalOpen(true)}
                title={`Apply this Stage Look to all ${songs.length} songs`}
                className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 active:scale-95 transition-all shadow-sm shrink-0"
              >
                <CopyCheck className="h-3.5 w-3.5 text-sky-400" />
                <span className="hidden sm:inline">Apply to All Songs</span>
                <span className="sm:hidden">Apply All</span>
              </button>
            </>
          )}
        </div>
      </div>

      {studioTab === 'config' && (
        <SongConfigPanel key={activeSong.id} song={activeSong} onGoToStage={() => setMode('stage')} />
      )}

      {/* Keep Waveform Sync DOM mounted (hidden when editing visual config) so WaveSurfer never reloads */}
      <div className={studioTab === 'sync' ? 'flex flex-1 min-h-0 flex-col overflow-hidden' : 'hidden'}>
        {/* Clean Transport + Waveform Tool Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stage-border bg-stage-panel px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => wsRef.current?.playPause()}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-1.5 text-xs font-bold text-black hover:bg-amber-400"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            <div className="flex items-center rounded-xl border border-stage-border bg-stage-bg p-0.5">
              <button
                type="button"
                onClick={() => wsRef.current?.skip(-2)}
                title="Rewind 2s (Left Arrow)"
                className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
              >
                -2s
              </button>
              <div className="px-2.5 font-mono text-xs text-amber-300">
                {formatTimeMs(wsTime)}{' '}
                <span className="text-slate-500">/ {formatTimeMs(wsDuration || activeSong.duration)}</span>
              </div>
              <button
                type="button"
                onClick={() => wsRef.current?.skip(2)}
                title="Forward 2s (Right Arrow)"
                className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
              >
                +2s
              </button>
            </div>

            <div className="flex items-center rounded-xl border border-stage-border bg-stage-bg p-0.5">
              {([0.75, 1, 1.25, 1.5] as const).map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setPlaybackRate(rate)}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                    playbackRate === rate
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setVocalBandpass((v) => !v)}
              title="Highlight 300Hz–3400Hz vocal waveform spikes"
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                vocalBandpass
                  ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                  : 'border-stage-border bg-stage-card text-slate-300 hover:text-white'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Vocals (300–3.4kHz)
              {isAnalyzing && <span className="text-[10px] opacity-75">...</span>}
            </button>

            <button
              type="button"
              onClick={() => setMagneticSnap((v) => !v)}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                magneticSnap
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-stage-border bg-stage-card text-slate-400'
              }`}
            >
              <Magnet className="h-3.5 w-3.5" />
              Snap
            </button>

            {/* Quick Zoom Controls with Tooltips */}
            <div className="flex items-center gap-1 rounded-xl border border-stage-border bg-stage-bg p-0.5">
              <button
                type="button"
                onClick={handleZoomOut}
                title="Zoom Out Waveform (Ctrl + -)"
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleZoomReset}
                title="Reset Waveform Zoom (Ctrl + 0)"
                className="px-1.5 font-mono text-[11px] text-slate-300 hover:text-amber-300"
              >
                {zoomPxPerSec} px/s
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                title="Zoom In Waveform (Ctrl + +)"
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 relative">
            {/* Lyric Timeline Toggle Button */}
            <button
              type="button"
              onClick={toggleLyricsTimelineVisible}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                lyricsTimelineVisible
                  ? 'border-stage-border bg-stage-card text-slate-200 hover:border-amber-500/50'
                  : 'border-dashed border-stage-border/70 bg-transparent text-slate-500 hover:text-slate-300'
              }`}
              title={lyricsTimelineVisible ? 'Hide Lyrics Timeline' : 'Show Lyrics Timeline'}
            >
              <ListMusic className={`h-3.5 w-3.5 ${lyricsTimelineVisible ? 'text-amber-400' : 'text-slate-500'}`} />
              <span>{lyricsTimelineVisible ? 'Lyrics' : 'Lyrics: Hidden'}</span>
            </button>

            {/* Dedicated Manual Sync Toggle Button */}
            <button
              type="button"
              onClick={toggleManualSyncVisible}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                manualSyncVisible
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,185,66,0.2)]'
                  : 'border-stage-border bg-stage-card text-slate-300 hover:text-white'
              }`}
              title={
                manualSyncVisible
                  ? 'Hide Manual Sync Command Deck (Frees vertical space for Lyrics)'
                  : 'Show Manual Sync Command Deck (Tap-to-Sync & Fine-Tune)'
              }
            >
              <Zap className={`h-3.5 w-3.5 ${manualSyncVisible ? 'text-amber-400 fill-amber-400' : 'text-slate-400'}`} />
              <span>{manualSyncVisible ? 'Manual Sync: Active' : 'Manual Sync'}</span>
            </button>

            {/* Panel Arrangement Switcher (Side-by-Side vs Stacked) */}
            {manualSyncVisible && lyricsTimelineVisible && (
              <button
                type="button"
                onClick={toggleSyncLayoutMode}
                className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-amber-500/50 transition-colors"
                title={`Switch workspace layout to ${syncLayoutMode === 'side-by-side' ? 'Stacked (Top / Bottom)' : 'Side-by-Side (Columns)'}`}
              >
                {syncLayoutMode === 'side-by-side' ? (
                  <>
                    <Columns className="h-3.5 w-3.5 text-amber-400" />
                    <span>Side-by-Side</span>
                  </>
                ) : (
                  <>
                    <Rows className="h-3.5 w-3.5 text-sky-400" />
                    <span>Stacked</span>
                  </>
                )}
              </button>
            )}

            {/* Explicit Live Preview Toggle */}
            <button
              type="button"
              onClick={togglePreviewEnabled}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                previewEnabled
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                  : 'border-stage-border bg-stage-card text-slate-300 hover:text-white'
              }`}
              title={previewEnabled ? 'Hide Live Preview Panel' : 'Show Live Preview Panel'}
            >
              {previewEnabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {previewEnabled ? '16:9 Preview' : 'Preview Off'}
            </button>

            {/* Dedicated Large Raw Lyrics Studio Modal Launcher */}
            <button
              type="button"
              onClick={() => setShowRawModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-amber-400" />
              Raw Lyrics Studio
            </button>

            <div className="relative" ref={autoMenuRef}>
              <button
                type="button"
                disabled={isAligning}
                onClick={() => setShowAutoMenu((v) => !v)}
                className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-500/50 disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>{isAligning ? 'Aligning...' : 'Auto-Sync'}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {showAutoMenu && (
                <div
                  className="absolute right-0 mt-2 w-72 rounded-2xl border border-stage-border bg-stage-panel p-2 shadow-2xl z-30 space-y-1"
                >
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Precision Audio Alignment
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAutoMenu(false);
                      setShowWhisperModal(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-emerald-300 hover:bg-emerald-500/15 transition-colors"
                  >
                    <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>Local Whisper AI Sync</span>
                        <span className="rounded bg-emerald-500/20 text-[9px] px-1 py-0.2 font-mono text-emerald-300">100% Free</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Word-level DTW • Offline Web Worker</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAutoMenu(false);
                      handleRunOfflineDpAlign();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors"
                  >
                    <Activity className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span className="text-white">Offline Vocal-Onset DP</span>
                        <span className="rounded bg-emerald-500/20 text-[9px] px-1 py-0.2 font-mono text-emerald-300">100% Free</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Heuristic Energy Envelope • Offline DSP</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resizable Waveform + Regions Timeline Container */}
        <div
          style={{ height: `${waveformHeight}px` }}
          tabIndex={0}
          onFocus={() => setIsTimelineFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsTimelineFocused(false);
            }
          }}
          onMouseEnter={() => setIsTimelineHovered(true)}
          onMouseLeave={() => setIsTimelineHovered(false)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (selectedLineId && wsRef.current && isEditingUnlockedRef.current) {
              const t = Number(wsRef.current.getCurrentTime().toFixed(3));
              const next = draftLinesRef.current.map((l) =>
                l.id === selectedLineId ? { ...l, endTime: Math.max(l.startTime + 0.15, t) } : l,
              );
              applyDraftLinesAndRefreshRegions(next);
              showToast(`Set line end to ${formatTimeMs(t)} (Aegisub right-click)`, 'success');
            } else if (!isEditingUnlockedRef.current) {
              showToast('Timeline is locked. Click "Unlock to Edit" to change timestamps.', 'info');
            }
          }}
          className={`border-b px-4 pt-2 pb-1 relative select-none transition-all outline-none flex flex-col justify-between ${
            isTimelineActive
              ? 'border-amber-500/70 bg-[#0d101a] ring-1 ring-amber-400/40 shadow-[inset_0_0_24px_rgba(245,185,66,0.06)]'
              : 'border-stage-border bg-[#0a0c12]'
          }`}
        >
          {isTimelineLoading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0a0c12]/85 backdrop-blur-[2px] pointer-events-none transition-all">
              <div className="flex items-end gap-1.5 h-10">
                <span className="w-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.4s] h-5" />
                <span className="w-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.2s] h-8" />
                <span className="w-1.5 bg-amber-400 rounded-full animate-bounce h-10" />
                <span className="w-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.15s] h-7" />
                <span className="w-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s] h-4" />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-300 tracking-wide animate-pulse">
                <span>Loading & Decoding Timeline Audio...</span>
              </div>
              <span className="mt-0.5 text-[10px] text-slate-500 font-mono">
                Generating high-precision waveform peaks
              </span>
            </div>
          )}
          <div ref={waveformContainerRef} className="w-full cursor-pointer flex-1 min-h-0" />
          <div ref={timelineContainerRef} className="w-full mt-0.5 shrink-0" />
          <div className="flex items-center justify-between text-[11px] px-1 shrink-0">
            <span className={isTimelineActive ? 'text-amber-300 font-semibold' : 'text-slate-500'}>
              {isTimelineActive
                ? '● Timeline Focused: Ctrl + + / - zooms waveform audio'
                : 'Click or hover timeline to zoom audio • Ctrl + + / - zooms whole UI'}
            </span>
            <span className="text-slate-500">{draftLines.length} Regions</span>
          </div>
        </div>

        {/* Vertical Resizer Handle between Waveform Timeline and Lower Deck */}
        <div
          onMouseDown={handleWaveformResizeStart}
          className="group relative h-2 w-full shrink-0 cursor-row-resize bg-stage-border/60 hover:bg-amber-400 transition-colors flex items-center justify-center select-none z-10"
          title="Drag to resize Waveform Timeline height"
        >
          <div className="w-12 h-0.5 rounded-full bg-slate-500 group-hover:bg-black transition-colors" />
        </div>

        {/* Dedicated Manual Sync Command Deck (Stacked Mode: Horizontal Banner below Waveform) */}
        {manualSyncVisible && syncLayoutMode === 'stacked' && renderManualSyncDeck(false)}

        {/* Main Workspace Split: Clean Scannable Lyric Sheet + Optional Live 16:9 Preview */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Side-by-Side Column: Manual Sync Deck */}
          {manualSyncVisible && syncLayoutMode === 'side-by-side' && (
            <>
              {renderManualSyncDeck(true)}
              {lyricsTimelineVisible && (
                <div
                  onMouseDown={handleManualSyncResizeStart}
                  className="group relative w-1.5 shrink-0 cursor-col-resize bg-stage-border/60 hover:bg-amber-400 transition-colors flex items-center justify-center select-none z-10"
                  title="Drag to resize Manual Sync panel width"
                >
                  <div className="h-8 w-0.5 rounded-full bg-slate-500 group-hover:bg-black transition-colors" />
                </div>
              )}
            </>
          )}

          {/* Lyric Timeline Main Column */}
          {lyricsTimelineVisible ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-stage-bg border-r border-stage-border">
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-stage-border px-3.5 py-2 bg-[#090b10] shrink-0 relative">
                <div className="flex items-center gap-2">
                  <ListMusic className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Lyric Timeline
                  </span>
                  <span className="rounded bg-black/40 border border-stage-border px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                    {draftLines.length} lines
                  </span>
                </div>

                <div className="flex items-center gap-1.5 relative">
                  {/* (i) Controls & Shortcuts Menu Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowTimelineInfo((v) => !v)}
                    title="Timeline Actions & Keyboard Shortcuts"
                    className={`rounded-lg p-1.5 text-xs font-semibold transition-colors flex items-center gap-1 ${
                      showTimelineInfo
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Info className="h-4 w-4 text-amber-400" />
                  </button>

                  {/* Layout Move Button: Side-by-Side vs Stacked */}
                  <button
                    type="button"
                    onClick={toggleSyncLayoutMode}
                    title={`Move panel to ${syncLayoutMode === 'side-by-side' ? 'Stacked (Top / Bottom)' : 'Side-by-Side (Columns)'}`}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    {syncLayoutMode === 'side-by-side' ? (
                      <Rows className="h-4 w-4 text-sky-400" />
                    ) : (
                      <Columns className="h-4 w-4 text-amber-400" />
                    )}
                  </button>

                  {/* Close / Hide Button */}
                  <button
                    type="button"
                    onClick={() => setLyricsTimelineVisible(false)}
                    title="Hide Lyric Timeline"
                    className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  {/* (i) Centered Dialog Overlay (Never cut off or clipped by viewport) */}
                  {showTimelineInfo && (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100"
                      onClick={() => setShowTimelineInfo(false)}
                    >
                      <div
                        className="w-full max-w-sm rounded-2xl border border-stage-border bg-[#0d1017] p-4 shadow-2xl space-y-3.5 animate-in zoom-in-95 duration-100 max-h-[85vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between border-b border-stage-border/60 pb-2.5">
                          <span className="text-sm font-bold text-amber-300 flex items-center gap-2">
                            <Info className="h-4 w-4 text-amber-400" />
                            Timeline Actions & Shortcuts
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowTimelineInfo(false)}
                            className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Quick Insert Actions */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Insert Actions
                          </span>
                          <div className="grid grid-cols-1 gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setShowTimelineInfo(false);
                                handleAddMusicBreakAtPlayhead();
                              }}
                              className="flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/20 transition-colors text-left"
                            >
                              <Music2 className="h-3.5 w-3.5 text-sky-300 shrink-0" />
                              <span>+ Music Break at Playhead</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowTimelineInfo(false);
                                handleAddLineAtPlayhead();
                              }}
                              className="flex items-center gap-2 rounded-xl border border-stage-border bg-stage-card px-3 py-2 text-xs font-medium text-slate-200 hover:border-amber-500/50 transition-colors text-left"
                            >
                              <Plus className="h-3.5 w-3.5 shrink-0" />
                              <span>+ Add Line at Playhead</span>
                            </button>
                          </div>
                        </div>

                        {/* Keyboard Shortcuts List */}
                        <div className="space-y-1.5 border-t border-stage-border/60 pt-2.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Keyboard Shortcuts
                          </span>
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center justify-between py-0.5">
                              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[11px]">Space</span>
                              <span className="text-slate-300 text-[11px]">Hold = Sing, Release = Music</span>
                            </div>
                            <div className="flex items-center justify-between py-0.5">
                              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[11px]">Enter / M</span>
                              <span className="text-slate-300 text-[11px]">Commit Line & Advance</span>
                            </div>
                            <div className="flex items-center justify-between py-0.5">
                              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[11px]">← / U</span>
                              <span className="text-slate-300 text-[11px]">Undo Last Stamp & Rewind</span>
                            </div>
                            <div className="flex items-center justify-between py-0.5">
                              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[11px]">[ / ]</span>
                              <span className="text-slate-300 text-[11px]">Set Start / End at Playhead</span>
                            </div>
                            <div className="flex items-center justify-between py-0.5">
                              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[11px]">, / .</span>
                              <span className="text-slate-300 text-[11px]">Nudge Timing ±50ms</span>
                            </div>
                            <div className="flex items-center justify-between py-0.5">
                              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[11px]">P</span>
                              <span className="text-slate-300 text-[11px]">Play Selected Line</span>
                            </div>
                            <div className="flex items-center justify-between py-0.5">
                              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[11px]">Ctrl + + / -</span>
                              <span className="text-slate-300 text-[11px]">Zoom Waveform In / Out</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Lyric Lines Scrollable List (w-full min-w-0 overflow-x-hidden fixes highlighting!) */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden divide-y divide-stage-border/30 slim-scrollbar">
                {(() => {
                  const liveIdx = liveStageState.activeLineIndex;
                  const firstLineStart = draftLines[0]?.startTime ?? 0;
                  return (
                    <>
                      {firstLineStart >= 0.8 && (
                        <div className="flex items-center justify-between bg-sky-500/[0.06] px-3.5 py-1.5 text-xs text-sky-300 w-full min-w-0">
                          <span className="flex items-center gap-2">
                            <Music2 className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              Intro Music Animation ({formatTimeMs(0)} → {formatTimeMs(firstLineStart)} • {firstLineStart.toFixed(1)}s)
                            </span>
                          </span>
                        </div>
                      )}

                      {draftLines.map((line, idx) => {
                        const isSelected = line.id === selectedLineId;
                        const isTapTarget = tapMode && idx === tapIndex;
                        const isLivePlayhead = idx === liveIdx && !liveStageState.isMusicInterlude;
                        const isModified = isLineModified(line.id);
                        const durSec = Math.max(0.01, line.endTime - line.startTime);
                        const nextLine = draftLines[idx + 1];
                        const gapAfter = nextLine ? nextLine.startTime - line.endTime : 0;
                        const progressPct = isLivePlayhead
                          ? Math.max(0, Math.min(100, ((wsTime - line.startTime) / durSec) * 100))
                          : 0;

                        const isMusicTag = /^\\[.*(music|instrumental|interlude|♪).*\\]$/i.test(line.text.trim());

                        return (
                          <React.Fragment key={line.id}>
                            <div
                              ref={(el) => {
                                if (el) rowRefs.current.set(line.id, el);
                                else rowRefs.current.delete(line.id);
                              }}
                              onClick={() => setSelectedLineId(line.id)}
                              className={`group relative flex items-center justify-between gap-2 px-3 py-2 w-full min-w-0 transition-colors cursor-pointer select-none ${
                                isTapTarget
                                  ? 'bg-amber-500/20 border-l-4 border-l-amber-400'
                                  : isLivePlayhead
                                    ? 'bg-emerald-500/10 border-l-4 border-l-emerald-400'
                                    : isSelected
                                      ? 'bg-white/[0.06] border-l-4 border-l-sky-400'
                                      : 'hover:bg-white/[0.03]'
                              }`}
                            >
                              {/* Live Playhead Progress Bar on bottom edge */}
                              {isLivePlayhead && (
                                <div
                                  className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-emerald-400 transition-all duration-75"
                                  style={{ width: `${progressPct}%` }}
                                />
                              )}

                              {/* Left: Line Index & Time Badge */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="w-5 text-right font-mono text-xs font-semibold text-slate-500">
                                  {idx + 1}
                                </span>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedLineId(line.id);
                                    wsRef.current?.setTime(line.startTime);
                                  }}
                                  title="Click to jump playhead to start time"
                                  className="flex items-center gap-1 rounded-md border border-stage-border/80 bg-stage-bg/80 px-2 py-0.5 font-mono text-[11px] hover:border-amber-500/50"
                                >
                                  <span className="text-amber-300">{formatTimeMs(line.startTime)}</span>
                                  <span className="text-slate-600">→</span>
                                  <span className="text-sky-300">{formatTimeMs(line.endTime)}</span>
                                  <span className="text-[10px] text-slate-500 ml-0.5 font-sans">
                                    {durSec.toFixed(1)}s
                                  </span>
                                </button>
                              </div>

                              {/* Center: Editable Text Input (truncates gracefully, never breaks layout) */}
                              <div className="flex-1 min-w-0 mx-1.5">
                                <input
                                  type="text"
                                  value={line.text}
                                  onClick={(e) => e.stopPropagation()}
                                  onFocus={() => setSelectedLineId(line.id)}
                                  onChange={(e) => {
                                    const next = draftLines.map((l) =>
                                      l.id === line.id ? { ...l, text: e.target.value } : l,
                                    );
                                    applyDraftLinesAndRefreshRegions(next);
                                  }}
                                  className={`w-full rounded-lg border bg-transparent px-2 py-1 text-sm truncate focus:border-amber-500 focus:bg-stage-bg focus:outline-none ${
                                    isMusicTag
                                      ? 'border-sky-500/40 bg-sky-500/10 text-sky-200 font-semibold'
                                      : 'border-transparent text-slate-100'
                                  } ${isLivePlayhead ? 'font-semibold text-white' : ''}`}
                                />
                              </div>

                              {/* Right: Row Action Buttons */}
                              <div className="flex items-center gap-1 shrink-0">
                                {isModified && (
                                  <span className="rounded bg-amber-500/20 border border-amber-500/40 px-1 py-0.5 text-[9px] font-bold text-amber-300">
                                    Edited
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startTapFromIndex(idx);
                                  }}
                                  title="Start Live Sync from this line"
                                  className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-amber-500/50 hover:text-amber-300 transition-colors"
                                >
                                  <Crosshair className="h-3 w-3" />
                                  Sync
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlayLine(line.id);
                                  }}
                                  title="Audition this line (P)"
                                  className="flex items-center gap-1 rounded-lg border border-stage-border bg-stage-card px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
                                >
                                  <Play className="h-3 w-3" />
                                  Play
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const start = line.endTime;
                                    const nextL = draftLines[idx + 1];
                                    const end = nextL ? Math.max(start + 1.0, nextL.startTime) : start + 4.0;
                                    const newMusicLine: SyncedLine = {
                                      id: `music-${Date.now().toString(36)}`,
                                      index: idx + 1,
                                      startTime: Number(start.toFixed(2)),
                                      endTime: Number(end.toFixed(2)),
                                      text: '[♪ Instrumental Music]',
                                      confidence: 1.0,
                                    };
                                    const updated = [...draftLines];
                                    updated.splice(idx + 1, 0, newMusicLine);
                                    applyDraftLinesAndRefreshRegions(updated);
                                    setIsEditingUnlocked(true);
                                    isEditingUnlockedRef.current = true;
                                    showToast('Inserted instrumental Music Animation break.', 'success');
                                  }}
                                  title="Insert music break after this line"
                                  className="flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20 transition-colors"
                                >
                                  <Music2 className="h-3 w-3" />
                                  + Music
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = draftLines.filter((l) => l.id !== line.id);
                                    applyDraftLinesAndRefreshRegions(next);
                                  }}
                                  title="Delete line"
                                  className="rounded-lg p-1 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 hover:text-rose-400 transition-all"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {gapAfter >= 1.8 && nextLine && (
                              <div className="flex items-center justify-between bg-sky-500/[0.06] px-3.5 py-1 text-[11px] text-sky-300 w-full min-w-0">
                                <span className="flex items-center gap-1.5 font-medium">
                                  <Music2 className="h-3 w-3" />
                                  Music Interlude ({formatTimeMs(line.endTime)} → {formatTimeMs(nextLine.startTime)} • {gapAfter.toFixed(1)}s)
                                </span>
                                <button
                                  type="button"
                                  disabled={!isEditingUnlocked}
                                  onClick={() => updateLineTiming(line.id, line.startTime, nextLine.startTime)}
                                  className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-35"
                                >
                                  Close Gap
                                </button>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            (!manualSyncVisible || syncLayoutMode === 'stacked') && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-stage-bg select-none">
                {/* Lyric Timeline Hidden Fallback Recovery Card */}
                <div className="rounded-2xl border border-stage-border/80 bg-stage-card/40 p-6 flex flex-col items-center max-w-md">
                  <ListMusic className="h-10 w-10 text-slate-500 mb-3" />
                  <h3 className="text-sm font-bold text-slate-200">Lyric Timeline is Hidden</h3>
                  <p className="text-xs text-slate-400 mt-1 mb-4">
                    The lyrics timeline has been minimized. You can restore it or activate manual sync below.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setLyricsTimelineVisible(true)}
                      className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-black hover:bg-amber-400 shadow-md"
                    >
                      <ListMusic className="h-3.5 w-3.5" />
                      Show Lyric Timeline
                    </button>
                    {!manualSyncVisible && (
                      <button
                        type="button"
                        onClick={() => setManualSyncVisible(true)}
                        className="flex items-center gap-1.5 rounded-xl border border-stage-border bg-stage-card px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white"
                      >
                        <Zap className="h-3.5 w-3.5 text-amber-400" />
                        Show Manual Sync
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          )}

          {/* Right Side Pane: Live 16:9 Output Verification (Resizable & Collapsible) */}
          {previewEnabled && (
            <>
              {/* Horizontal Resizer Handle between Center and Right Panel */}
              <div
                onMouseDown={handleRightPanelResizeStart}
                className="group relative w-1.5 shrink-0 cursor-col-resize bg-stage-border/60 hover:bg-amber-400 transition-colors flex items-center justify-center select-none z-10"
                title="Drag to resize Live Preview"
              >
                <div className="h-8 w-0.5 rounded-full bg-slate-500 group-hover:bg-black transition-colors" />
              </div>

              <aside
                style={{ width: `${rightPanelWidth}px` }}
                className="flex shrink-0 flex-col border-l border-stage-border bg-stage-panel p-4 space-y-4 overflow-y-auto slim-scrollbar"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Live 16:9 Output Verification
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setStudioTab('config')}
                        className="text-[11px] font-medium text-amber-300 hover:underline"
                      >
                        Edit Look
                      </button>
                      <button
                        type="button"
                        onClick={togglePreviewEnabled}
                        className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                        title="Close Live Preview Panel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="aspect-video w-full overflow-hidden rounded-xl border border-stage-border shadow-lg">
                    <SlideRenderer
                      activeLine={liveStageState.isMusicInterlude ? null : livePreviewLine}
                      styleConfig={activeSong.styleConfig ?? DEFAULT_STYLE_CONFIG}
                      isMusicInterlude={liveStageState.isMusicInterlude}
                      isPreview={true}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>
                      Showing:{' '}
                      <strong className="text-slate-200">
                        {liveStageState.isMusicInterlude
                          ? 'Music Animation'
                          : livePreviewLine
                            ? `Line #${liveStageState.activeLineIndex + 1}`
                            : 'Standby'}
                      </strong>
                    </span>
                    <span className="font-mono">{formatTimeMs(wsTime)}</span>
                  </div>
                </div>

                {/* Quick Sync Method Guide */}
                <div className="rounded-2xl border border-stage-border bg-stage-bg p-3.5 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300">
                    <HelpCircle className="h-4 w-4" />
                    Manual Syncing Guide
                  </div>
                  <div className="space-y-1.5 text-slate-300 text-[11px] leading-relaxed">
                    <p>
                      <strong className="text-amber-200">Hold-to-Sing:</strong> Hold Spacebar (or Down Arrow) when the line starts, release when singing ends. Music interludes are created automatically when released!
                    </p>
                    <p>
                      <strong className="text-sky-300">Single Tap:</strong> Tap Space/Down Arrow at each line. Press Right Arrow (→) to end a verse into music.
                    </p>
                    <p>
                      <strong className="text-emerald-300">Aegisub Mouse:</strong> Left-click on waveform to seek, Right-click to set line End. Press Enter to advance!
                    </p>
                    <p>
                      <strong className="text-amber-400">Safe Auditioning:</strong> The timeline defaults to locked so you can scrub safely. Click &quot;Unlocked to Edit&quot; to shift timestamps.
                    </p>
                  </div>
                </div>
              </aside>
            </>
          )}
        </div>
      </div>

      {/* Large Spacious Raw Lyrics Studio Modal */}
      <RawLyricsModal
        open={showRawModal}
        initialLyrics={rawDraft || activeSong.rawLyrics}
        songTitle={activeSong.title}
        songDuration={wsDuration || activeSong.duration}
        onClose={() => setShowRawModal(false)}
        onApply={async (newLyrics) => {
          setRawDraft(newLyrics);
          const dur = wsDuration || activeSong.duration || undefined;
          const reconciled = reconcileSyncedLinesWithRawLyrics(
            draftLinesRef.current,
            newLyrics,
            dur,
          );
          applyDraftLinesAndRefreshRegions(reconciled);
          setIsEditingUnlocked(true);
          isEditingUnlockedRef.current = true;
          showToast(`Applied ${reconciled.length} lyric lines from Raw Lyrics Studio. Review and save when ready.`, 'success');
        }}
      />

      {/* 100% Offline Local Whisper Alignment Modal */}
      {showWhisperModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-emerald-500/40 bg-stage-panel p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Local Whisper AI Alignment
                  </h3>
                  <div className="text-[10px] text-slate-400">
                    Word-level Cross-Attention DTW • 100% Offline
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 font-mono">
                  Zero Cloud Cost
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowWhisperModal(false);
                    if (isWhisperAligning) {
                      showToast('Whisper alignment continuing in background...', 'info');
                    }
                  }}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                  title={isWhisperAligning ? 'Run in background' : 'Close'}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Detects sung words locally in an off-thread Web Worker using quantized Whisper with word-level Cross-Attention DTW timestamps. Matches your exact lyric lines using Needleman-Wunsch Dynamic Programming.
            </p>

            {isWhisperAligning ? (
              <div className="space-y-4 py-4 rounded-xl border border-stage-border bg-stage-bg p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-300 animate-pulse">
                    {whisperProgress?.message || 'Processing audio...'}
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {whisperProgress?.progress ?? 0}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-stage-card border border-stage-border">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${Math.max(5, whisperProgress?.progress ?? 5)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 italic">
                  Running on local CPU via Web Worker — your interface remains completely responsive.
                </p>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleCancelWhisperAlign}
                    className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
                  >
                    Cancel Alignment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowWhisperModal(false);
                      showToast('Whisper alignment running in background. You can continue editing.', 'info');
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
                  >
                    <ArrowDownRight className="h-3.5 w-3.5" />
                    Run in Background
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Audio Language
                  </label>
                  <select
                    value={whisperLanguage}
                    onChange={(e) => setWhisperLanguage(e.target.value)}
                    className="w-full rounded-xl border border-stage-border bg-stage-bg px-3.5 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="auto">Auto-Detect Language (Multilingual)</option>
                    <option value="hindi">Hindi (हिन्दी) — Bhajan / Kirtan</option>
                    <option value="english">English</option>
                    <option value="telugu">Telugu (తెలుగు)</option>
                    <option value="sanskrit">Sanskrit (संस्कृत) — Shlokas / Mantras</option>
                  </select>
                </div>

                <div className="rounded-xl border border-stage-border bg-stage-bg p-3.5 text-xs text-slate-400 space-y-1.5">
                  <div className="font-semibold text-slate-300">
                    Deterministic Multi-Stage Pipeline:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                    <li>16kHz stereo-center vocal extraction & rumble suppression</li>
                    <li>Quantized ONNX Whisper speech recognition with word timestamps</li>
                    <li>Needleman-Wunsch DP alignment (preserves your exact words)</li>
                    <li>Anchor detection with proportional interpolation for slow singing</li>
                  </ul>
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowWhisperModal(false)}
                    className="rounded-xl border border-stage-border px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleStartWhisperAlign}
                    className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-black hover:bg-amber-400 shadow-md transition-all active:scale-[0.98]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Start Offline Whisper Alignment
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Background Alignment Progress Pill */}
      {isWhisperAligning && !showWhisperModal && (
        <div className="fixed top-16 right-6 z-40 flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-[#0e121a]/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
          <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
          <div className="text-xs">
            <div className="font-semibold text-white flex items-center gap-2">
              <span>Auto-Syncing in Background</span>
              <span className="text-amber-400 font-mono font-bold">
                {whisperProgress?.progress ?? 0}%
              </span>
            </div>
            <div className="text-[10px] text-slate-400 max-w-xs truncate">
              {whisperProgress?.message ?? 'Processing audio in background...'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowWhisperModal(true)}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-white/20 transition-colors"
          >
            View
          </button>
          <button
            type="button"
            onClick={handleCancelWhisperAlign}
            title="Cancel Alignment"
            className="rounded-lg p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
