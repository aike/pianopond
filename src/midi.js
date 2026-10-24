// Web MIDI 入力と、MIDI 鍵盤がない時のための PC キーボード代替。

export const ALL_INPUTS = ''; // 入力ポートの選択値: 空文字ならすべての入力ポートを受け付ける

export class MidiInput {
  constructor() {
    this.access = null;
    this.selectedId = ALL_INPUTS;
    this.listeners = new Map(); // port -> listener
    this.onNoteOn = null;   // (midi, velocity0to1, timeStampMs)
    this.onNoteOff = null;  // (midi, timeStampMs)
    this.onDevicesChanged = null;
    this.onMessage = null;  // 受信モニタ用: (info)
    this.error = null;
    this.messageCount = 0;
    this.lastMessage = null;
  }

  // 権限の要求。失敗しても後から何度でも呼び直せる。
  async init() {
    if (this.access) return true;
    if (!navigator.requestMIDIAccess) {
      this.error = 'このブラウザは Web MIDI に対応していません(Chrome / Edge を使ってください)';
      return false;
    }
    if (!window.isSecureContext) {
      this.error = 'Web MIDI は https または localhost でしか使えません';
      return false;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this.error = `MIDI へのアクセスが拒否されました: ${e.message}`;
      return false;
    }
    this.error = null;
    this.access.onstatechange = () => this.onDevicesChanged?.(this.inputs());
    return true;
  }

  async permissionState() {
    try {
      const st = await navigator.permissions.query({ name: 'midi', sysex: false });
      return st.state;
    } catch (_) {
      return '不明';
    }
  }

  inputs() {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map((i) => ({
      id: i.id,
      name: i.name || i.id,
      state: i.state,
      connection: i.connection,
    }));
  }

  // 診断用: 入出力ポートをすべて列挙する
  ports() {
    if (!this.access) return [];
    const list = [];
    for (const p of this.access.inputs.values()) list.push({ type: 'input', name: p.name || p.id, state: p.state, connection: p.connection });
    for (const p of this.access.outputs.values()) list.push({ type: 'output', name: p.name || p.id, state: p.state, connection: p.connection });
    return list;
  }

  // 使う入力ポートを選ぶ。id が空ならすべての入力ポートから受け付ける。
  // 受信モニタのため、どの設定でも全ポートを聴き、演奏入力として扱うかどうかだけを選択で切り替える。
  // 戻り値: 演奏入力として有効なポートの一覧(空なら無効)。
  select(id = ALL_INPUTS) {
    for (const [port, fn] of this.listeners) port.removeEventListener('midimessage', fn);
    this.listeners.clear();
    if (!this.access) return [];
    const ports = [...this.access.inputs.values()];
    const known = ports.some((p) => p.id === id);
    this.selectedId = known ? id : ALL_INPUTS;
    for (const port of ports) {
      const fn = (e) => this.handle(e, port);
      port.addEventListener('midimessage', fn);
      this.listeners.set(port, fn);
      // addEventListener だけではポートが開かれない実装があるので明示的に開く
      if (typeof port.open === 'function') port.open().catch?.(() => {});
    }
    return ports
      .filter((p) => this.selectedId === ALL_INPUTS || p.id === this.selectedId)
      .map((p) => ({ id: p.id, name: p.name || p.id }));
  }

  get input() {
    if (!this.access) return null;
    const ports = [...this.access.inputs.values()];
    if (this.selectedId === ALL_INPUTS) return ports[0] || null;
    return ports.find((p) => p.id === this.selectedId) || null;
  }

  handle(e, port) {
    const data = e.data;
    if (!data || !data.length) return;
    const [status, d1, d2] = data;
    const cmd = status & 0xf0;
    const active = this.selectedId === ALL_INPUTS || (port && port.id === this.selectedId);
    this.messageCount++;
    this.lastMessage = {
      port: port ? port.name || port.id : '?',
      active,
      data: [...data],
      status,
      channel: (status & 0x0f) + 1,
      type: describeStatus(cmd, d2),
      note: cmd === 0x90 || cmd === 0x80 ? d1 : null,
      velocity: cmd === 0x90 || cmd === 0x80 ? d2 : null,
      timeStamp: e.timeStamp,
      at: Date.now(),
    };
    this.onMessage?.(this.lastMessage);
    if (!active) return;
    if (cmd === 0x90 && d2 > 0) this.onNoteOn?.(d1, d2 / 127, e.timeStamp);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) this.onNoteOff?.(d1, e.timeStamp);
  }
}

export function describeStatus(cmd, d2) {
  switch (cmd) {
    case 0x90: return d2 > 0 ? 'Note On' : 'Note Off';
    case 0x80: return 'Note Off';
    case 0xa0: return 'Poly Pressure';
    case 0xb0: return 'Control Change';
    case 0xc0: return 'Program Change';
    case 0xd0: return 'Channel Pressure';
    case 0xe0: return 'Pitch Bend';
    case 0xf0: return 'System';
    default: return `0x${cmd.toString(16)}`;
  }
}

// PC キーボード → 最低音からの半音数。下段 Z 行が下のオクターブ、上段 Q 行が上のオクターブ。
export const KEY_MAP = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21,
  Digit7: 22, KeyU: 23, KeyI: 24,
};

export function attachComputerKeyboard({ isEnabled, baseNote, onNoteOn, onNoteOff }) {
  const down = new Set();
  const onKeyDown = (e) => {
    if (e.repeat || !isEnabled() || !(e.code in KEY_MAP)) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    const midi = baseNote() + KEY_MAP[e.code];
    if (down.has(e.code)) return;
    down.add(e.code);
    onNoteOn(midi, 0.8);
  };
  const onKeyUp = (e) => {
    if (!(e.code in KEY_MAP) || !down.has(e.code)) return;
    down.delete(e.code);
    onNoteOff(baseNote() + KEY_MAP[e.code]);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    for (const code of down) onNoteOff(baseNote() + KEY_MAP[code]);
    down.clear();
  });
}
