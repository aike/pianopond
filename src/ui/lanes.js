// レーンと鍵盤の Canvas 描画。

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const JUDGE_COLORS = { perfect: '#ffd54f', good: '#69f0ae', miss: '#ff5252' };
const JUDGE_LABELS = { perfect: 'PERFECT', good: 'GOOD', miss: 'MISS' };
const PC_LABELS = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];
const CHORD_FONT_PX = 32; // 落下中のノートに付けるコードネームの文字サイズ

export class LaneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.keyboardH = 120;
    this.keys = [];
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.baseNote = 48;
  }

  resize(baseNote) {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.baseNote = baseNote;
    this.keyboardH = Math.min(140, Math.max(80, this.h * 0.2));
    this.layoutKeys();
  }

  layoutKeys() {
    const notes = [];
    let whites = 0;
    for (let i = 0; i < 25; i++) {
      const midi = this.baseNote + i;
      const white = WHITE_PCS.has(midi % 12);
      notes.push({ midi, white });
      if (white) whites++;
    }
    const ww = this.w / whites;
    const bw = ww * 0.6;
    let wi = 0;
    this.keys = [];
    this.keyByMidi = new Map();
    for (const n of notes) {
      let key;
      if (n.white) {
        key = { midi: n.midi, x: wi * ww, w: ww, black: false };
        wi++;
      } else {
        key = { midi: n.midi, x: wi * ww - bw / 2, w: bw, black: true };
      }
      this.keys.push(key);
      this.keyByMidi.set(n.midi, key);
    }
  }

  draw(state) {
    const g = this.g;
    const { w, h } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#0f1419';
    g.fillRect(0, 0, w, h);
    const judgeY = h - this.keyboardH;
    const { now, speed } = state;

    // レーン背景
    for (const k of this.keys) {
      if (k.black) {
        g.fillStyle = 'rgba(0,0,0,0.32)';
        g.fillRect(k.x, 0, k.w, judgeY);
      } else {
        g.fillStyle = 'rgba(255,255,255,0.045)';
        g.fillRect(k.x + k.w - 1, 0, 1, judgeY);
      }
    }

    // 拍線
    if (state.beatSec) {
      const tVisible = judgeY / speed;
      const b0 = Math.max(0, Math.floor((now - state.songStart) / state.beatSec));
      const b1 = Math.min(state.totalBeats, Math.ceil((now + tVisible - state.songStart) / state.beatSec));
      for (let b = b0; b <= b1; b++) {
        const y = judgeY - (state.songStart + b * state.beatSec - now) * speed;
        if (y < 0 || y > judgeY) continue;
        const bar = b % state.beatsPerBar === 0;
        g.fillStyle = bar ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)';
        g.fillRect(0, y - (bar ? 1 : 0.5), w, bar ? 2 : 1);
      }
    }

    // 「いま弾く」に表示中の和音の鍵盤ヒント。HUD の表示と同時に切り替わる
    // (判定後も鍵が押されている間は前の和音のまま。engine.displayChord 参照)。
    const hintKeys = new Set();
    if (state.current) {
      for (const n of state.current.notes) hintKeys.add(n);
    }

    // 和音ノート
    for (const c of state.chords) {
      const y = judgeY - (c.time - now) * speed;
      if (y < -40) break;
      if (c.status === 'perfect' || c.status === 'good') {
        const age = now - c.judgedAt;
        if (age < 0.25) {
          g.fillStyle = JUDGE_COLORS[c.status];
          g.globalAlpha = (1 - age / 0.25) * 0.8;
          for (const n of c.notes) {
            const k = this.keyByMidi.get(n);
            if (k) g.fillRect(k.x, judgeY - 14 - age * 120, k.w, 14);
          }
          g.globalAlpha = 1;
        }
        continue;
      }
      if (y > judgeY + 60) continue;
      const missed = c.status === 'miss';
      const ks = c.notes.map((n) => this.keyByMidi.get(n)).filter(Boolean);
      if (!ks.length) continue;
      const left = Math.min(...ks.map((k) => k.x));
      const right = Math.max(...ks.map((k) => k.x + k.w));
      g.globalAlpha = missed ? 0.55 : 1;
      g.fillStyle = missed ? 'rgba(255,82,82,0.6)' : 'rgba(79,195,247,0.35)';
      g.fillRect(left, y - 2, right - left, 4);
      for (const k of ks) {
        const isBass = k.midi === c.bassNote;
        if (missed) g.fillStyle = '#ff5252';
        else if (isBass) g.fillStyle = k.black ? '#ef6c00' : '#ffa726';
        else g.fillStyle = k.black ? '#1e88e5' : '#4fc3f7';
        roundRect(g, k.x + 2, y - 11, k.w - 4, 22, 4);
        g.fill();
      }
      // コードネーム: ノートの上に大きく表示。画面右端からはみ出さないように寄せる。
      g.font = `bold ${CHORD_FONT_PX}px system-ui, sans-serif`;
      g.textBaseline = 'bottom';
      g.textAlign = 'left';
      const tw = g.measureText(c.name).width;
      const lx = Math.min(Math.max(6, left), Math.max(6, w - tw - 6));
      const ly = y - 14;
      g.lineJoin = 'round';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(c.name, lx, ly);
      g.fillStyle = missed ? '#ff8a80' : '#ffffff';
      g.fillText(c.name, lx, ly);
      g.globalAlpha = 1;
    }

    // 判定線
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(0, judgeY - 2, w, 3);

    // 鍵盤
    const kh = this.keyboardH;
    for (const k of this.keys) {
      if (k.black) continue;
      const held = state.held.has(k.midi);
      const hintBass = state.current && hintKeys.has(k.midi) && k.midi === state.current.bassNote;
      g.fillStyle = held ? '#ffd54f' : hintBass ? '#ffe0b2' : hintKeys.has(k.midi) ? '#bfe6f7' : '#f4f4f4';
      g.fillRect(k.x, judgeY, k.w, kh);
      g.strokeStyle = '#1a1a1a';
      g.lineWidth = 1;
      g.strokeRect(k.x + 0.5, judgeY + 0.5, k.w - 1, kh - 1);
      const pc = k.midi % 12;
      g.fillStyle = pc === 0 ? '#333' : '#888';
      g.font = `${pc === 0 ? 'bold ' : ''}12px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      const label = pc === 0 ? `C${Math.floor(k.midi / 12) - 1}` : PC_LABELS[pc];
      g.fillText(label, k.x + k.w / 2, judgeY + kh - 6);
    }
    for (const k of this.keys) {
      if (!k.black) continue;
      const held = state.held.has(k.midi);
      const hintBass = state.current && hintKeys.has(k.midi) && k.midi === state.current.bassNote;
      g.fillStyle = held ? '#ffb300' : hintBass ? '#a35a00' : hintKeys.has(k.midi) ? '#2a6f9e' : '#1b1b1b';
      g.fillRect(k.x, judgeY, k.w, kh * 0.62);
      g.strokeStyle = '#000';
      g.strokeRect(k.x + 0.5, judgeY + 0.5, k.w - 1, kh * 0.62 - 1);
    }

    // 判定表示
    if (state.lastJudge) {
      const age = now - state.lastJudge.time;
      if (age < 0.6) {
        const { type, delta } = state.lastJudge;
        const alpha = 1 - age / 0.6;
        const scale = 1 + Math.max(0, 0.15 - age) * 2;
        g.globalAlpha = alpha;
        g.fillStyle = JUDGE_COLORS[type];
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `bold ${Math.round(34 * scale)}px system-ui, sans-serif`;
        g.fillText(JUDGE_LABELS[type], w / 2, judgeY - 90);
        if (type !== 'miss') {
          const ms = Math.round(delta * 1000);
          g.font = '14px system-ui, sans-serif';
          g.fillStyle = '#ddd';
          g.fillText(`${ms > 0 ? '+' : ''}${ms} ms${ms < -15 ? ' (早い)' : ms > 15 ? ' (遅い)' : ''}`, w / 2, judgeY - 62);
        }
        g.globalAlpha = 1;
      }
    }

    // カウントイン
    if (state.songStart && now < state.songStart) {
      const remain = Math.ceil((state.songStart - now) / state.beatSec);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 72px system-ui, sans-serif';
      g.fillText(String(remain), w / 2, judgeY * 0.45);
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}
