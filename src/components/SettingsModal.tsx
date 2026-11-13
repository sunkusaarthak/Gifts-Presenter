import React, { useEffect, useState } from 'react';
import { Monitor, ShieldCheck, Sparkles, Volume2, X } from 'lucide-react';
import { normalizeGeminiModel, type GeminiAlignModel } from '../shared/types';
import { usePresenterStore } from '../store/usePresenterStore';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const settings = usePresenterStore((s) => s.settings);
  const displays = usePresenterStore((s) => s.displays);
  const saveSettings = usePresenterStore((s) => s.saveSettings);

  const [audioSinkId, setAudioSinkId] = useState(settings.audioSinkId);
  const [preferredDisplayId, setPreferredDisplayId] = useState<number | null>(
    settings.preferredDisplayId,
  );
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey);
  const [geminiModel, setGeminiModel] = useState<GeminiAlignModel>(settings.geminiModel);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [platformInfo, setPlatformInfo] = useState<{
    platform: string;
    userDataDir: string;
    powerSaveActive: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setAudioSinkId(settings.audioSinkId);
    setPreferredDisplayId(settings.preferredDisplayId);
    setGeminiApiKey(settings.geminiApiKey ?? '');
    setGeminiModel(normalizeGeminiModel(settings.geminiModel));

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({
      audioSinkId,
      preferredDisplayId,
      elevenLabsApiKey: settings.elevenLabsApiKey || '',
      localAlignerCommand: settings.localAlignerCommand || '',
      geminiApiKey,
      geminiModel,
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
            <p className="text-xs text-slate-400">
              {externalDisplays.length === 0
                ? 'No external monitor connected: clicking Start Presentation opens a floating 16:9 preview window.'
                : `Detected ${displays.length} total display(s). External output runs fullscreen, frameless, always-on-top (screen-saver), cursor hidden.`}
            </p>
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

          {/* Gemini Audio Alignment */}
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-stage-bg p-4">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
              <Sparkles className="h-4 w-4" />
              Gemini Precision Audio-to-Lyric Aligner (Sync Studio)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="Gemini API Key (AIza...)"
                className="sm:col-span-2 rounded-xl border border-stage-border bg-stage-panel px-3 py-2 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value as GeminiAlignModel)}
                className="rounded-xl border border-stage-border bg-stage-panel px-2.5 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended)</option>
                <option value="gemini-3.8-pro">gemini-3.8-pro (Highest Precision)</option>
                <option value="gemini-3.8-flash-lite">gemini-3.8-flash-lite</option>
              </select>
            </div>
            <p className="text-[11px] text-slate-400">
              Used only in Sync Studio to generate precise timecodes; live stage playback remains 100% offline.
            </p>
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

