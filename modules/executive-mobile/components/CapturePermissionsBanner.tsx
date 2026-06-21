import React, { useCallback, useEffect, useState } from 'react';
import { ICONS } from '../../../constants';
import {
  ensureCameraForCapture,
  getCameraPermissionState,
  markCameraPromptShown,
  type CameraPermissionState,
  wasCameraPromptShown,
} from '../utils/cameraPermission';
import {
  ensureMicrophoneForSpeech,
  getMicrophonePermissionState,
  markMicrophonePromptShown,
  type MicrophonePermissionState,
  wasMicrophonePromptShown,
} from '../utils/microphonePermission';

const COMBINED_STORAGE_KEY = 'executive_capture_permissions_prompted_v1';

function wasCombinedPromptShown(): boolean {
  try {
    return localStorage.getItem(COMBINED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markCombinedPromptShown(): void {
  try {
    localStorage.setItem(COMBINED_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
  markMicrophonePromptShown();
  markCameraPromptShown();
}

type Props = {
  showInstallPrompt?: boolean;
};

export default function CapturePermissionsBanner({ showInstallPrompt = false }: Props) {
  const [micState, setMicState] = useState<MicrophonePermissionState>('unknown');
  const [cameraState, setCameraState] = useState<CameraPermissionState>('unknown');
  const [requesting, setRequesting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getMicrophonePermissionState(), getCameraPermissionState()]).then(
      ([mic, cam]) => {
        setMicState(mic);
        setCameraState(cam);
      }
    );
  }, []);

  const micOk = micState === 'granted' || micState === 'unsupported';
  const cameraOk = cameraState === 'granted' || cameraState === 'unsupported';
  const allGranted = micOk && cameraOk;

  const visible =
    showInstallPrompt &&
    !dismissed &&
    !allGranted &&
    !wasCombinedPromptShown() &&
    !wasMicrophonePromptShown() &&
    !wasCameraPromptShown();

  const enablePermissions = useCallback(async () => {
    setRequesting(true);
    setStatusMessage(null);
    markCombinedPromptShown();

    const messages: string[] = [];

    if (micState !== 'granted' && micState !== 'unsupported') {
      const mic = await ensureMicrophoneForSpeech();
      const nextMic = await getMicrophonePermissionState();
      setMicState(nextMic);
      if (!mic.ok) messages.push(mic.reason);
    }

    if (cameraState !== 'granted' && cameraState !== 'unsupported') {
      const cam = await ensureCameraForCapture();
      const nextCam = await getCameraPermissionState();
      setCameraState(nextCam);
      if (!cam.ok) messages.push(cam.reason);
    }

    setRequesting(false);
    if (messages.length > 0) {
      setStatusMessage(messages[0] ?? null);
    }
  }, [micState, cameraState]);

  const dismiss = useCallback(() => {
    markCombinedPromptShown();
    setDismissed(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="rounded-2xl border border-amber-300/50 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-600/40 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 inline-flex items-center justify-center shrink-0">
          <span className="w-5 h-5">{ICONS.shield}</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-app-text">Enable Quick Capture permissions</p>
          <p className="text-xs text-app-muted mt-1 leading-snug">
            Allow microphone for voice entry and camera or photo library for receipt attachments.
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-app-muted">
            <li className="flex items-center gap-1.5">
              <span className={micOk ? 'text-emerald-600' : 'text-amber-600'}>
                {micOk ? '✓' : '○'}
              </span>
              Microphone — Record with Voice
            </li>
            <li className="flex items-center gap-1.5">
              <span className={cameraOk ? 'text-emerald-600' : 'text-amber-600'}>
                {cameraOk ? '✓' : '○'}
              </span>
              Camera &amp; gallery — Receipt photos
            </li>
          </ul>
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
      {statusMessage && <p className="text-xs text-amber-800 dark:text-amber-300">{statusMessage}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void enablePermissions()}
          disabled={requesting}
          className="flex-1 py-2.5 rounded-xl bg-ds-primary text-white text-sm font-semibold touch-manipulation disabled:opacity-60"
        >
          {requesting ? 'Opening permissions…' : 'Enable permissions'}
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
