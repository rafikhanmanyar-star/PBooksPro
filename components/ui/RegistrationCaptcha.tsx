import React, { useEffect, useRef, useState } from 'react';

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

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${id}`));
    document.head.appendChild(script);
  });
}

const RegistrationCaptcha: React.FC<Props> = ({ config, onToken, onLoadError, disabled }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onToken(null);
    onLoadError?.(false);
    if (!config || disabled) return;

    let cancelled = false;

    void (async () => {
      try {
        if (config.provider === 'turnstile') {
          await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', 'cf-turnstile');
          if (cancelled || !containerRef.current || !window.turnstile) return;
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: config.siteKey,
            callback: (token: string) => onToken(token),
            'expired-callback': () => onToken(null),
            'error-callback': () => onToken(null),
          });
        } else {
          await loadScript('https://www.google.com/recaptcha/api.js?render=explicit', 'google-recaptcha');
          await new Promise<void>((resolve) => window.grecaptcha?.ready(() => resolve()));
          if (cancelled || !containerRef.current || !window.grecaptcha) return;
          widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
            sitekey: config.siteKey,
            callback: (token: string) => onToken(token),
            'expired-callback': () => onToken(null),
          });
        }
        setLoadError(null);
        onLoadError?.(false);
      } catch {
        if (!cancelled) {
          setLoadError('CAPTCHA could not be loaded. Refresh and try again.');
          onLoadError?.(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      onLoadError?.(false);
      if (config?.provider === 'turnstile' && widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(String(widgetIdRef.current));
      }
      widgetIdRef.current = null;
    };
  }, [config, disabled, onToken, onLoadError]);

  if (!config) return null;

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="min-h-[65px]" />
      {loadError && <p className="text-sm text-rose-600">{loadError}</p>}
    </div>
  );
};

export default RegistrationCaptcha;
