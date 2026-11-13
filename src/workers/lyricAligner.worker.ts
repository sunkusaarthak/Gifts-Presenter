import { pipeline, env } from '@huggingface/transformers';
import {
  alignLyricsToWhisperWords,
  type DetectedWord,
  normalizePhoneticToken,
} from '../shared/whisperAligner';
import type { SyncedLine } from '../shared/types';

// Optimize transformers for offline browser caching
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface WorkerAlignRequest {
  type: 'ALIGN';
  id: string;
  audioPcm: Float32Array;
  rawLyrics: string;
  totalDuration: number;
  language?: string; // 'auto' | 'hindi' | 'english' | 'telugu' | 'sanskrit'
  modelId?: string;
}

export type WorkerAlignResponse =
  | {
      type: 'PROGRESS';
      id: string;
      stage: 'loading_model' | 'transcribing' | 'aligning';
      progress: number;
      message: string;
    }
  | {
      type: 'SUCCESS';
      id: string;
      syncedLines: SyncedLine[];
      detectedWordCount: number;
    }
  | {
      type: 'ERROR';
      id: string;
      error: string;
    };

// Cached pipeline singleton in the worker thread
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asrPipeline: any = null;
let currentModelId = '';

self.addEventListener('message', async (e: MessageEvent<WorkerAlignRequest>) => {
  const req = e.data;
  if (!req || req.type !== 'ALIGN') return;

  const { id, audioPcm, rawLyrics, totalDuration, language, modelId } = req;
  const targetModel = modelId || 'Xenova/whisper-tiny';

  try {
    // 1. Load lightweight quantized Whisper ASR model off the main UI thread with progress callbacks
    if (!asrPipeline || currentModelId !== targetModel) {
      self.postMessage({
        type: 'PROGRESS',
        id,
        stage: 'loading_model',
        progress: 5,
        message: 'Initializing fast offline Whisper model...',
      } satisfies WorkerAlignResponse);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const progressCallback = (info: any) => {
        if (info.status === 'progress' && info.total) {
          const pct = Math.min(99, Math.round((info.loaded / info.total) * 100));
          self.postMessage({
            type: 'PROGRESS',
            id,
            stage: 'loading_model',
            progress: pct,
            message: `Loading Whisper model weights (${pct}%)...`,
          } satisfies WorkerAlignResponse);
        } else if (info.status === 'ready') {
          self.postMessage({
            type: 'PROGRESS',
            id,
            stage: 'loading_model',
            progress: 100,
            message: 'Offline Whisper model ready.',
          } satisfies WorkerAlignResponse);
        }
      };

      try {
        asrPipeline = await pipeline('automatic-speech-recognition', targetModel, {
          progress_callback: progressCallback,
          dtype: 'q8',
        });
        currentModelId = targetModel;
      } catch {
        // Fallback to onnx-community/whisper-tiny or Xenova/whisper-base
        try {
          asrPipeline = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
            progress_callback: progressCallback,
            dtype: 'q8',
          });
          currentModelId = 'onnx-community/whisper-tiny';
        } catch {
          asrPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
            progress_callback: progressCallback,
          });
          currentModelId = 'Xenova/whisper-base';
        }
      }
    }

    // Resolve effective language: if 'auto', inspect the Unicode script of rawLyrics
    let effectiveLanguage = language;
    if (!effectiveLanguage || effectiveLanguage === 'auto') {
      if (/[\u0900-\u097F]/.test(rawLyrics)) {
        effectiveLanguage = 'hindi';
      } else if (/[\u0C00-\u0C7F]/.test(rawLyrics)) {
        effectiveLanguage = 'telugu';
      } else if (/[\u0B80-\u0BFF]/.test(rawLyrics)) {
        effectiveLanguage = 'tamil';
      } else if (/[\u0980-\u09FF]/.test(rawLyrics)) {
        effectiveLanguage = 'bengali';
      } else if (/[\u0A80-\u0AFF]/.test(rawLyrics)) {
        effectiveLanguage = 'gujarati';
      } else {
        effectiveLanguage = 'english';
      }
    }

    // 2. Run Automatic Speech Recognition with chunk-by-chunk real-time progress
    // Processing in 20-second slices avoids WebAssembly 32-bit memory exhaustion and hallucination loops.
    const sampleRate = 16000;
    const chunkSec = 20;
    const strideSec = 2; // 2s overlap
    const chunkSamples = chunkSec * sampleRate;
    const hopSamples = (chunkSec - strideSec) * sampleRate;
    const totalSamples = audioPcm.length;
    const totalChunks = Math.max(1, Math.ceil(totalSamples / hopSamples));

    const detectedWords: DetectedWord[] = [];

    for (let cIdx = 0; cIdx < totalChunks; cIdx++) {
      const startSample = cIdx * hopSamples;
      const endSample = Math.min(totalSamples, startSample + chunkSamples);
      if (startSample >= totalSamples) break;

      const chunkPcm = audioPcm.subarray(startSample, endSample);
      const chunkOffsetSec = startSample / sampleRate;

      // Compute RMS energy of this chunk to detect music-only/silence sections
      let sumSq = 0;
      for (let i = 0; i < chunkPcm.length; i++) {
        sumSq += chunkPcm[i] * chunkPcm[i];
      }
      const rms = Math.sqrt(sumSq / Math.max(1, chunkPcm.length));

      const pct = Math.min(88, 20 + Math.round(((cIdx + 1) / totalChunks) * 68));

      // Skip only true silence/dead sections to avoid Whisper hallucination loops
      if (rms < 0.003) {
        self.postMessage({
          type: 'PROGRESS',
          id,
          stage: 'transcribing',
          progress: pct,
          message: `Chunk ${cIdx + 1} of ${totalChunks} (Instrumental / Silence - skipped)...`,
        } satisfies WorkerAlignResponse);
        continue;
      }

      self.postMessage({
        type: 'PROGRESS',
        id,
        stage: 'transcribing',
        progress: pct,
        message: `Detecting sung words in chunk ${cIdx + 1} of ${totalChunks} (${Math.round(((cIdx + 1) / totalChunks) * 100)}%)...`,
      } satisfies WorkerAlignResponse);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asrOptions: any = {
        return_timestamps: 'word',
        task: 'transcribe',
        language: effectiveLanguage,
      };

      try {
        const output = await asrPipeline(chunkPcm, asrOptions);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunks: Array<{ text: string; timestamp: [number | null, number | null] }> =
          output?.chunks ?? [];

        for (const chunk of chunks) {
          const text = chunk.text?.trim();
          if (!text) continue;
          // Filter out Whisper hallucination tags like [Music], [Applause], repeated "thank you"
          if (/^\[.*\]$/.test(text) || /^thank you/i.test(text)) continue;

          const [start, end] = chunk.timestamp ?? [null, null];
          if (
            start !== null &&
            end !== null &&
            Number.isFinite(start) &&
            Number.isFinite(end) &&
            end >= start
          ) {
            const absStart = Number((chunkOffsetSec + start).toFixed(2));
            const absEnd = Number((chunkOffsetSec + end).toFixed(2));

            // Deduplicate overlapping words from previous chunk stride
            const lastWord = detectedWords[detectedWords.length - 1];
            if (!lastWord || absStart >= lastWord.start - 0.05) {
              detectedWords.push({
                word: text,
                norm: normalizePhoneticToken(text),
                start: absStart,
                end: Math.max(absStart + 0.1, absEnd),
              });
            }
          }
        }
      } catch (chunkErr) {
        // Log non-fatal chunk error and continue with next chunk
        console.warn(`Chunk ${cIdx} Whisper skipped:`, chunkErr);
      }
    }

    // 4. Run Needleman-Wunsch Dynamic Programming Sequence Alignment
    self.postMessage({
      type: 'PROGRESS',
      id,
      stage: 'aligning',
      progress: 90,
      message: `Aligning ${detectedWords.length} words to lyric lines via Dynamic Programming...`,
    } satisfies WorkerAlignResponse);

    const syncedLines = alignLyricsToWhisperWords(rawLyrics, detectedWords, totalDuration);

    self.postMessage({
      type: 'SUCCESS',
      id,
      syncedLines,
      detectedWordCount: detectedWords.length,
    } satisfies WorkerAlignResponse);
  } catch (err: unknown) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerAlignResponse);
  }
});

