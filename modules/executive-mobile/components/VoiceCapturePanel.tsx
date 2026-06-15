import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedVoiceCapture } from '../utils/parseVoiceQuickCapture';
import { parseVoiceQuickCapture } from '../utils/parseVoiceQuickCapture';

type Props = {
  onParsed: (parsed: ParsedVoiceCapture) => void;
  onError: (message: string) => void;
  disabled?: boolean;
};

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-0.5 h-8" aria-hidden>
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className={`w-1 rounded-full bg-ds-primary/70 ${active ? 'qc-voice-bar' : ''}`}
          style={{ animationDelay: `${i * 0.08}s`, height: active ? undefined : '6px' }}
        />
      ))}
    </div>
  );
}

export default function VoiceCapturePanel({ onParsed, onError, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)
    );
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const processTranscript = useCallback(
    (text: string) => {
      setLastTranscript(text);
      const parsed = parseVoiceQuickCapture(text);
      if (!parsed) {
        onError('Could not detect amount. Try: "Paid 5000 fuel expense at Site Office"');
        return;
      }
      onParsed(parsed);
    },
    [onParsed, onError]
  );

  const startListening = useCallback(() => {
    if (disabled) return;
    const SR =
      window.SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) {
      onError('Voice capture is not supported in this browser.');
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = 'en-PK';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      onError('Voice capture failed. Check microphone permission and try again.');
    };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript;
      if (text) processTranscript(text);
    };

    recognition.start();
  }, [disabled, onError, processTranscript]);

  if (!supported) {
    return (
      <div className="qc-voice-panel rounded-2xl border border-app-border bg-app-card p-4">
        <p className="text-sm text-app-muted">Voice capture requires Chrome or Safari on a device with a microphone.</p>
      </div>
    );
  }

  return (
    <div className="qc-voice-panel rounded-2xl border border-blue-200/60 dark:border-blue-500/30 bg-blue-50/80 dark:bg-blue-950/20 p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={startListening}
          disabled={disabled || listening}
          className={`qc-voice-mic-btn shrink-0 touch-manipulation disabled:opacity-60 ${
            listening ? 'qc-voice-mic-btn--active' : ''
          }`}
          aria-label="Record with voice"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" aria-hidden>
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-app-text">Record with Voice</p>
          <p className="text-xs text-app-muted mt-0.5 leading-snug">
            Try saying: &quot;Paid 5000 fuel expense at Site Office&quot;
          </p>
          {lastTranscript && (
            <p className="text-xs text-ds-primary mt-1 line-clamp-2">&ldquo;{lastTranscript}&rdquo;</p>
          )}
        </div>
        <Waveform active={listening} />
      </div>
      {listening && (
        <p className="text-xs text-ds-primary font-medium mt-3 text-center animate-pulse">Listening…</p>
      )}
    </div>
  );
}
