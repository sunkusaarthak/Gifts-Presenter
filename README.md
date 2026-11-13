# Satsang Lyric Presenter

A 100% deterministic, offline-first cross-platform desktop application (macOS & Windows) built with **Electron**, **Vite**, **React 18**, **TypeScript**, **Tailwind CSS**, **Zustand**, and **WaveSurfer.js v7** for live Satsang music and synced-lyric presentations.

Uses **zero Generative AI** — relying strictly on deterministic acoustic signal processing, visual waveform region editing, standard `.lrc` timecodes, and $O(\log N)$ binary search timestamp lookup.

## Development & Packaging

```bash
# Install dependencies
npm install

# Run in development mode (Vite + Electron)
npm run dev

# Type-check & run deterministic unit tests
npm run typecheck
npm test

# Build production bundles
npm run build

# Package installers (run on target OS)
npm run dist:mac
npm run dist:win
```

## Architecture Overview

- **Main & Preload (`electron/main.ts`, `electron/preload.ts`)**:
  - Automatic external HDMI/SDI/projector detection via `screen` (`getAllDisplays`, `display-added`, `display-removed`).
  - **Window 1 (Master Stage Console)** on primary display + **Window 2 (Audience Output Screen)** frameless, fullscreen, `alwaysOnTop` (`screen-saver`), cursor-hidden on external display (or floating 16:9 preview fallback on single-monitor setups).
  - `powerSaveBlocker.start('prevent-display-sleep')` and custom `satsang-media://` protocol with HTTP `Range` byte-streaming.
  - Offline song packages stored in `app.getPath('userData')/satsang-presenter` with portable `.satsang.zip` USB bundle export/import and standard `.lrc` import/export.
- **Module 1 — Sync Studio (`src/components/SyncStudio.tsx`)**:
  - `WaveSurfer` v7 + `RegionsPlugin` + `TimelinePlugin` with toggleable 300Hz–3400Hz vocal-bandpass waveform analysis, drag & magnetic snap, `-50ms`/`+50ms` & `@Start` precision controls, and `region.play(true)` single-line audition.
  - **Gemini Precision Sync + 300–3400Hz Onset Snap**: Optional preparation-time audio alignment using your Gemini API key (`gemini-3.8-flash` / `gemini-3.8-pro`) combined with deterministic 5ms-hop DSP vocal-onset snapping; saves standard offline timecodes so live stage playback remains 100% offline.
  - **Offline Vocal-Onset Dynamic Programming Aligner** (`src/shared/aligner.ts` & `src/utils/waveformAnalysis.ts`).
  - **Forced Alignment Mode A** (ElevenLabs Forced Alignment API or local `whisper.cpp` / `mms_fa` CLI hook).
  - **High-Speed Tap-to-Sync (`Spacebar`)** at `1.0x`, `1.25x`, or `1.5x`.
- **Module 2 — Stage Presenter Console (`src/components/StagePresenter.tsx`) & Audience Output (`src/components/OutputWindow.tsx`)**:
  - 60fps `requestAnimationFrame` + $O(\log N)$ binary search (`src/shared/binarySearch.ts`), emitting IPC updates only when active slide or style changes.
  - Web Audio `GainNode` 700ms smooth PA fade-out before pausing (holding active lyric visible) and 300ms fade-in on play, with `setSinkId` external soundboard routing.
  - Double-buffered 800ms background crossfade (gradients, images, looping muted videos), 0–85% backdrop dimming, custom `.ttf`/`.otf` `FontFace` loading, 400ms slide transitions, and **Instrumental Music Interlude Animations** (`Sacred Lotus`, `Harmonic Waves`, `Radiant Diya Orb`) during intros, interludes, outros, or manual `M` toggle.

