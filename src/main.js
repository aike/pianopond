// 画面遷移と各モジュールの結線。

import { Piano } from './audio/synth.js';
import { Drums } from './audio/drums.js';
import { Bass } from './audio/bass.js';
import { volumeToGain, volumeLabel } from './audio/volume.js';
import { GameEngine, TEMPO_PERCENTS, tempoMultiplier } from './game/engine.js';
import { LaneRenderer } from './ui/lanes.js';
import { MidiInput, ALL_INPUTS, attachComputerKeyboard } from './midi.js';
import { loadSettings, saveSettings, loadUserCharts, saveUserCharts } from './storage.js';
import { normalizeChart, progressionToText, chartToJSON } from './chart/format.js';
import { buildTimeline } from './chart/timeline.js';
import { RHYTHMS, RHYTHM_IDS } from './chart/rhythm.js';
import { noteName } from './chart/parser.js';
import { BUILTIN_CHARTS } from '../data/charts.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const app = {
  settings: loadSettings(),
  userCharts: loadUserCharts(),
  builtin: BUILTIN_CHARTS.map((raw) => normalizeChart({ ...raw, builtin: true })),
  ctx: null,
  piano: null,
  drums: null,
  bass: null,
  pianoGain: null,
  accompGain: null,
  midi: new MidiInput(),
  engine: null,
  renderer: null,
  raf: 0,
  screen: 'select',
  returnScreen: 'select',
  currentChart: null,
  freeHeld: new Set(),
  editingId: null,
};

// ---------- 音声 ----------

function ensureAudio() {
  if (app.ctx) return app.ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctor({ latencyHint: 'interactive' });
  const comp = ctx.createDynamicsCompressor();
  comp.connect(ctx.destination);
  app.pianoGain = ctx.createGain();
  app.accompGain = ctx.createGain();
  app.pianoGain.connect(comp);
  app.accompGain.connect(comp);
  app.piano = new Piano(ctx, app.pianoGain);
  app.drums = new Drums(ctx, app.accompGain);
  app.bass = new Bass(ctx, app.accompGain);
  app.ctx = ctx;
  applyVolumes();
  return ctx;
}

function applyVolumes() {
  if (!app.ctx) return;
  const t = app.ctx.currentTime;
  for (const [node, v] of [[app.pianoGain, app.settings.pianoVolume], [app.accompGain, app.settings.accompVolume]]) {
    node.gain.cancelScheduledValues(t);
    node.gain.value = volumeToGain(v);
  }
  if (volumeToGain(app.settings.pianoVolume) === 0 && app.piano) app.piano.allOff();
}

function pianoMuted() {
  return volumeToGain(app.settings.pianoVolume) === 0;
}

