# Contributing to Gifts Presenter

Pranam and welcome. Thank you for offering your seva to the development and maintenance of **Gifts Presenter**. This project is dedicated to providing reliable, offline-first presentation software for Pujya Master and the Satsang Production Seva team.

To ensure consistency, stage stability, and dignified user experience, all contributors must adhere to the architectural guidelines outlined below.

---

## 1. Tech Stack

- **Desktop Framework**: Electron v33 with dual-window IPC architecture:
  - *Window 1 (Stage Console)*: Master control desk, audio player singleton, sync studio, and live prompter.
  - *Window 2 (Audience Output)*: Borderless, cursor-hidden, hardware-accelerated presentation window running on external HDMI/SDI output or floating 16:9 fallback.
- **Frontend Core**: React 18 with TypeScript in strict mode.
- **Bundler & Build Tooling**: Vite 5 with `@vitejs/plugin-react` and `esbuild` for Electron main/preload processes.
- **Styling**: Tailwind CSS with custom stage dark theme tokens.
- **Icons**: `lucide-react` SVG icons strictly. **Zero emojis are permitted anywhere in the user interface, modals, or documentation.**
- **State Management**: Zustand with persistent storage and IPC synchronization.
- **Audio & Signal Processing**: Web Audio API (`AudioContext`, `GainNode`, `AnalyserNode`) for smooth fading, latency calibration, and audio spectrum analysis.
- **Waveform Rendering**: `wavesurfer.js` v7 with Regions and Timeline plugins.
- **Speech & Alignment Models**: `@huggingface/transformers` for offline vocal onset analysis.

---

## 2. Local Development Setup

### Prerequisites
- **Node.js**: Version 20.0.0 or higher (LTS recommended).
- **Package Manager**: `npm` (included with Node.js).
- **Git**: For version control.

### Setup Instructions
1. Clone the repository and navigate into the project root:
   ```bash
   git clone https://github.com/your-org/lyrics-share.git
   cd lyrics-share
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application in development mode:
   ```bash
   npm run dev
   ```
4. **Single-Monitor Testing**: If developing on a laptop or single monitor without an external display connected, click **Start Presentation** in the top navigation bar. The application automatically spawns an aspect-ratio-locked floating 16:9 preview window so you can test audience output and stage controls simultaneously.

### Verification Commands
Before submitting any code changes, always run the full verification suite:
```bash
# Type-check both React and Electron TypeScript configurations
npm run typecheck

# Run unit and integration tests
npm test

