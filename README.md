# Gifts Presenter

Pranam and welcome. **Gifts Presenter** is a dedicated, offline-first dual-display presentation system engineered specifically for Pujya Master and the Satsang Production Seva team. It delivers seamless, broadcast-grade synchronized lyric, bhajan, and sloka projection with 100% offline reliability.

Gifts Presenter operates independently of an internet connection once installed, ensuring stable, jitter-free performance during live Satsang programs, retreats, and stadium gatherings.

---

## 1. Download & Installation

Pre-built binaries for Windows and macOS are available on the release page.

| Operating System | Installer File | Architecture | First-Launch Security Note |
| :--- | :--- | :--- | :--- |
| **Windows** | [`Gifts-Presenter-Setup-1.0.0.exe`](../../releases/latest) | Windows 10 / 11 (64-bit NSIS Installer) | If Windows Defender SmartScreen displays an alert, click **More info** and then select **Run anyway**. |
| **macOS (Apple Silicon)** | [`Gifts-Presenter-1.0.0-mac-arm64.zip`](../../releases/latest) | macOS Apple Silicon (M1/M2/M3/M4) | Unzip `Gifts Presenter.app` to `/Applications`. On first launch, right-click -> **Open** to confirm Gatekeeper. |
| **macOS (Intel)** | [`Gifts-Presenter-1.0.0-mac-x64.zip`](../../releases/latest) | macOS Intel (x64) | Unzip `Gifts Presenter.app` to `/Applications`. On first launch, right-click -> **Open** to confirm Gatekeeper. |

---

## 2. Quick Start: Importing the Demo Project

To verify your installation and test projector routing immediately without manual setup:

1. Locate the pre-bundled demo package at `demo-project/Gifts-Demo-Bhajan.zip` (also downloadable directly from the repository).
2. Launch Gifts Presenter.
3. In the left **Gifts Library** panel, click **Load Demo** (with the download icon) or click **Project > Import Project (.gifts.zip)** and select `demo-project/Gifts-Demo-Bhajan.zip`.
4. The devotional bhajans (*गोविंद* with 50 synchronized verses and *धागा* with 36 synchronized verses) will load with pre-synchronized timestamps, serene stage styling, and breathing Sacred Lotus mandala animations during instrumental passages.
5. In the top navigation bar, click **Stage Console**, then click **Start Presentation** to test fullscreen projection.

---

## 3. Complete Workflow Guide

### Step A: Importing a Song and Lyrics
1. In the left sidebar, click **Add Song / Bhajan**.
2. Enter the Bhajan title and artist or composer name.
3. Select an audio file (`.mp3`, `.wav`, `.flac`, or `.m4a`).
4. In the **Raw Lyrics** editor, paste your verses.
   - For maximum readability on stadium projectors, format text into **1 to 2 lines per slide**.
   - Blank lines automatically create separate verse slides.
5. Click **Create Song** to proceed to the Sync Studio.

### Step B: Manual Lyric Syncing
1. Select your song in the library and switch to the **Sync Studio** tab in the top navigation bar.
2. Press **Spacebar** to start audio playback.
3. The moment each verse or line begins in the audio, press **Enter** (or click the **Sync Next Line** button). The timing will be recorded accurately.
4. If a word begins slightly earlier or later:
   - Click and drag the edges of any verse region directly on the interactive waveform.
   - Use the **-0.1s** and **+0.1s** nudge buttons for micro-second alignment.
5. Press **Ctrl + Z** (or **Cmd + Z** on macOS) at any time to undo the previous sync mark.
6. When timing is aligned, click **Save Changes** in the top right corner.

### Step C: Customizing Background and Typography
1. Open the **Style & Stage Configuration** panel in the top right.
2. **Backdrop & Atmosphere**:
   - Choose from curated peaceful gradients, serene still images, or loopable ambient textures.
   - Adjust the **Backdrop Dimming Slider** (0% to 85%) to ensure clear contrast under bright stage lights.
