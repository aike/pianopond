// 音量スライダー値(0〜1)とゲイン・表示の変換。

// 0 なら完全に無音。それ以外は 2 乗カーブで、下げたときに聴感上もしっかり小さくなるようにする。
export function volumeToGain(v) {
  const x = Number(v);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.min(1, x) ** 2;
}

export function volumeLabel(v) {
  return volumeToGain(v) === 0 ? 'ミュート' : `${Math.round(Math.min(1, Number(v)) * 100)}%`;
}
