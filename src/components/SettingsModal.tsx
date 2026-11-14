import React, { useEffect, useState } from 'react';
import { Monitor, RefreshCw, ShieldCheck, Volume2, X } from 'lucide-react';
import { usePresenterStore } from '../store/usePresenterStore';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const settings = usePresenterStore((s) => s.settings);
  const displays = usePresenterStore((s) => s.displays);
  const saveSettings = usePresenterStore((s) => s.saveSettings);
  const showToast = usePresenterStore((s) => s.showToast);

  const [audioSinkId, setAudioSinkId] = useState(settings.audioSinkId);
  const [preferredDisplayId, setPreferredDisplayId] = useState<number | null>(
    settings.preferredDisplayId,
  );
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [isRefreshingDisplays, setIsRefreshingDisplays] = useState(false);
  const [osGuideTab, setOsGuideTab] = useState<'auto' | 'mac' | 'windows'>('auto');
  const [platformInfo, setPlatformInfo] = useState<{
    platform: string;
    userDataDir: string;
    powerSaveActive: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setAudioSinkId(settings.audioSinkId);
    setPreferredDisplayId(settings.preferredDisplayId);

    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => setAudioDevices(list.filter((d) => d.kind === 'audiooutput')))
        .catch(() => {});
    }

    window.satsangAPI.getPlatformInfo().then(setPlatformInfo).catch(() => {});
  }, [open, settings]);

  if (!open) return null;

  const externalDisplays = displays.filter((d) => !d.isPrimary);

  const isSystemMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
  const effectiveOsTab =
    osGuideTab === 'auto' ? (isSystemMac ? 'mac' : 'windows') : osGuideTab;

  const handleRefreshDisplays = async () => {
    setIsRefreshingDisplays(true);
    try {
      const list = await window.satsangAPI.getDisplays();
      usePresenterStore.setState({ displays: list });
      const ext = list.filter((d) => !d.isPrimary);
      if (ext.length > 0) {
        showToast(
          `Detected ${ext.length} external display(s) ready for presentation!`,
          'success',
        );
      } else {
        showToast(
          'Detected 1 display surface. If a projector is connected, change OS mode from Duplicate/Mirror to Extend.',
          'info',
        );
      }
    } catch (err) {
      showToast(`Failed to refresh displays: ${(err as Error).message}`, 'error');
    } finally {
      setIsRefreshingDisplays(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({
      audioSinkId,
      preferredDisplayId,
      elevenLabsApiKey: settings.elevenLabsApiKey || '',
      localAlignerCommand: settings.localAlignerCommand || '',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-stage-border bg-stage-panel shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-stage-border px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Stage Console & Alignment Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 p-6 max-h-[80vh] overflow-y-auto">
          {/* Display Routing */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Monitor className="h-4 w-4 text-amber-400" />
              Audience Output Display (HDMI / SDI / Projector)
            </label>
            <select
              value={preferredDisplayId ?? ''}
              onChange={(e) =>
                setPreferredDisplayId(e.target.value ? Number(e.target.value) : null)
              }
              className="w-full rounded-xl border border-stage-border bg-stage-bg px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="">
                Auto-Select External Display ({externalDisplays.length} external detected)
              </option>
              {externalDisplays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} — {d.bounds.width}x{d.bounds.height} (Scale {d.scaleFactor}x)
                </option>
              ))}
            </select>

            {externalDisplays.length === 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-2.5">
                <div className="font-semibold text-amber-300 flex items-center justify-between">
                  <span>Single Display Mode (16:9 Floating Preview Active)</span>
                  <button
                    type="button"
                    disabled={isRefreshingDisplays}
                    onClick={handleRefreshDisplays}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500 hover:text-black transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isRefreshingDisplays ? 'animate-spin' : ''}`} />
                    <span>{isRefreshingDisplays ? 'Scanning...' : 'Refresh Displays'}</span>
                  </button>
                </div>

                <p className="text-slate-300 leading-relaxed">
                  No external secondary display is currently connected. When you click <strong>Start Presentation</strong>, Gifts Presenter will open an aspect-ratio-locked floating 16:9 preview window on this screen so you can test and rehearse without a projector.
                </p>

                {/* Connecting an External Projector Guidance */}
                <div className="pt-2 border-t border-amber-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">To present on a Projector, TV, or LED Wall:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setOsGuideTab('windows')}
                        className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          effectiveOsTab === 'windows'
                            ? 'bg-amber-400 text-black shadow-sm'
                            : 'bg-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        Windows
                      </button>
                      <button
                        type="button"
                        onClick={() => setOsGuideTab('mac')}
                        className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          effectiveOsTab === 'mac'
                            ? 'bg-amber-400 text-black shadow-sm'
                            : 'bg-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        macOS
                      </button>
                    </div>
                  </div>

                  {effectiveOsTab === 'mac' ? (
                    <div className="space-y-1.5 text-slate-300">
                      <p className="leading-relaxed">
                        1. Connect your HDMI, USB-C, or AirPlay projector to your Mac.
                      </p>
                      <p className="leading-relaxed">
                        2. If macOS defaults to mirroring your laptop, switch it to <strong>Extended display</strong>:
                      </p>
                      <div className="rounded-lg bg-black/50 p-2 font-mono text-[11px] text-amber-300 border border-amber-500/30">
                        Apple  menu &gt; System Settings &gt; Displays &gt; Select external screen &gt; <strong>Use as: &ldquo;Extended display&rdquo;</strong>
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Quick shortcut: Click Control Center (top-right menu bar) &gt; Screen Mirroring &gt; select <strong>Extended Display</strong> (uncheck Mirror).
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-slate-300">
                      <p className="leading-relaxed">
                        1. Connect your HDMI, DisplayPort, or USB-C cable to the projector.
                      </p>
                      <p className="leading-relaxed">
                        2. Ensure Windows is set to <strong>Extend</strong> (if set to &ldquo;Duplicate&rdquo;, Windows combines both screens into one):
                      </p>
                      <div className="rounded-lg bg-black/50 p-2 font-mono text-[11px] text-amber-300 border border-amber-500/30">
                        Press <strong>Win + P</strong> on your keyboard &rarr; Select <strong>&ldquo;Extend&rdquo;</strong>
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Or in Windows Settings &gt; System &gt; Display, change the dropdown from &ldquo;Duplicate these displays&rdquo; to <strong>&ldquo;Extend these displays&rdquo;</strong>.
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400 pt-0.5">
                    After connecting or switching to Extend, click <strong>Refresh Displays</strong> above and Gifts Presenter will detect your external screen immediately.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Detected {displays.length} total display(s). External output will run fullscreen, frameless, and always-on-top on your selected display.
              </p>
            )}
          </div>

          {/* Audio Output Device */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Volume2 className="h-4 w-4 text-emerald-400" />
              Stage Audio Output Device (setSinkId)
            </label>
            <select
              value={audioSinkId}
              onChange={(e) => setAudioSinkId(e.target.value)}
              className="w-full rounded-xl border border-stage-border bg-stage-bg px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="">Default System Output</option>
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Output Device (${d.deviceId.slice(0, 8)})`}
                </option>
              ))}
            </select>
          </div>

          {/* Stage Safety Diagnostics */}
          {platformInfo && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs text-slate-300 space-y-1">
              <div className="flex items-center gap-2 font-semibold text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                Stage Safety Active ({platformInfo.powerSaveActive ? 'Display Sleep Prevented' : 'Inactive'})
              </div>
              <div className="text-[11px] text-slate-400 font-mono break-all">
                Offline Package Root: {platformInfo.userDataDir}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stage-border px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-black hover:bg-amber-400"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

