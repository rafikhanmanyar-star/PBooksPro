import { isEnvFlagEnabled } from './envFlag.js';

export type CaptchaVerifyResult = { ok: true } | { ok: false; message: string };

/** Organization registration uses admin approval instead of CAPTCHA. */
export function publicCaptchaRequired(): boolean {
  return false;
}

export async function verifyRegistrationCaptcha(
  _token: string | undefined,
  _remoteIp?: string
): Promise<CaptchaVerifyResult> {
  return { ok: true };
}

export function publicCaptchaSiteKey(): string | null {
  return null;
}

export function publicCaptchaProvider(): 'turnstile' | 'recaptcha' | null {
  return null;
}

/** @deprecated Registration CAPTCHA disabled; kept for env compatibility checks only. */
export function registrationCaptchaConfigured(): boolean {
  if (!isEnvFlagEnabled('ALLOW_SELF_SIGNUP')) return false;
  if (!isEnvFlagEnabled('REGISTRATION_CAPTCHA_REQUIRED')) return false;
  const hasSecret = !!(process.env.TURNSTILE_SECRET_KEY?.trim() || process.env.RECAPTCHA_SECRET_KEY?.trim());
  const hasSite = !!(process.env.TURNSTILE_SITE_KEY?.trim() || process.env.RECAPTCHA_SITE_KEY?.trim());
  return hasSecret && hasSite;
}
