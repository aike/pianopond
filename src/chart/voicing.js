// コードから押さえ方(ボイシング)を決める。
// 形は「左手: ベース 1 音 + 右手: コードトーンの密集和音」。
// ベースはルート(分数コードならその指定音)を鍵盤の一番下のオクターブ(C3〜B3)に置き、
// 右手はその上で、鍵盤の上限(C5)に収まる転回形のうち直前の和音から指の移動が少ないものを選ぶ。

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function movementCost(notes, prev) {
  let cost = 0;
  for (const n of notes) cost += Math.min(...prev.map((p) => Math.abs(n - p)));
  for (const p of prev) cost += Math.min(...notes.map((n) => Math.abs(n - p)));
  return cost;
}

// 戻り値: { bass, right, notes } (notes は bass + right を昇順に並べたもの)
export function voiceChord(chord, prevRight, lo, hi) {
  const bassPc = chord.bass ?? chord.root;
  const bass = lo + ((bassPc - (lo % 12) + 12) % 12);

  let pcs = chord.pcs.slice();
  // 右手は最大 4 音。多い場合は 5 度、次にテンションを落とす。
  if (pcs.length > 4) {
    const fifth = (chord.root + 7) % 12;
    const i = pcs.indexOf(fifth);
    if (i >= 0) pcs.splice(i, 1);
    while (pcs.length > 4) pcs.pop();
  }
  const sorted = [...new Set(pcs)].sort((a, b) => a - b);

  const rhLo = bass + 1;
  const center = (rhLo + hi) / 2 + 2;
  let best = null;
  let bestCost = Infinity;
  const octLo = Math.floor(rhLo / 12) - 1;
  const octHi = Math.floor(hi / 12) + 1;
  for (let r = 0; r < sorted.length; r++) {
    const rot = sorted.slice(r).concat(sorted.slice(0, r));
    for (let oct = octLo; oct <= octHi; oct++) {
      const base = oct * 12 + rot[0];
      const notes = rot.map((pc) => base + ((pc - rot[0] + 12) % 12));
      if (notes[0] < rhLo || notes[notes.length - 1] > hi) continue;
      let cost = prevRight && prevRight.length ? movementCost(notes, prevRight) : 0;
      cost += 0.15 * Math.abs(mean(notes) - center);
      if (notes[0] < bass + 3) cost += 2; // ベースと近すぎる形は避ける
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
    }
  }
  if (!best) {
    // 密集形が収まらない場合の保険: 各音をベースの上 1 オクターブ内に個別に置く
    best = sorted.map((pc) => rhLo + ((pc - (rhLo % 12) + 12) % 12)).sort((a, b) => a - b);
  }
  return { bass, right: best, notes: [bass, ...best] };
}
