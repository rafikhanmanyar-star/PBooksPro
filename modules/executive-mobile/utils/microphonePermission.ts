export type MicrophonePermissionState = 'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported';

const STORAGE_KEY = 'executive_mic_permission_prompted_v1';

export function wasMicrophonePromptShown(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markMicrophonePromptShown(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export async function getMicrophonePermissionState(): Promise<MicrophonePermissionState> {
  if (typeof navigator === 'undefined') return 'unsupported';

  const permissions = navigator.permissions;
  if (permissions?.query) {
    try {
      const status = await permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'granted') return 'granted';
      if (status.state === 'denied') return 'denied';
      if (status.state === 'prompt') return 'prompt';
    } catch {
      /* Permissions API may be unavailable (e.g. iOS) */
    }
  }

  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return 'unknown';
}

/** Prompts the OS/browser mic dialog via getUserMedia (requires user gesture on iOS). */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

export async function ensureMicrophoneForSpeech(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const state = await getMicrophonePermissionState();
  if (state === 'granted') return { ok: true };

  const granted = await requestMicrophonePermission();
  if (granted) return { ok: true };

  const after = await getMicrophonePermissionState();
  if (after === 'denied') {
    return {
      ok: false,
      reason:
        'Microphone access was denied. Enable the microphone for PBooks Pro in your device Settings, then try again.',
    };
  }

  return {
    ok: false,
    reason: 'Microphone access is required for voice capture. Tap Enable microphone and allow access when prompted.',
  };
}
