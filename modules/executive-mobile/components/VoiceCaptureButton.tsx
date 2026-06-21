import React, { useCallback, useEffect, useState } from 'react';
import { ICONS } from '../../../constants';
import { ensureMicrophoneForSpeech } from '../utils/microphonePermission';

type Props = {
  onTranscript: (text: string) => void;
  className?: string;
  onError?: (message: string) => void;
};

export default function VoiceCaptureButton({ onTranscript, className = '', onError }: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)
    );
  }, []);

  const startListening = useCallback(async () => {
    const SR =
      window.SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;

    const mic = await ensureMicrophoneForSpeech();
    if (!mic.ok) {
      onError?.(mic.reason);
      return;
    }

    const recognition = new SR();
    recognition.lang = 'en-PK';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript;
      if (text) onTranscript(text);
    };

    recognition.start();
  }, [onTranscript, onError]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => void startListening()}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border bg-app-card text-sm font-medium touch-manipulation ${className} ${
        listening ? 'border-ds-primary text-ds-primary animate-pulse' : 'text-app-muted'
      }`}
      aria-label="Voice capture"
    >
      <span className="w-4 h-4 inline-flex" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </span>
      {listening ? 'Listening…' : 'Voice'}
    </button>
  );
}
