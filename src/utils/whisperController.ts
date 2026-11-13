import { extract16kSpeechPcm } from './audioPreprocessor';
import type { SyncedLine } from '../shared/types';
import type { WorkerAlignRequest, WorkerAlignResponse } from '../workers/lyricAligner.worker';

export interface WhisperProgressEvent {
  stage: 'extracting_audio' | 'loading_model' | 'transcribing' | 'aligning';
  progress: number;
  message: string;
}

export interface WhisperAlignOptions {
  audioRelativePath: string;
  rawLyrics: string;
  totalDuration: number;
  language?: string;
  modelId?: string;
  onProgress?: (event: WhisperProgressEvent) => void;
  signal?: AbortSignal;
}

export interface WhisperAlignResult {
  syncedLines: SyncedLine[];
  detectedWordCount: number;
  highConfidenceCount: number;
}

/**
 * Runs 100% offline Whisper transcription & DP sequence alignment in a Web Worker:
 * 1. Preprocesses audio to 16kHz center vocal channel on main thread with Web Audio.
 * 2. Transfers PCM to dedicated Web Worker so UI remains 60fps responsive.
 * 3. Reports live progress events.
 * 4. Resolves with strictly monotonic, confidence-scored SyncedLine[].
 */
export async function runWhisperAlignment(
  options: WhisperAlignOptions,
): Promise<WhisperAlignResult> {
  const {
    audioRelativePath,
    rawLyrics,
    totalDuration,
    language = 'auto',
    modelId,
    onProgress,
    signal,
  } = options;

  if (signal?.aborted) {
    throw new Error('Alignment cancelled.');
  }

  // 1. Audio Pre-Processing (Center Vocal Isolation + 16kHz Resampling)
  onProgress?.({
    stage: 'extracting_audio',
    progress: 5,
    message: 'Extracting stereo-center vocals & resampling to 16,000 Hz...',
  });

  const { pcm, duration } = await extract16kSpeechPcm(audioRelativePath);

  if (signal?.aborted) {
    throw new Error('Alignment cancelled.');
  }

  // 2. Launch Web Worker
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;

    try {
      worker = new Worker(
        new URL('../workers/lyricAligner.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch (workerErr) {
      reject(new Error(`Failed to initialize Whisper Worker: ${(workerErr as Error).message}`));
      return;
    }

    const cleanup = () => {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('Alignment cancelled by user.'));
    };

    signal?.addEventListener('abort', onAbort);

    const reqId = `align-${Date.now()}`;

    worker.onmessage = (e: MessageEvent<WorkerAlignResponse>) => {
      const res = e.data;
      if (!res || res.id !== reqId) return;

      if (res.type === 'PROGRESS') {
        onProgress?.({
          stage: res.stage,
          progress: res.progress,
          message: res.message,
        });
      } else if (res.type === 'SUCCESS') {
        const highConfidenceCount = res.syncedLines.filter(
          (l) => (l.confidence ?? 0) >= 0.5,
        ).length;
        cleanup();
        resolve({
          syncedLines: res.syncedLines,
          detectedWordCount: res.detectedWordCount,
          highConfidenceCount,
        });
      } else if (res.type === 'ERROR') {
        cleanup();
        reject(new Error(res.error));
      }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(new Error(`Whisper Worker error: ${err.message}`));
    };

    // 3. Post PCM to Worker
    const req: WorkerAlignRequest = {
      type: 'ALIGN',
      id: reqId,
      audioPcm: pcm,
      rawLyrics,
      totalDuration: totalDuration > 0 ? totalDuration : duration,
      language,
      modelId,
    };

    worker.postMessage(req, [pcm.buffer]);
  });
}

