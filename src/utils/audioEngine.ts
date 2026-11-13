import { registerAudioAnalyser } from './audioVisualizerBus';

/**
 * Stage Audio Engine for Window 1 (Master Stage Console).
 * Uses HTML5 <audio> routed through Web Audio GainNode for click-free
 * 700ms pause fade-outs and 300ms play fade-ins over stadium PA systems,
 * plus setSinkId() output device routing for external soundboards / DI boxes.
 */
export class StageAudioEngine {
  private audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private fadeTimer: number | null = null;
  private currentSinkId = '';
  private isFadingOut = false;
  private isDisposed = false;

  public onEnded?: () => void;
  public onLoadedMetadata?: (duration: number) => void;
  public onError?: (err: string) => void;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';

    this.audio.addEventListener('ended', () => {
      if (this.isDisposed) return;
      this.clearFadeTimer();
      this.isFadingOut = false;
      this.onEnded?.();
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (this.isDisposed) return;
      if (Number.isFinite(this.audio.duration)) {
        this.onLoadedMetadata?.(this.audio.duration);
      }
    });

    this.audio.addEventListener('error', () => {
      if (this.isDisposed) return;
      const err = this.audio.error;
      // Code 1 is MEDIA_ERR_ABORTED - triggered when user switches songs or views while loading
      if (err && err.code === 1) {
        return;
      }
      if (!this.audio.src || this.audio.src === window.location.href) {
        return;
      }
      console.warn('StageAudioEngine audio error:', err);
      this.onError?.('Failed to decode or stream audio file.');
    });
  }

  private ensureAudioGraph(): void {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1;
    this.sourceNode = this.ctx.createMediaElementSource(this.audio);
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.7;
    this.sourceNode.connect(this.analyserNode);
    this.analyserNode.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
    registerAudioAnalyser(this.analyserNode);

    if (this.currentSinkId) {
      this.applySinkId(this.currentSinkId).catch(() => {});
    }
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer !== null) {
      window.clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  public async setOutputDevice(sinkId: string): Promise<void> {
    this.currentSinkId = sinkId;
    await this.applySinkId(sinkId);
  }

  private async applySinkId(sinkId: string): Promise<void> {
    const id = sinkId || '';
    const mediaEl = this.audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (typeof mediaEl.setSinkId === 'function') {
      await mediaEl.setSinkId(id);
    }
    if (this.ctx) {
      const ctxAny = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
      if (typeof ctxAny.setSinkId === 'function') {
        await ctxAny.setSinkId(id);
      }
    }
  }

  public loadSource(url: string): void {
    if (this.isDisposed || !url) return;
    this.clearFadeTimer();
    this.isFadingOut = false;
    this.audio.pause();
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
      this.gainNode.gain.setValueAtTime(1, this.ctx.currentTime);
    }
    if (this.audio.src === url) {
      this.audio.currentTime = 0;
      return;
    }
    this.audio.src = url;
    this.audio.currentTime = 0;
    this.audio.load();
  }

  public stopImmediately(): void {
    this.clearFadeTimer();
    this.isFadingOut = false;
    this.audio.pause();
    this.audio.currentTime = 0;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
      this.gainNode.gain.setValueAtTime(1, this.ctx.currentTime);
    }
  }

  /**
   * Smoothly ramps audio gain in over 300ms on Play.
   */
  public async playWithFadeIn(): Promise<void> {
    this.ensureAudioGraph();
    this.clearFadeTimer();
    this.isFadingOut = false;

    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.ctx && this.gainNode) {
      const now = this.ctx.currentTime;
      const startGain = this.audio.paused ? 0.0001 : Math.max(0.0001, this.gainNode.gain.value);
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(startGain, now);
      this.gainNode.gain.linearRampToValueAtTime(1.0, now + 0.3);
    }

    await this.audio.play();
  }

  /**
   * Smoothly ramps audio gain down over 700ms (linearRampToValueAtTime)
   * before pausing so there is zero pop on the stadium PA.
   */
  public pauseWithFadeOut(onPaused?: () => void): void {
    this.ensureAudioGraph();
    this.clearFadeTimer();

    if (this.audio.paused) {
      onPaused?.();
      return;
    }

    this.isFadingOut = true;
    if (this.ctx && this.gainNode) {
      const now = this.ctx.currentTime;
      const currentVal = Math.max(0.0001, this.gainNode.gain.value);
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(currentVal, now);
      this.gainNode.gain.linearRampToValueAtTime(0.0, now + 0.7);
    }

    this.fadeTimer = window.setTimeout(() => {
      this.fadeTimer = null;
      this.isFadingOut = false;
      this.audio.pause();
      if (this.ctx && this.gainNode) {
        this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
        this.gainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
      }
      onPaused?.();
    }, 700);
  }

  public seek(seconds: number): void {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const dur = this.getDuration();
    this.audio.currentTime = dur > 0 ? Math.min(dur, safe) : safe;
  }

  public getCurrentTime(): number {
    return this.audio.currentTime || 0;
  }

  public getDuration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  public isPlayingOrResuming(): boolean {
    return !this.audio.paused && !this.isFadingOut;
  }

  public isPaused(): boolean {
    return this.audio.paused;
  }

  public dispose(): void {
    this.isDisposed = true;
    this.clearFadeTimer();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    registerAudioAnalyser(null);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.gainNode = null;
    this.sourceNode = null;
    this.analyserNode = null;
  }
}

