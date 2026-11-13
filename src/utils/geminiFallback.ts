import { splitRawLyrics } from '../shared/lrc';
import {
  normalizeGeminiModel,
  type GeminiAlignedLine,
  type GeminiAlignModel,
} from '../shared/types';

function guessAudioMimeType(audioPath: string): string {
  const lower = audioPath.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'audio/mpeg';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Renderer fallback if Electron main/preload hasn't been restarted after an update.
 */
export async function runGeminiAudioAlignmentFallback(params: {
  audioRelativePath: string;
  rawLyrics: string;
  durationSec: number;
  apiKey: string;
  model: GeminiAlignModel;
}): Promise<GeminiAlignedLine[]> {
  const apiKey = params.apiKey.trim();
  const lines = splitRawLyrics(params.rawLyrics);
  const audioBuffer = await window.satsangAPI.readAudioBuffer(params.audioRelativePath);
  const mimeType = guessAudioMimeType(params.audioRelativePath);
  const model = normalizeGeminiModel(params.model);

  const numberedLyrics = lines.map((line, i) => `[${i}] ${line}`).join('\n');
  const durationInfo =
    params.durationSec > 0 ? `Total audio duration is ${params.durationSec.toFixed(2)} seconds.` : '';

  const promptText = [
    'You are a precision audio-to-lyric timecode aligner for live Satsang music presentations.',
    durationInfo,
    `There are ${lines.length} lyric lines numbered [0] through [${lines.length - 1}].`,
    'Listen carefully to the vocal singing/chanting in the audio from start to finish.',
    `For EVERY line index from 0 to ${lines.length - 1}:`,
    '- startSec: exact timestamp in decimal seconds (e.g. 14.32) when the vocalist begins singing the first syllable of that line.',
    '- endSec: exact timestamp in decimal seconds when the vocalist finishes singing the last syllable of that line.',
    'Ignore instrumental intros, solo alaaps without lyrics, and harmonium/tabla interludes between verses.',
    'Ensure timestamps are strictly chronological (startSec[i] <= endSec[i], and startSec[i+1] >= startSec[i]).',
    `Return every index 0..${lines.length - 1} in the JSON alignments array.`,
    '',
    'LYRICS:',
    numberedLyrics,
  ].join('\n');

  if (audioBuffer.byteLength > 12 * 1024 * 1024) {
    throw new Error(
      'Audio file is >12MB. Please stop and restart "npm run dev" once so Electron loads the updated Files API preload.',
    );
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: arrayBufferToBase64(audioBuffer),
                },
              },
              { text: promptText },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              alignments: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    index: { type: 'INTEGER' },
                    startSec: { type: 'NUMBER' },
                    endSec: { type: 'NUMBER' },
                  },
                  required: ['index', 'startSec', 'endSec'],
                },
              },
            },
            required: ['alignments'],
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini API returned empty alignment response.');
  }
  const parsed = JSON.parse(rawText) as { alignments?: GeminiAlignedLine[] };
  if (!Array.isArray(parsed.alignments) || parsed.alignments.length === 0) {
    throw new Error('Gemini API returned no alignment entries.');
  }
  return parsed.alignments;
}

