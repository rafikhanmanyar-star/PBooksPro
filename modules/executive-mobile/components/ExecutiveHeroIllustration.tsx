import React from 'react';

/** Decorative chart cluster for the executive home hero (reference mockup). */
export default function ExecutiveHeroIllustration() {
  return (
    <svg
      viewBox="0 0 120 100"
      className="w-28 h-24 shrink-0"
      aria-hidden
    >
      <defs>
        <linearGradient id="execBarG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <rect x="8" y="52" width="14" height="36" rx="3" fill="url(#execBarG)" opacity="0.9" />
      <rect x="28" y="38" width="14" height="50" rx="3" fill="url(#execBarG)" />
      <rect x="48" y="28" width="14" height="60" rx="3" fill="url(#execBarG)" opacity="0.85" />
      <path
        d="M10 78 C30 62, 50 68, 70 42 S 95 35, 108 22"
        fill="none"
        stroke="#22c55e"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="108" cy="22" r="4" fill="#16a34a" />
      <circle cx="88" cy="58" r="22" fill="#ecfdf5" stroke="#bbf7d0" strokeWidth="2" />
      <path d="M88 48 L96 58 L80 62 Z" fill="#22c55e" opacity="0.85" />
    </svg>
  );
}
