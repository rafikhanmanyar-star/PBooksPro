export const normalizeNameForComparison = (name: string): string => {
  if (!name) return '';
  const normalized = String(name).trim().replace(/\s+/g, ' ');
  return normalized.toLowerCase();
};
