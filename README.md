# Gifts Presenter

Pranam.

**Gifts Presenter** is an offline-first dual-display presentation application built with reverence to simplify the presentation of music and synchronized lyrics.

A tremendous amount of care and effort goes into preparing and presenting music—synchronizing verses, formatting slides, and operating live displays. Gifts Presenter brings this entire process together into one calm, unified workspace:

1. **Import & Prepare Once**: Import your audio tracks, paste the verses, and synchronize the lyrics with an interactive waveform. All audio, timings, and visual styling are saved permanently into a single project file.
2. **Present Seamlessly**: Connect to any external projector, TV, or stage display. The application automatically detects the external screen, delivers borderless, cursor-free projection to the audience, and provides gentle, responsive controls on your computer.
3. **Completely Offline**: Operates 100% offline with zero external dependencies, ensuring reliable, uninterrupted presentations in halls, gatherings, or retreats.
4. **Customizable**: Every aspect of typography, background dimming, and serene instrumental visuals can be tailored for optimal clarity and contemplation.

---

## 1. Download & Installation

Pre-compiled installers for Windows and macOS are available on the [Releases](../../releases/latest) page.

| Operating System | Package | Architecture | Setup Notes |
| :--- | :--- | :--- | :--- |
| **Windows** | [`Gifts-Presenter-Setup-1.0.0.exe`](../../releases/latest) | Windows 10 / 11 (64-bit NSIS Installer) | Run the setup file. If Windows SmartScreen appears, click **More info** and select **Run anyway**. |
| **macOS (Apple Silicon)** | [`Gifts-Presenter-1.0.0-arm64.dmg`](../../releases/latest) / [`.zip`](../../releases/latest) | Apple Silicon (M1 / M2 / M3 / M4) | Open the DMG and drag **Gifts Presenter.app** into Applications. On first launch, right-click and choose **Open**. |
| **macOS (Intel)** | [`Gifts-Presenter-1.0.0-x64.dmg`](../../releases/latest) / [`.zip`](../../releases/latest) | Intel (x64) | Open the DMG and drag **Gifts Presenter.app** into Applications. On first launch, right-click and choose **Open**. |

---

## 2. Quick Start: Loading the Included Demo Project

To explore the application immediately without manual setup:

1. Locate the pre-bundled demo package at `demo-project/Gifts-Demo-Bhajan.zip` (also available directly in the application).
2. Open Gifts Presenter.
3. In the left **Library** panel, click **Load Demo** (or click **Project > Import Project (.gifts.zip)** and select `demo-project/Gifts-Demo-Bhajan.zip`).
4. Two devotional bhajans (*गोविंद* with 50 synchronized verses and *धागा* with 36 synchronized verses) will load with pre-synchronized timings, serene stage styling, and sacred animations.
5. In the top navigation bar, click **Stage Console**, then click **Start Presentation** to test fullscreen projection.

---

## 3. Workflow & Key Capabilities

### Step A: Importing Audio and Lyrics
1. In the left sidebar, click **Add Song / Bhajan**.
2. Enter the title and singer or composer.
3. Select your audio file (`.mp3`, `.wav`, `.flac`, or `.m4a`).
4. Paste the verses into the editor. For clean readability across large halls, format text into **1 to 2 lines per slide**. Blank lines automatically separate verses.
5. Click **Create Song** to open the Sync Studio.

### Step B: Synchronizing Lyrics (One-Time Setup)
1. In the top bar, switch to **Sync Studio**.
2. Press **Spacebar** to start audio playback.
3. As each verse or line begins in the singing, tap **Enter** (or click **Sync Next Line**). Timing is recorded with millisecond precision.
4. To fine-tune:
   - Click and drag the edges of any verse region on the interactive waveform.
   - Use the **-0.1s** and **+0.1s** nudge buttons for micro-adjustments.
   - Press **Ctrl + Z** (or **Cmd + Z** on macOS) at any time to undo the previous mark.
5. Click **Save Changes** in the top right. Once synchronized, timings are permanently saved and reusable for all future presentations.