# Build production bundles
npm run build
```

---

## 3. Architectural Guardrails (LOOK -> VERIFY -> EDIT)

Contributors must follow the disciplined **LOOK -> VERIFY -> EDIT** approach: inspect existing patterns and test suites first, verify assumptions before touching code, and avoid editing working features without confirmation.

### Guardrail 1: Zero-Emoji Policy
Never introduce Unicode emoji characters into code, labels, tooltips, buttons, logs, or documentation. Use clean, professional `lucide-react` SVG icons exclusively.

### Guardrail 2: Backward-Compatible Song Storage Schema
Songs, presets, and settings are stored locally on disk (`app.getPath('userData')/satsang-presenter`). Any modifications to the `SongPackage`, `LyricLine`, or `SongDisplaySettings` interfaces must retain complete backward compatibility with older files. Always provide default fallbacks for optional or newly added fields.

### Guardrail 3: Audio Singleton Strictly in Window 1 (Stage Console)
To eliminate audio drift, dual-playback echo, and hardware contention, the Web Audio engine and HTML audio elements reside strictly in Window 1 (`StageConsole` / `audioEngine.ts`). Window 2 (`OutputWindow`) is purely a visual receiver that renders slides, animations, and typography based on lightweight IPC state broadcasts. Never instantiate audio contexts inside Window 2.

### Guardrail 4: Hold-Lyric-on-Pause with 700ms Smooth Audio Fade-Out
When Pujya Master begins speaking during a bhajan, the operator pauses playback. The audio engine applies an exponential 700ms gain fade-out to prevent abrupt loudspeaker pops. Simultaneously, the audience display must **freeze and hold the active lyric slide in place** rather than clearing or jumping back to an instrumental screen. This allows the audience to contemplate the verse during the discourse.

### Guardrail 5: Minimalist Dancing Pill-Bar Indicator During Instrumental Gaps
During instrumental-only sections (`isPlaying && !activeLyricLine`), when lyrics are not yet active or during interludes, the audience screen renders the selected background and sacred animation or minimalist dancing indicator without obstructing the hall view. When playback pauses during an instrumental passage, the animation smoothly pauses at its current state.

### Guardrail 6: Safe WaveSurfer.js Unmount Lifecycle
`wavesurfer.js` manipulates the DOM directly. Always mount WaveSurfer inside an inner child `<div>` container rather than directly on a top-level React ref. Always wrap the cleanup call in `try / catch`:
```typescript
useEffect(() => {
  if (!containerRef.current) return;
  const ws = WaveSurfer.create({
    container: containerRef.current,
    // ...
  });
  return () => {
    try {
      ws.destroy();
    } catch {
      // Suppress unmount teardown race conditions
    }
  };
}, [audioUrl]);
```

---

## 4. Building & Publishing Installers to GitHub Releases

Packaging is handled by `electron-builder`.

### Building Installers Locally

- **Windows Installer (NSIS)**:
  ```bash
  npm run build:win
  ```
  Produces `release/Gifts-Presenter-Setup-<version>.exe` (or `dist/Gifts-Presenter-Setup-<version>.exe`). Includes the custom installer directory picker and optional desktop / start-menu shortcut toggles.

- **macOS Packages (ZIP & DMG)**:
  - **Local Build (Windows / Linux via `@electron/get`)**:
    ```bash
    node scripts/package-mac.mjs
    ```
    Produces `release/Gifts-Presenter-1.0.0-mac-arm64.zip` (Apple Silicon M1/M2/M3/M4) and `release/Gifts-Presenter-1.0.0-mac-x64.zip` (Intel), containing the full `Gifts Presenter.app` application bundle.
  - **Native macOS / GitHub Actions (DMG & ZIP)**:
    ```bash
    npm run dist:mac
    ```
    Produces `release/Gifts-Presenter-1.0.0.dmg` and `release/Gifts-Presenter-1.0.0-mac.zip`. (Must be run on macOS or via the included `.github/workflows/release.yml` GitHub Actions runner).

### Publishing to GitHub Releases

#### Method A: Direct Upload via GitHub CLI or Web Interface
Use the GitHub CLI (`gh`) to create a tagged release and attach the distribution artifacts and sample demo project:

```bash
# 1. Ensure all tests and builds pass cleanly
npm run typecheck
npm test
npm run build:win
node scripts/package-mac.mjs

# 2. Tag and create the GitHub Release
gh release create v1.0.0 \
  release/Gifts-Presenter-Setup-1.0.0.exe \
  release/Gifts-Presenter-1.0.0-mac-arm64.zip \
  release/Gifts-Presenter-1.0.0-mac-x64.zip \
  demo-project/Gifts-Demo-Bhajan.zip \
  --title "Gifts Presenter v1.0.0" \
  --notes "Initial broadcast release for Pujya Master and the Satsang Production Seva team. Includes Windows NSIS installer, macOS standalone application packages (Apple Silicon & Intel), and pre-synced devotional bhajan package."
```

If you do not have the GitHub CLI installed, you can upload `release/Gifts-Presenter-Setup-1.0.0.exe`, `release/Gifts-Presenter-1.0.0-mac-arm64.zip`, `release/Gifts-Presenter-1.0.0-mac-x64.zip`, and `demo-project/Gifts-Demo-Bhajan.zip` directly through the GitHub web interface under **Releases -> Draft a new release**.

#### Method B: Automated Multi-Platform Build via GitHub Actions
Pushing a git release tag (e.g., `v1.0.0`) triggers `.github/workflows/release.yml`. GitHub automatically provisions a macOS runner to build native `.dmg` installers alongside Windows `.exe` installers, automatically attaching both to the GitHub Release.