3. **Typography**:
   - Select font styles (Georgia Serif, Crisp Sans, Clean Devanagari, or Palatino).
   - Adjust the **Lyrics Scale** slider or use the **A-** / **A+** buttons to calibrate text size according to hall dimensions.
   - Adjust font weight from Regular (400) to Bold (700).
4. **Instrumental Passages**:
   - Select the music animation theme: **Sacred Lotus** (default breathing mandala), **Harmonic Waves** (dynamic audio spectrum), **Radiant Diya Orb**, or **Backdrop Only**.
   - Set the size multiplier to match your venue's projection scale.

### Step D: Presenting Live in the Satsang (Stage Console)
1. Connect your computer to the external projector, LED wall, or confidence monitor via HDMI, DisplayPort, or SDI.
2. In Gifts Presenter, switch to **Stage Console** mode.
3. Click **Start Presentation** (or press **F5**):
   - **Dual-Display Setup**: A borderless, clean fullscreen presentation window automatically opens on the external display with the mouse cursor hidden.
   - **Single-Display Setup**: A floating 16:9 preview window appears for live monitoring.
4. **Playback & Discourse Controls for Pujya Master**:
   - **Play / Pause (Spacebar)**: When pausing during Pujya Master's discourse, the audio fades smoothly over 700 milliseconds while the active lyric remains visible on screen so devotees can reflect upon the words.
   - **Replay Verse (R)**: Instantly returns to the beginning of the active verse if Pujya Master re-sings or explains the line.
   - **Direct Verse Jump**: Click any verse line in the teleprompter list to jump audio and display directly to that stanza.
   - **Emergency Blank Screen (B)**: Instantly fades the audience screen to serene black; press **B** again to restore.
   - **Instrumental Music Indicator**: During interludes without sung lyrics, the selected sacred animation or minimal dancing bar indicator renders smoothly without obstructing the audience view.

---

## 4. Keyboard Shortcuts Reference

### Stage Console (Live Presentation)

| Key | Action | Description |
| :--- | :--- | :--- |
| **Spacebar** | Play / Pause | Starts playback or initiates 700ms smooth audio fade while holding the active lyric on screen. |
| **R** | Replay Active Verse | Jumps audio back to the start of the currently displayed verse. |
| **Down Arrow** / **PageDown** | Next Verse | Advances immediately to the next lyric slide. |
| **Up Arrow** / **PageUp** | Previous Verse | Returns immediately to the previous lyric slide. |
| **B** | Blank Display | Toggles blackout on the audience screen. |
| **M** | Music Interlude | Manually toggles the instrumental interlude visualizer. |
| **F5** | Start / Stop Output | Toggles borderless presentation output on the secondary display. |
| **Ctrl + B** / **Cmd + B** | Toggle Sidebar | Expands or collapses the left Song Library sidebar. |
| **Escape** | Close Output Window | Exits presentation output safely. |

### Sync Studio (Preparation & Timing)

| Key | Action | Description |
| :--- | :--- | :--- |
| **Spacebar** | Play / Pause Audio | Plays or pauses the waveform audio player. |
| **Enter** | Sync Next Line | Records current playback timestamp as the start of the next pending lyric line. |
| **Left Arrow** / **Right Arrow** | Seek Audio | Jumps backward or forward by 2 seconds along the waveform. |
| **Ctrl + Z** / **Cmd + Z** | Undo Sync | Reverts the last synchronized lyric timestamp. |
| **Ctrl + S** / **Cmd + S** | Save Song | Commits all synchronized lines and visual presets permanently to disk. |
| **+** / **-** | Waveform Zoom | Zooms in or out horizontally on the audio waveform. |

---

## 5. Offline Project Backups & Portability

- **Exporting Full Backup**: Click **Project** in the top navigation bar and select **Export Full Project Backup (.gifts.zip)** to archive all audio tracks, lyrics, timings, and styling presets into a single file for USB transfers.
- **Importing on Another Computer**: Click **Project** -> **Import Project** or drag any `.gifts.zip` / `.satsang.zip` file directly into Gifts Presenter.
- **Safety Prompt on Exit**: If you have unsaved lyric timing or style modifications, Gifts Presenter will prompt you to save all changes before closing the window, preventing accidental loss of seva work.