### Step C: Styling & Stage Atmosphere
1. Open the **Style & Stage Configuration** panel in the top right.
2. **Backdrop & Contrast**:
   - Choose peaceful dark gradients, still textures, or ambient stage backgrounds.
   - Adjust the **Backdrop Dimming Slider** (0% to 85%) to ensure high text contrast under bright stage lighting.
3. **Typography**:
   - Select from clean serif, sans, or Devanagari typefaces.
   - Scale font size using the slider or **A-** / **A+** buttons to suit venue dimensions.
   - Choose font weight from Regular (400) to Bold (700).
4. **Instrumental Passages**:
   - During music-only sections between sung verses, choose between a breathing **Sacred Lotus** mandala, **Harmonic Waves** audio spectrum, **Radiant Diya Orb**, or a quiet **Backdrop Only**.

### Step D: Live Stage Presentation
1. Connect your computer to an external projector, TV, or stage display via HDMI, DisplayPort, or USB-C.
2. In Gifts Presenter, switch to **Stage Console**.
3. Click **Start Presentation** (or press **F5**):
   - **Dual Displays**: A borderless, clean fullscreen presentation window automatically opens on the audience screen with the mouse cursor hidden.
   - **Single Display**: A floating 16:9 preview window appears so you can rehearse without an external monitor.
4. **Live Controls During Sessions**:
   - **Smooth Pause (Spacebar)**: When pausing to speak between verses, audio fades out smoothly over 700 milliseconds while the active lyric remains visible on screen, allowing the audience to reflect upon the words without an abrupt silence.
   - **Replay Active Verse (R)**: Instantly re-cues playback to the start of the current verse if a line is re-sung or spoken about.
   - **Direct Verse Jump**: Click any verse in the teleprompter list to jump audio and presentation directly to that stanza.
   - **Screen Blackout (B)**: Instantly fades the audience screen to black; press **B** again to restore.

---

## 4. Keyboard Shortcuts Reference

### Stage Console (Live Presentation)

| Key | Action | Description |
| :--- | :--- | :--- |
| **Spacebar** | Play / Pause | Starts audio or fades smoothly over 700ms while holding the active lyric slide on screen. |
| **R** | Replay Active Verse | Jumps audio back to the beginning of the currently displayed verse. |
| **Down Arrow** / **PageDown** | Next Verse | Advances immediately to the next verse slide. |
| **Up Arrow** / **PageUp** | Previous Verse | Returns immediately to the previous verse slide. |
| **B** | Blank Display | Toggles screen blackout on the audience display. |
| **M** | Music Interlude | Manually toggles the instrumental visualizer. |
| **F5** | Start / Stop Output | Toggles borderless presentation output on the external display. |
| **Ctrl + B** / **Cmd + B** | Toggle Sidebar | Expands or collapses the left library sidebar. |
| **Escape** | Close Output Window | Exits presentation output safely. |

### Sync Studio (Lyric Alignment)

| Key | Action | Description |
| :--- | :--- | :--- |
| **Spacebar** | Play / Pause Audio | Starts or pauses waveform playback. |
| **Enter** | Sync Next Line | Records the current playback timestamp for the next verse line. |
| **Left Arrow** / **Right Arrow** | Seek Audio | Jumps backward or forward by 2 seconds along the waveform. |
| **Ctrl + Z** / **Cmd + Z** | Undo Sync | Reverts the last synchronized lyric timestamp. |
| **Ctrl + S** / **Cmd + S** | Save Song | Commits all timings and visual settings permanently to disk. |
| **+** / **-** | Waveform Zoom | Zooms in or out horizontally on the waveform. |

---

## 5. Project Portability & Backup

- **Save Project (.gifts.zip)**: Click **Project > Save Project (.gifts.zip)** in the top navigation bar to archive all audio tracks, lyrics, timings, and styling presets into a single file for USB backup or transfer to another computer.
- **Import Project**: Click **Project > Import Project (.gifts.zip)** or drag any `.gifts.zip` package directly into Gifts Presenter to restore the full project.
- **Safety Protection**: If unsaved lyric timings or settings exist when attempting to close, Gifts Presenter will prompt to save, ensuring no preparation work is lost.
