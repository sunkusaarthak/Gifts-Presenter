import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

// 1. Generate 22-second devotional harmonium-style PCM WAV audio
const sampleRate = 44100;
const durationSeconds = 22;
const totalSamples = sampleRate * durationSeconds;
const bytesPerSample = 2; // 16-bit
const dataSize = totalSamples * bytesPerSample;

const wavBuffer = Buffer.alloc(44 + dataSize);

// Write WAV Header
wavBuffer.write('RIFF', 0);
wavBuffer.writeUInt32LE(36 + dataSize, 4);
wavBuffer.write('WAVE', 8);
wavBuffer.write('fmt ', 12);
wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
wavBuffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
wavBuffer.writeUInt16LE(1, 22); // NumChannels (1 mono)
wavBuffer.writeUInt32LE(sampleRate, 24); // SampleRate
wavBuffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // ByteRate
wavBuffer.writeUInt16LE(bytesPerSample, 32); // BlockAlign
wavBuffer.writeUInt16LE(16, 34); // BitsPerSample
wavBuffer.write('data', 36);
wavBuffer.writeUInt32LE(dataSize, 40);

// Generate peaceful harmonium drone with warm harmonics (Sa: 130.81Hz, Pa: 196.0Hz, High Sa: 261.63Hz)
const fSa = 130.81;
const fPa = 196.00;
const fSaHigh = 261.63;
const fGa = 164.81;

for (let i = 0; i < totalSamples; i++) {
  const t = i / sampleRate;

  // Envelope: smooth fade-in (1.5s) and gentle fade-out (2.0s at end)
  let env = 1.0;
  if (t < 1.5) {
    env = t / 1.5;
  } else if (t > durationSeconds - 2.0) {
    env = Math.max(0, (durationSeconds - t) / 2.0);
  }

  // Subtle breathing tremolo (3.8Hz)
  const tremolo = 0.88 + 0.12 * Math.sin(2 * Math.PI * 3.8 * t);

  // Harmonium voice with warm overtone richness
  const sa = Math.sin(2 * Math.PI * fSa * t) * 0.40 +
             Math.sin(2 * Math.PI * fSa * 2 * t) * 0.20 +
             Math.sin(2 * Math.PI * fSa * 3 * t) * 0.10;

  const pa = Math.sin(2 * Math.PI * fPa * t) * 0.28 +
             Math.sin(2 * Math.PI * fPa * 2 * t) * 0.12;

  const ga = Math.sin(2 * Math.PI * fGa * t) * 0.18 +
             Math.sin(2 * Math.PI * fGa * 2 * t) * 0.08;

  const saH = Math.sin(2 * Math.PI * fSaHigh * t) * 0.15 +
              Math.sin(2 * Math.PI * fSaHigh * 2 * t) * 0.06;

  const sampleFloat = (sa + pa + ga + saH) * env * tremolo * 0.75;
  const sampleInt = Math.max(-32768, Math.min(32767, Math.round(sampleFloat * 32767)));

  wavBuffer.writeInt16LE(sampleInt, 44 + i * 2);
}

// 2. Build demo song package manifest
const demoSong = {
  id: 'demo-bhajan-001',
  title: 'Moko Kahan Dhundhe Re Bande - Kabir Bhajan',
  audioPath: 'audio/demo_bhajan.wav',
  duration: durationSeconds,
  rawLyrics: 'मोको कहाँ ढूँढे रे बन्दे, मैं तो तेरे पास में\nना मैं देवल ना मैं मस्जिद, ना काबे कैलास में\nखोजी होय तो तुरते मिलिहौं, एक पल की तालास में\nकहे कबीर सुनो भाई साधो, सब स्वांसों की स्वांस में',
  syncedLines: [
    {
      id: 'demo-line-1',
      index: 0,
      startTime: 3.0,
      endTime: 7.0,
      text: 'मोको कहाँ ढूँढे रे बन्दे, मैं तो तेरे पास में',
    },
    {
      id: 'demo-line-2',
      index: 1,
      startTime: 7.5,
      endTime: 11.5,
      text: 'ना मैं देवल ना मैं मस्जिद, ना काबे कैलास में',
    },
    {
      id: 'demo-line-3',
      index: 2,
      startTime: 12.0,
      endTime: 16.0,
      text: 'खोजी होय तो तुरते मिलिहौं, एक पल की तालास में',
    },
    {
      id: 'demo-line-4',
      index: 3,
      startTime: 16.5,
      endTime: 20.5,
      text: 'कहे कबीर सुनो भाई साधो, सब स्वांसों की स्वांस में',
    },
  ],
  styleConfig: {
    backgroundType: 'gradient',
    backgroundSrc: 'radial-gradient(circle at 50% 35%, #2a1b0e 0%, #130c06 55%, #050302 100%)',
    backdropDim: 0.25,
    fontFamily: 'Georgia, serif',
    fontSizeVw: 4.6,
    fontWeight: '700',
    textColor: '#FFFDF7',
    textShadow: '0 4px 24px rgba(0, 0, 0, 0.95)',
    musicAnimation: 'lotus-pulse',
    musicAnimationScale: 1.0,
    harmonicWavesEnabled: true,
    harmonicWavesPlacement: 'bottom-dock',
  },
  globalOffsetSeconds: 0,
};

// 3. Assemble zip package
const zip = new JSZip();
zip.file('manifest.json', JSON.stringify(demoSong, null, 2));
zip.file('song.json', JSON.stringify(demoSong, null, 2));
zip.file('audio/demo_bhajan.wav', wavBuffer);

const outputDir = path.resolve('demo-project');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const zipPath = path.join(outputDir, 'Gifts-Demo-Bhajan.zip');
fs.writeFileSync(zipPath, zipBuffer);

console.log(`Generated: ${zipPath} (${(zipBuffer.length / 1024).toFixed(1)} KB)`);

