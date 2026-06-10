import { isEnvFlagEnabled } from './envFlag.js';

export type CaptchaVerifyResult = { ok: true } | { ok: false; message: string };

function captchaRequired(): boolean {
  if (!isEnvFlagEnabled('ALLOW_SELF_SIGNUP')) return false;
  const raw = process.env.REGISTRATION_CAPTCHA_REQUIRED?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return !!(process.env.TURNSTILE_SECRET_KEY?.trim() || process.env.RECAPTCHA_SECRET_KEY?.trim());
}

async function verifyTurnstile(token: string, remoteIp?: string): Promise<CaptchaVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { ok: false, message: 'CAPTCHA is not configured on the server.' };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
  if (data.success) return { ok: true };
  return { ok: false, message: 'CAPTCHA verification failed. Please try again.' };
}

async function verifyRecaptcha(token: string, remoteIp?: string): Promise<CaptchaVerifyResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secret) return { ok: false, message: 'CAPTCHA is not configured on the server.' };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as { success?: boolean };
  if (data.success) return { ok: true };
  return { ok: false, message: 'CAPTCHA verification failed. Please try again.' };
}

export async function verifyRegistrationCaptcha(
  token: string | undefined,
  remoteIp?: string
): Promise<CaptchaVerifyResult> {
  if (!captchaRequired()) return { ok: true };
  if (!token?.trim()) {
    return { ok: false, message: 'Please complete the CAPTCHA verification.' };
  }
  if (process.env.TURNSTILE_SECRET_KEY?.trim()) {
    return verifyTurnstile(token.trim(), remoteIp);
  }
  return verifyRecaptcha(token.trim(), remoteIp);
}

export function publicCaptchaSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY?.trim() || process.env.RECAPTCHA_SITE_KEY?.trim() || null;
}

export function publicCaptchaProvider(): 'turnstile' | 'recaptcha' | null {
  if (process.env.TURNSTILE_SITE_KEY?.trim()) return 'turnstile';
  if (process.env.RECAPTCHA_SITE_KEY?.trim()) return 'recaptcha';
  return null;
}

/** Exposed to clients so UI only blocks submit when the server will enforce CAPTCHA. */
export function publicCaptchaRequired(): boolean {
  return captchaRequired();
}