function resumeAudio() {
  const ctx = ensureAudio();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

// ---------- 入力 ----------

function handleNoteOn(midi, vel, time) {
  const ctx = resumeAudio();
  const t = time ?? ctx.currentTime;
  $('#set-last-note').textContent = `${noteName(midi)} (MIDI ${midi})`;
  if (app.engine) {
    app.engine.noteOn(midi, t, vel);
  } else {
    if (!pianoMuted()) app.piano.noteOn(midi, undefined, vel);
    app.freeHeld.add(midi);
  }
}

function handleNoteOff(midi) {
  if (!app.ctx) return;
  if (app.engine) app.engine.noteOff(midi);
  else {
    app.piano.noteOff(midi);
    app.freeHeld.delete(midi);
  }
}

function midiTimeToAudio(timeStampMs) {
  const ctx = app.ctx;
  if (!ctx) return undefined;
  const ago = Math.max(0, performance.now() - timeStampMs) / 1000;
  return ctx.currentTime - ago;
}

function setMidiStatus(text, ok) {
  const el = $('#midi-status');
  el.textContent = text;
  el.className = `status ${ok ? 'ok' : 'ng'}`;
  updateMidiBanner();
}

async function updateMidiBanner() {
  const banner = $('#midi-banner');
  if (app.midi.access) {
    banner.hidden = true;
    return;
  }
  const perm = await app.midi.permissionState();
  banner.hidden = false;
  $('#midi-banner-text').textContent = `(権限の状態: ${perm}。${app.midi.error || ''})`;
  // 「ブロック」でなければ案内の手順は不要なので隠す
  $('.banner-steps').hidden = perm !== 'denied';
}

// 権限の要求と機器一覧の更新。権限が取れていなければ毎回要求し直す。
async function initMidi() {
  if (app.midiInitializing) return;
  app.midiInitializing = true;
  app.midi.onDevicesChanged = () => refreshMidiDevices();
  app.midi.onNoteOn = (midi, vel, ts) => handleNoteOn(midi, vel, midiTimeToAudio(ts));
  app.midi.onNoteOff = (midi) => handleNoteOff(midi);
  app.midi.onMessage = () => updateMidiMonitor();
  try {
    await app.midi.init();
    // 権限が取れなかった場合も、一覧・診断・モニタの表示を更新する
    refreshMidiDevices();
  } finally {
    app.midiInitializing = false;
  }
}

function refreshMidiDevices() {
  const inputs = app.midi.inputs();
  const active = app.midi.select(app.settings.midiInputId);
  // 保存していたポートが見つからなければ「すべての入力」に戻す
  if (app.midi.selectedId !== app.settings.midiInputId) {
    app.settings.midiInputId = app.midi.selectedId;
    saveSettings(app.settings);
  }
  const sel = $('#set-midi');
  sel.innerHTML = '';
  sel.append(new Option(inputs.length ? 'すべての入力(推奨)' : 'すべての入力(機器なし)', ALL_INPUTS));
  for (const i of inputs) sel.append(new Option(i.name, i.id));
  sel.value = app.midi.selectedId;
  if (active.length) setMidiStatus(`MIDI: ${active.map((a) => a.name).join(', ')}`, true);
  else if (!app.midi.access) setMidiStatus(`MIDI: ${app.midi.error || '未接続'}`, false);
  else setMidiStatus('MIDI: 機器が見つかりません(PC キーボードでも弾けます)', false);
  console.log('[PianoPond] MIDI ports', app.midi.ports());
  updateMidiInfo();
  updateMidiMonitor();
}

// 設定画面の受信モニタ。MIDI メッセージが届くたびに更新する。
function updateMidiMonitor() {
  const el = $('#set-midi-monitor');
  if (!el) return;
  const m = app.midi.lastMessage;
  const lines = [];
  if (!m && !app.midi.access) {
    lines.push('MIDI の権限が取れていないため受信できません。');
  } else if (!m) {
    lines.push('まだ受信していません。鍵盤を押してみてください。');
    lines.push(`聴いている入力ポート: ${app.midi.inputs().map((i) => i.name).join(', ') || 'なし'}`);
  } else {
    const d = new Date(m.at);
    const hms = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
    lines.push(`受信 ${app.midi.messageCount} 件 / 最終 ${hms}`);
    const noteText = m.note != null ? ` ${noteName(m.note)} (${m.note}) vel ${m.velocity}` : '';
    lines.push(`最終メッセージ: ${m.type}${noteText} ch${m.channel}  [${m.data.map((b) => b.toString(16).padStart(2, '0')).join(' ')}]`);
    lines.push(`ポート: ${m.port}${m.active ? '' : '  ※ 選択中の入力ではないため演奏には使われません'}`);
    if (m.note != null) {
      const lo = app.settings.baseNote;
      if (m.note < lo || m.note > lo + 24) {
        lines.push(`注意: ${noteName(m.note)} は鍵盤の範囲 ${noteName(lo)}〜${noteName(lo + 24)} の外です。鍵盤のオクターブ設定か「鍵盤の最低音」を見直してください。`);
      }
    }
    if (pianoMuted()) lines.push('注意: ピアノ音量がミュートなので鍵を押しても音は鳴りません。');
  }
  el.textContent = lines.join('\n');
}

async function updateMidiInfo() {
  const el = $('#set-midi-info');
  if (!el) return;
  const lines = [];
  const perm = await app.midi.permissionState();
  lines.push(`権限: ${perm}`);
  if (!window.isSecureContext) lines.push('注意: このページは安全なコンテキストではありません。http://localhost または https で開いてください。');
  if (!app.midi.access) {
    lines.push(`状態: 権限が取れていません(${app.midi.error || '未要求'})`);
    lines.push('対処: アドレスバー左のアイコン → サイトの設定 → 「MIDI デバイス」を「許可」にしてから再読み込みしてください。');
  } else {
    const ports = app.midi.ports();
    lines.push(`検出ポート: ${ports.length} 件`);
    for (const p of ports) lines.push(`  ${p.type === 'input' ? '入力' : '出力'}: ${p.name} [${p.state}, ${p.connection}]`);
    if (!ports.length) lines.push('ポートが 0 件です。機器を挿し直すか、他のアプリ(DAW など)が機器を占有していないか確認してください。');
  }
  el.textContent = lines.join('\n');
}

// ---------- 画面 ----------

function showScreen(name) {
  if (app.screen === 'play' && name !== 'play') stopGame();
  app.screen = name;
  for (const s of $$('.screen')) s.classList.toggle('active', s.id === `screen-${name}`);
  for (const b of $$('header nav button')) b.classList.toggle('primary', b.dataset.screen === name);
  if (name === 'select') renderChartLists();
  if (name === 'settings') {
    if (app.midi.access) refreshMidiDevices();
    else initMidi();
  }
}

function chartMeta(chart) {
  const beats = chart.progression.reduce((s, e) => s + e.beats, 0);
  const bars = Math.round((beats / chart.beatsPerBar) * 10) / 10;
  return `BPM ${chart.bpm} · ${RHYTHMS[chart.rhythm].label} · ${chart.beatsPerBar}/4 · ${bars} 小節 · ${chart.progression.length} 和音`;
}

function chartItem(chart, actions) {
  const li = document.createElement('li');
  const info = document.createElement('div');
  info.className = 'chart-info';
  const title = document.createElement('strong');
  title.textContent = chart.title;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = chartMeta(chart);
  info.append(title, meta);
  const acts = document.createElement('div');
  acts.className = 'chart-actions';
  for (const [label, handler, cls] of actions) {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', handler);
    acts.append(b);
  }
  li.append(info, acts);
  return li;
}

function userChartsNormalized() {
  const out = [];
  for (const raw of app.userCharts) {
    try {
      out.push(normalizeChart(raw));
    } catch (e) {
      console.warn('自作譜面を読めません', raw, e);
    }
  }
  return out;
}

function renderChartLists() {
  const bl = $('#builtin-list');
  bl.innerHTML = '';
  for (const chart of app.builtin) {
    bl.append(chartItem(chart, [
      ['プレイ', () => startGame(chart, 'select'), 'primary'],
      ['コピーして編集', () => { loadEditor({ ...chart, id: null, title: `${chart.title} (コピー)` }); showScreen('editor'); }],
    ]));
  }
  const ul = $('#user-list');
  ul.innerHTML = '';
  const users = userChartsNormalized();
  $('#user-empty').style.display = users.length ? 'none' : '';
  for (const chart of users) {
    ul.append(chartItem(chart, [
      ['プレイ', () => startGame(chart, 'select'), 'primary'],
      ['編集', () => { loadEditor(chart); showScreen('editor'); }],
      ['削除', () => deleteUserChart(chart.id), 'danger'],
    ]));
  }
}

// ---------- プレイ ----------

async function startGame(chart, returnScreen) {
  const ctx = ensureAudio();
  try { await ctx.resume(); } catch (_) { /* 後で再試行 */ }
  stopGame();
  app.currentChart = chart;
  app.returnScreen = returnScreen;
  app.piano.allOff();
  app.freeHeld.clear();
  let engine;
  try {
    engine = new GameEngine({
      ctx,
      piano: app.piano,
      drums: app.drums,
      bass: app.bass,
      chart,
      settings: app.settings,
      onEnd: (result) => showResult(result),
    });
  } catch (e) {
    alert(`譜面を開始できません: ${e.message}`);
    return;
  }
  app.screen = 'play';
  for (const s of $$('.screen')) s.classList.toggle('active', s.id === 'screen-play');
  $('#play-title').textContent =
    `${chart.title} — テンポ ${engine.tempoPercent}% (BPM ${Math.round(engine.bpm)}) / ${RHYTHMS[chart.rhythm].label} / スコア ×${engine.multiplier.toFixed(1)}`;
  app.renderer.resize(app.settings.baseNote);
  app.engine = engine;
  engine.start();
  cancelAnimationFrame(app.raf);
  loop();
}

function loop() {
  app.raf = requestAnimationFrame(loop);
  const e = app.engine;
  if (!e) return;
  e.update();
  if (!app.engine) return;
  app.renderer.draw({
    now: e.ctx.currentTime,
    songStart: e.songStart,
    beatSec: e.beatSec,
    beatsPerBar: e.chart.beatsPerBar,
    totalBeats: e.totalBeats,
    chords: e.chords,
    held: e.held,
    speed: app.settings.speed,
    lastJudge: e.lastJudge,
    current: e.displayChord(),
  });
  updateHud(e);
}

function updateHud(e) {
  const cur = e.displayChord();
  const next = e.displayNextChord();
  $('#hud-current').textContent = cur ? cur.name : '-';
  $('#hud-current-notes').textContent = cur
    ? `左手 ${noteName(cur.bassNote)}  |  右手 ${cur.rightNotes.map(noteName).join(' ')}`
    : '';
  $('#hud-next').textContent = next ? next.name : '-';
  $('#hud-score').textContent = String(e.score);
  $('#hud-combo').textContent = String(e.combo);
  $('#hud-counts').textContent = `P ${e.counts.perfect} / G ${e.counts.good} / M ${e.counts.miss}`;
}

function stopGame() {
  cancelAnimationFrame(app.raf);
  if (app.engine) {
    app.engine.stop();
    app.engine = null;
  }
}

function rankOf(acc) {
  if (acc >= 0.95) return 'S';
  if (acc >= 0.85) return 'A';
  if (acc >= 0.7) return 'B';
  if (acc >= 0.5) return 'C';
  return 'D';
}

function showResult(result) {
  stopGame();
  $('#result-title').textContent = app.currentChart.title;
  $('#result-rank').textContent = rankOf(result.accuracy);
  $('#result-tempo').textContent = `${result.tempoPercent}% (BPM ${Math.round(result.bpm)}) スコア ×${result.multiplier.toFixed(1)}`;
  $('#result-score').textContent = `${result.score} / ${result.maxScore}`;
  $('#result-accuracy').textContent = `${(result.accuracy * 100).toFixed(1)} %`;
  $('#result-perfect').textContent = String(result.counts.perfect);
  $('#result-good').textContent = String(result.counts.good);
  $('#result-miss').textContent = String(result.counts.miss);
  $('#result-combo').textContent = String(result.maxCombo);
  app.screen = 'result';
  for (const s of $$('.screen')) s.classList.toggle('active', s.id === 'screen-result');
}

// ---------- エディタ ----------

function loadEditor(chart) {
  app.editingId = chart && chart.id ? chart.id : null;
  $('#ed-title').value = chart ? chart.title : '';
  $('#ed-bpm').value = chart ? chart.bpm : 120;
  $('#ed-bpb').value = chart ? String(chart.beatsPerBar) : '4';
  $('#ed-rhythm').value = chart ? chart.rhythm : '8beat';
  $('#ed-prog').value = chart ? progressionToText(chart.progression, chart.beatsPerBar) : '';
  $('#ed-error').textContent = '';
  $('#ed-message').textContent = '';
  $('#ed-delete').style.display = app.editingId && app.userCharts.some((c) => c.id === app.editingId) ? '' : 'none';
}

function collectEditor() {
  const chart = normalizeChart({
    id: app.editingId || undefined,
    title: $('#ed-title').value,
    bpm: $('#ed-bpm').value,
    beatsPerBar: $('#ed-bpb').value,
    rhythm: $('#ed-rhythm').value,
    progressionText: $('#ed-prog').value,
  });
  buildTimeline(chart, app.settings.baseNote, app.settings.baseNote + 24); // 範囲チェック
  return chart;
}

function editorTry(fn) {
  $('#ed-error').textContent = '';
  $('#ed-message').textContent = '';
  try {
    return fn();
  } catch (e) {
    $('#ed-error').textContent = e.message;
    return null;
  }
}

function saveEditor() {
  const chart = editorTry(collectEditor);
  if (!chart) return null;
  const stored = { id: chart.id, ...chartToJSON(chart) };
  const i = app.userCharts.findIndex((c) => c.id === chart.id);
  if (i >= 0) app.userCharts[i] = stored;
  else app.userCharts.push(stored);
  saveUserCharts(app.userCharts);
  app.editingId = chart.id;
  $('#ed-delete').style.display = '';
  $('#ed-message').textContent = '保存しました';
  return chart;
}

function deleteUserChart(id) {
  const raw = app.userCharts.find((c) => c.id === id);
  if (!raw) return;
  if (!confirm(`「${raw.title}」を削除しますか?`)) return;
  app.userCharts = app.userCharts.filter((c) => c.id !== id);
  saveUserCharts(app.userCharts);
  if (app.editingId === id) loadEditor(null);
  renderChartLists();
}

function exportEditor() {
  const chart = editorTry(collectEditor);
  if (!chart) return;
  const blob = new Blob([JSON.stringify(chartToJSON(chart), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${chart.title.replace(/[\\/:*?"<>|]/g, '_')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importFile(file) {
  try {
    const raw = JSON.parse(await file.text());
    const chart = normalizeChart({ ...raw, id: undefined });
    app.userCharts.push({ id: chart.id, ...chartToJSON(chart) });
    saveUserCharts(app.userCharts);
    loadEditor(chart);
    $('#ed-message').textContent = `「${chart.title}」を読み込んで保存しました`;
  } catch (e) {
    $('#ed-error').textContent = `読み込みに失敗しました: ${e.message}`;
  }
}

// ---------- 設定 ----------

function updateTempoNote() {
  const p = app.settings.tempoPercent;
  $('#tempo-note').textContent = `原曲の ${p}% の速さ。スコア倍率 ×${tempoMultiplier(p).toFixed(1)}(速いほど高得点)`;
}

function initTempoUI() {
  const sel = $('#tempo-select');
  for (const p of TEMPO_PERCENTS) sel.append(new Option(`${p}%`, String(p)));
  if (!TEMPO_PERCENTS.includes(app.settings.tempoPercent)) app.settings.tempoPercent = 100;
  sel.value = String(app.settings.tempoPercent);
  sel.addEventListener('change', (e) => {
    app.settings.tempoPercent = Number(e.target.value);
    saveSettings(app.settings);
    updateTempoNote();
  });
  updateTempoNote();
}

function initSettingsUI() {
  const s = app.settings;
  $('#set-base').value = String(s.baseNote);
  $('#set-offset').value = String(s.offsetMs);
  $('#set-speed').value = String(s.speed);
  $('#set-speed-val').textContent = `${s.speed} px/s`;
  $('#set-piano').value = String(s.pianoVolume);
  $('#set-accomp').value = String(s.accompVolume);
  $('#set-piano-val').textContent = volumeLabel(s.pianoVolume);
  $('#set-accomp-val').textContent = volumeLabel(s.accompVolume);

  const update = (patch) => {
    Object.assign(app.settings, patch);
    saveSettings(app.settings);
    applyVolumes();
    $('#set-piano-val').textContent = volumeLabel(app.settings.pianoVolume);
    $('#set-accomp-val').textContent = volumeLabel(app.settings.accompVolume);
  };
  $('#set-midi').addEventListener('change', (e) => {
    update({ midiInputId: e.target.value });
    refreshMidiDevices();
  });
  $('#midi-banner-retry').addEventListener('click', () => initMidi());
  $('#set-midi-refresh').addEventListener('click', () => {
    if (app.midi.access) refreshMidiDevices();
    else initMidi();
  });
  $('#set-base').addEventListener('change', (e) => update({ baseNote: Number(e.target.value) }));
  $('#set-offset').addEventListener('change', (e) => update({ offsetMs: Number(e.target.value) || 0 }));
  $('#set-speed').addEventListener('input', (e) => {
    update({ speed: Number(e.target.value) });
    $('#set-speed-val').textContent = `${e.target.value} px/s`;
  });
  $('#set-piano').addEventListener('input', (e) => update({ pianoVolume: Number(e.target.value) }));
  $('#set-accomp').addEventListener('input', (e) => update({ accompVolume: Number(e.target.value) }));
}

// ---------- 初期化 ----------

function init() {
  app.renderer = new LaneRenderer($('#lanes'));

  const rhythmSel = $('#ed-rhythm');
  for (const id of RHYTHM_IDS) rhythmSel.append(new Option(RHYTHMS[id].label, id));
  loadEditor(null);
  initTempoUI();
  initSettingsUI();

  for (const b of $$('header nav button')) b.addEventListener('click', () => showScreen(b.dataset.screen));
  $('#btn-quit').addEventListener('click', () => showScreen(app.returnScreen));
  $('#btn-retry').addEventListener('click', () => startGame(app.currentChart, app.returnScreen));
  $('#btn-result-back').addEventListener('click', () => showScreen(app.returnScreen));

  $('#ed-test').addEventListener('click', () => {
    const chart = editorTry(collectEditor);
    if (chart) startGame(chart, 'editor');
  });
  $('#ed-save').addEventListener('click', () => saveEditor());
  $('#ed-new').addEventListener('click', () => loadEditor(null));
  $('#ed-export').addEventListener('click', () => exportEditor());
  $('#ed-import').addEventListener('click', () => $('#ed-import-file').click());
  $('#ed-import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importFile(file);
    e.target.value = '';
  });
  $('#ed-delete').addEventListener('click', () => { if (app.editingId) deleteUserChart(app.editingId); });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (app.screen === 'play' || app.screen === 'result') showScreen(app.returnScreen);
  });
  window.addEventListener('resize', () => {
    if (app.screen === 'play') app.renderer.resize(app.settings.baseNote);
  });
  // ブラウザの自動再生制限: 最初の操作で AudioContext を起こす
  window.addEventListener('pointerdown', resumeAudio, { passive: true });
  // 読み込み時に権限が取れなかった場合、最初の操作でもう一度要求する
  window.addEventListener('pointerdown', () => { if (!app.midi.access) initMidi(); }, { passive: true });
  window.addEventListener('keydown', resumeAudio);

  attachComputerKeyboard({
    isEnabled: () => true,
    baseNote: () => app.settings.baseNote,
    onNoteOn: (midi, vel) => handleNoteOn(midi, vel, undefined),
    onNoteOff: (midi) => handleNoteOff(midi),
  });

  renderChartLists();
  showScreen('select');
  initMidi();
}

init();
// デバッグ用にコンソールから状態を参照できるようにする
window.pianopond = app;
