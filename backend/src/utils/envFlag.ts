/** True for env values: true, TRUE, 1, yes (Render dashboard typos). */
export function isEnvFlagEnabled(name: string): boolean {
  const raw = process.env[name];
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
