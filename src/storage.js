// 設定と自作譜面の永続化(localStorage)。

const KEY_SETTINGS = 'pianopond.settings';
const KEY_CHARTS = 'pianopond.charts';

export const DEFAULT_SETTINGS = {
  midiInputId: '',
  baseNote: 48,       // 鍵盤の最低音 (C3)
  offsetMs: 0,        // 判定オフセット。正なら「遅く押して良い」
  speed: 320,         // ノート落下速度 px/s
  tempoPercent: 100,  // 原曲テンポに対する割合 (%)
  pianoVolume: 0.8,
  accompVolume: 0.7,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    /* 保存できない環境では無視 */
  }
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) };
}

export function saveSettings(settings) {
  write(KEY_SETTINGS, settings);
}

export function loadUserCharts() {
  const list = read(KEY_CHARTS, []);
  return Array.isArray(list) ? list : [];
}

export function saveUserCharts(list) {
  write(KEY_CHARTS, list);
}
