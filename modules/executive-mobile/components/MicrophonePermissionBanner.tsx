import React, { useCallback, useEffect, useState } from 'react';
import { ICONS } from '../../../constants';
import {
  ensureMicrophoneForSpeech,
  getMicrophonePermissionState,
  markMicrophonePromptShown,
  type MicrophonePermissionState,
  wasMicrophonePromptShown,
} from '../utils/microphonePermission';

type Props = {
  /** When true, show on first executive session until granted or dismissed. */
  showInstallPrompt?: boolean;
  onGranted?: () => void;
  onError?: (message: string) => void;
  compact?: boolean;
};

export default function MicrophonePermissionBanner({
  showInstallPrompt = false,
  onGranted,
  onError,
  compact = false,
}: Props) {
  const [state, setState] = useState<MicrophonePermissionState>('unknown');
  const [requesting, setRequesting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void getMicrophonePermissionState().then(setState);
  }, []);

  const visible =
    showInstallPrompt &&
    !dismissed &&
    state !== 'granted' &&
    state !== 'unsupported' &&
    !wasMicrophonePromptShown();

  const enableMic = useCallback(async () => {
    setRequesting(true);
    markMicrophonePromptShown();
    const result = await ensureMicrophoneForSpeech();
    setRequesting(false);
    if (result.ok) {
      setState('granted');
      onGranted?.();
      return;
    }
    onError?.(result.reason);
    setState(await getMicrophonePermissionState());
  }, [onGranted, onError]);

  const dismiss = useCallback(() => {
    markMicrophonePromptShown();
    setDismissed(true);
  }, []);

  if (!visible) return null;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void enableMic()}
        disabled={requesting}
        className="text-xs font-semibold text-ds-primary touch-manipulation disabled:opacity-60"
      >
        {requesting ? 'Requesting…' : 'Enable microphone'}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-300/50 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-600/40 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 inline-flex items-center justify-center shrink-0">
          <span className="w-5 h-5">{ICONS.activity}</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-app-text">Enable microphone for voice capture</p>
          <p className="text-xs text-app-muted mt-1 leading-snug">
            Quick Capture can record transactions by voice. Allow microphone access when your device prompts you.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 text-app-muted touch-manipulation shrink-0"
          aria-label="Dismiss"
        >
          <span className="w-4 h-4">{ICONS.x}</span>
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void enableMic()}
          disabled={requesting}
          className="flex-1 py-2.5 rounded-xl bg-ds-primary text-white text-sm font-semibold touch-manipulation disabled:opacity-60"
        >
          {requesting ? 'Opening permission…' : 'Enable microphone'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="px-4 py-2.5 rounded-xl border border-app-border text-sm font-semibold touch-manipulation"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
