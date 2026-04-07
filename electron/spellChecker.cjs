/**
 * Spell checker settings and custom dictionary (local JSON in userData).
 * Offline: uses Chromium/Electron built-in dictionary; no network.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_SETTINGS = {
  spellcheckEnabled: true,
  spellcheckerLanguage: 'en-US',
  autocorrectEnabled: false,
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'spell-settings.json');
}

function getCustomWordsPath() {
  return path.join(app.getPath('userData'), 'spell-custom-dictionary.json');
}

function loadSettings() {
  try {
    const p = getSettingsPath();
    if (!fs.existsSync(p)) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    console.warn('[SpellChecker] loadSettings failed:', err && err.message ? err.message : err);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(partial) {
  const merged = { ...loadSettings(), ...partial };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function loadCustomWords() {
  try {
    const p = getCustomWordsPath();
    if (!fs.existsSync(p)) return [];
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((w) => typeof w === 'string' && w.trim()) : [];
  } catch (err) {
    console.warn('[SpellChecker] loadCustomWords failed:', err && err.message ? err.message : err);
    return [];
  }
}

function addCustomWord(word) {
  if (!word || typeof word !== 'string') return;
  const w = word.trim();
  if (!w) return;
  const set = new Set(loadCustomWords());
  if (set.has(w)) return;
  set.add(w);
  const sorted = [...set].sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(getCustomWordsPath(), JSON.stringify(sorted, null, 2), 'utf8');
}

/**
 * @param {import('electron').Session} session
 * @param {ReturnType<typeof loadSettings>} settings
 */
function applySpellSettingsToSession(session, settings) {
  if (!session) return;
  const s = settings || loadSettings();
  try {
    session.setSpellCheckerEnabled(!!s.spellcheckEnabled);
    if (s.spellcheckerLanguage && typeof s.spellcheckerLanguage === 'string') {
      session.setSpellCheckerLanguages([s.spellcheckerLanguage]);
    }
  } catch (err) {
    console.error('[SpellChecker] applySpellSettingsToSession:', err);
  }
}

/**
 * @param {import('electron').Session} session
 */
function preloadCustomDictionary(session) {
  if (!session) return;
  const words = loadCustomWords();
  for (const w of words) {
    try {
      session.addWordToSpellCheckerDictionary(w);
    } catch (_) {
      // ignore invalid words
    }
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  loadCustomWords,
  addCustomWord,
  applySpellSettingsToSession,
  preloadCustomDictionary,
};
