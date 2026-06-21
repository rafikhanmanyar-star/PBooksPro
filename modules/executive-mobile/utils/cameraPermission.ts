export type CameraPermissionState = 'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported';

const STORAGE_KEY = 'executive_camera_permission_prompted_v1';

export function wasCameraPromptShown(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markCameraPromptShown(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export async function getCameraPermissionState(): Promise<CameraPermissionState> {
  if (typeof navigator === 'undefined') return 'unsupported';

  const permissions = navigator.permissions;
  if (permissions?.query) {
    try {
      const status = await permissions.query({ name: 'camera' as PermissionName });
      if (status.state === 'granted') return 'granted';
      if (status.state === 'denied') return 'denied';
      if (status.state === 'prompt') return 'prompt';
    } catch {
      /* Permissions API may be unavailable */
    }
  }

  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return 'unknown';
}

/** Triggers the OS camera permission dialog (user gesture required on iOS). */
export async function requestCameraPermission(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

export async function ensureCameraForCapture(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const state = await getCameraPermissionState();
  if (state === 'granted') return { ok: true };

  const granted = await requestCameraPermission();
  if (granted) return { ok: true };

  const after = await getCameraPermissionState();
  if (after === 'denied') {
    return {
      ok: false,
      reason:
        'Camera access was denied. Enable the camera for PBooks Pro in your device Settings, then try again.',
    };
  }

  return {
    ok: false,
    reason: 'Camera access is required to scan receipts. Allow camera access when your device prompts you.',
  };
}
