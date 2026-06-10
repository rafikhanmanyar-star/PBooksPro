import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

type CaptchaConfig = {
  provider: 'turnstile' | 'recaptcha';
  siteKey: string;
};

type Props = {
  config: CaptchaConfig | null;
  onToken: (token: string | null) => void;
  onLoadError?: (failed: boolean) => void;
  disabled?: boolean;
};

declare global {
  interface Window {
    turnstile?: {
      ready: (cb: () => void) => void;
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (el: HTMLElement, options: Record<string, unknown>) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

const LOAD_TIMEOUT_MS = 15_000;
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const RECAPTCHA_SCRIPT = 'https://www.google.com/recaptcha/api.js?render=explicit';

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error(`Failed to load ${id}`)),
        { once: true }
      );
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.setAttribute('data-loaded', 'true');
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${id}`));
    document.head.appendChild(script);
  });
}

function waitForTurnstile(timeoutMs: number): Promise<NonNullable<Window['turnstile']>> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const attempt = () => {
      const api = window.turnstile;
      if (api?.ready) {
        api.ready(() => resolve(api));
        return;
      }
      if (api) {
        resolve(api);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('Turnstile API did not become available'));
        return;
      }
      window.setTimeout(attempt, 50);
    };

    attempt();
  });
}

function waitForGrecaptcha(timeoutMs: number): Promise<NonNullable<Window['grecaptcha']>> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const attempt = () => {
      const api = window.grecaptcha;
      if (api?.ready) {
        api.ready(() => resolve(api));
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('reCAPTCHA API did not become available'));
        return;
      }
      window.setTimeout(attempt, 50);
    };

    attempt();
  });
}

const RegistrationCaptcha: React.FC<Props> = ({ config, onToken, onLoadError, disabled }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | number | null>(null);
  const onTokenRef = useRef(onToken);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const instanceId = useId().replace(/:/g, '');

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const reportFailure = useCallback(
    (message: string) => {
      setLoadError(message);
      onLoadError?.(true);
    },
    [onLoadError]
  );

  const clearFailure = useCallback(() => {
    setLoadError(null);
    onLoadError?.(false);
  }, [onLoadError]);

  useEffect(() => {
    onToken(null);
    clearFailure();

    if (!config || disabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const successCallbackName = `pbooksTurnstileOk_${instanceId}`;
    const expiredCallbackName = `pbooksTurnstileExp_${instanceId}`;
    const errorCallbackName = `pbooksTurnstileErr_${instanceId}`;

    const win = window as Window & Record<string, unknown>;
    win[successCallbackName] = (token: string) => onTokenRef.current(token);
    win[expiredCallbackName] = () => onTokenRef.current(null);
    win[errorCallbackName] = () => onTokenRef.current(null);

    void (async () => {
      setLoading(true);
      try {
        if (config.provider === 'turnstile') {
          await loadScript(TURNSTILE_SCRIPT, 'cf-turnstile');
          const turnstile = await waitForTurnstile(LOAD_TIMEOUT_MS);
          if (cancelled || !containerRef.current) return;

          containerRef.current.replaceChildren();
          widgetIdRef.current = turnstile.render(containerRef.current, {
            sitekey: config.siteKey,
            theme: 'auto',
            appearance: 'always',
            callback: (token: string) => onTokenRef.current(token),
            'expired-callback': () => onTokenRef.current(null),
            'error-callback': () => onTokenRef.current(null),
          });
        } else {
          await loadScript(RECAPTCHA_SCRIPT, 'google-recaptcha');
          const grecaptcha = await waitForGrecaptcha(LOAD_TIMEOUT_MS);
          if (cancelled || !containerRef.current) return;

          containerRef.current.replaceChildren();
          widgetIdRef.current = grecaptcha.render(containerRef.current, {
            sitekey: config.siteKey,
            theme: 'dark',
            callback: (token: string) => onTokenRef.current(token),
            'expired-callback': () => onTokenRef.current(null),
          });
        }

        if (!cancelled) {
          clearFailure();
        }
      } catch (err) {
        if (!cancelled) {
          const detail = err instanceof Error ? err.message : 'unknown error';
          reportFailure(
            `CAPTCHA could not be loaded (${detail}). Refresh the page or contact support if this continues.`
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      delete win[successCallbackName];
      delete win[expiredCallbackName];
      delete win[errorCallbackName];
      if (config?.provider === 'turnstile' && widgetIdRef.current != null && window.turnstile) {
        try {
          window.turnstile.remove(String(widgetIdRef.current));
        } catch {
          /* widget may already be gone */
        }
      }
      widgetIdRef.current = null;
    };
  }, [config, disabled, clearFailure, reportFailure, renderAttempt, instanceId]);

  const handleRetry = () => {
    setLoadError(null);
    onLoadError?.(false);
    setRenderAttempt((n) => n + 1);
  };

  if (!config) {
    return (
      <div className="rounded-ds-md border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-ds-small text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        Security verification is not configured on the server. Contact support to finish registration.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-ds-small font-medium text-app-text">Security verification</p>
      <div className="relative rounded-ds-md border border-app-border bg-app-toolbar px-3 py-3">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-ds-md bg-app-toolbar/90 text-ds-small text-app-muted">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            Loading verification…
          </div>
        )}
        <div ref={containerRef} className="flex min-h-[70px] min-w-[300px] items-center justify-start" />
      </div>
      {loadError && (
        <div className="space-y-2">
          <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 text-ds-small font-medium text-app-muted transition-colors hover:text-app-text"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Retry verification
          </button>
        </div>
      )}
    </div>
  );
};

export default RegistrationCaptcha;
