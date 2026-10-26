/* Calisthenics Lab v3 — exercise figures.
   Solid silhouette figures drawn from a small pose model (joint angles), rendered as SVG.
   Pure: no DOM access, so it can be loaded in Node for tests. Output contains only
   numbers and fixed markup generated here — never user data.                      */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FIG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Segment lengths in a 100 × 100 box. */
  const L = { torso: 24, neck: 3, head: 6.2, uarm: 12, farm: 11, hand: 3.5, thigh: 16, shin: 15, foot: 6.5 };
  const W = { torso: 12.5, uarm: 7, farm: 6, thigh: 9.5, shin: 7.5, foot: 5 };
  const FLOOR = 86;
  const rad = d => d * Math.PI / 180;
  const pt = (p, deg, len) => [p[0] + Math.cos(rad(deg)) * len, p[1] + Math.sin(rad(deg)) * len];
  const r1 = n => Math.round(n * 10) / 10;

  /* Pose: angles in degrees, 0 = facing right (+x), 90 = down, -90 = up. Figure faces right.
     { hip:[x,y], torso, neck, arms:{l:[shoulder, elbow, hand?], r:[...]}, legs:{l:[hip, knee, foot?], r:[...]},
       ground:true (default) drops the figure so its lowest point sits on the floor, flip:true mirrors it. } */
  function solve(pose) {
    const p = Object.assign({ neck: null, ground: true }, pose);
    const hip = p.hip.slice();
    const sh = pt(hip, p.torso, L.torso);
    const neckDeg = p.neck == null ? p.torso : p.neck;
    const head = pt(pt(sh, neckDeg, L.neck), neckDeg, L.head);
    const arm = a => { if (!a) return null; const el = pt(sh, a[0], L.uarm), hd = pt(el, a[1], L.farm), tip = pt(hd, a[2] == null ? a[1] : a[2], L.hand); return { sh, el, hd, tip }; };
    const leg = g => { if (!g) return null; const kn = pt(hip, g[0], L.thigh), an = pt(kn, g[1], L.shin), toe = pt(an, g[2] == null ? 0 : g[2], L.foot); return { hip, kn, an, toe }; };
    const f = { hip, sh, head, arms: { l: arm(p.arms.l), r: arm(p.arms.r) }, legs: { l: leg(p.legs.l), r: leg(p.legs.r) } };
    // ground: lowest point (including stroke half-width) on the floor line
    const pts = [];
    const push = (q, w) => { if (q) pts.push(q[1] + w / 2); };
    push(hip, W.torso); push(sh, W.torso); pts.push(head[1] + L.head);
    for (const k of ['l', 'r']) { const a = f.arms[k], g = f.legs[k]; if (a) { push(a.el, W.uarm); push(a.hd, W.farm); push(a.tip, W.farm); } if (g) { push(g.kn, W.thigh); push(g.an, W.shin); push(g.toe, W.foot); } }
    const dy = p.ground ? FLOOR - Math.max(...pts) : 0;
    const mv = q => q ? [r1(q[0]), r1(q[1] + dy)] : q;
    const mvA = a => a && { sh: mv(a.sh), el: mv(a.el), hd: mv(a.hd), tip: mv(a.tip) };
    const mvG = g => g && { hip: mv(g.hip), kn: mv(g.kn), an: mv(g.an), toe: mv(g.toe) };
    return { hip: mv(hip), sh: mv(sh), head: mv(head), arms: { l: mvA(f.arms.l), r: mvA(f.arms.r) }, legs: { l: mvG(f.legs.l), r: mvG(f.legs.r) }, flip: !!p.flip };
  }

  function line(a, b, w, cls) { return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke-width="${w}" class="${cls}"/>`; }
  function limbs(side, f, cls) {
    const a = f.arms[side], g = f.legs[side]; let s = '';
    if (g) s += line(g.hip, g.kn, W.thigh, cls) + line(g.kn, g.an, W.shin, cls) + line(g.an, g.toe, W.foot, cls);
    if (a) s += line(a.sh, a.el, W.uarm, cls) + line(a.el, a.hd, W.farm, cls) + line(a.hd, a.tip, W.farm - 1, cls);
    return s;
  }
  /* One frame → SVG group markup (no outer <svg>). */
  function figure(pose) {
    const f = solve(pose);
    let s = '<g stroke-linecap="round" stroke-linejoin="round" fill="none">';
    s += limbs('l', f, 'far');
    s += line(f.hip, f.sh, W.torso, 'near');
    s += `<circle cx="${f.head[0]}" cy="${f.head[1]}" r="${L.head}" class="near" fill="currentColor" stroke="none"/>`;
    s += limbs('r', f, 'near');
    s += '</g>';
    if (f.flip) s = `<g transform="translate(100 0) scale(-1 1)">${s}</g>`;
    return { svg: s, f };
  }

  /* Props, positioned from the solved figure. */
  function prop(kind, f) {
    const g = f.legs, a = f.arms;
    const box = (x1, y1, x2, y2) => `<rect x="${r1(Math.min(x1, x2))}" y="${r1(Math.min(y1, y2))}" width="${r1(Math.abs(x2 - x1))}" height="${r1(Math.abs(y2 - y1))}" rx="2" class="prop"/>`;
    const fx = f.flip ? x => 100 - x : x => x;
    switch (kind) {
      case 'step-feet': { const an = (g.r || g.l).an, toe = (g.r || g.l).toe; const top = Math.max(an[1], toe[1]) + W.foot / 2 - 1; return box(fx(Math.min(an[0], toe[0]) - 8), top, fx(Math.max(an[0], toe[0]) + 8), FLOOR); }
      case 'couch-hands': { const h = (a.r || a.l).tip; return box(fx(h[0] - 7), h[1] + 2.5, fx(h[0] + 12), FLOOR); }
      case 'couch-foot': { const an = (g.l || g.r).an; return box(fx(an[0] - 12), an[1] + 3, fx(an[0] + 6), FLOOR); }
      case 'couch-back': { const sh = f.sh; return box(fx(sh[0] - 16), sh[1] - 2, fx(sh[0] - 3), FLOOR); }
      case 'wall-hands': { const h = (a.r || a.l).tip; return `<line x1="${r1(fx(h[0] + 2))}" y1="8" x2="${r1(fx(h[0] + 2))}" y2="${FLOOR}" stroke-width="3" class="prop"/>`; }
      case 'wall-back': { const sh = f.sh; return `<line x1="${r1(fx(sh[0] - 8))}" y1="8" x2="${r1(fx(sh[0] - 8))}" y2="${FLOOR}" stroke-width="3" class="prop"/>`; }
      case 'post': { const h = (a.r || a.l).tip; return `<line x1="${r1(fx(h[0] + 3))}" y1="6" x2="${r1(fx(h[0] + 3))}" y2="${FLOOR}" stroke-width="3" class="prop"/>`; }
      case 'stairs': { const an = g.r.an; const top = an[1] + W.foot / 2 - 1, rise = FLOOR - top; let s = ''; for (let i = 0; i < 4; i++) s += box(fx(an[0] - 8 + i * 11), top - rise * i, fx(100), FLOOR); return s; }
      default: return '';
    }
  }
  /* Hand-placement inset (top view) for push-up variants. */
  function handsInset(kind) {
    const hand = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="4.2" class="near" fill="currentColor" stroke="none"/>`;
    let s = '';
    const y = 11;
    if (kind === 'wide') s = hand(5, y) + hand(29, y);
    else if (kind === 'close') s = hand(13, y) + hand(21, y);
    else if (kind === 'diamond') s = `<path d="M17 5 L23 11 L17 17 L11 11 Z" class="near" fill="currentColor" stroke="none"/>`;
    else if (kind === 'staggered') s = hand(10, y + 3) + hand(24, y - 3);
    else s = hand(9, y) + hand(25, y);
    return `<g transform="translate(66 4)"><rect x="0" y="0" width="34" height="22" rx="4" class="inset"/><line x1="4" y1="20" x2="30" y2="20" stroke-width="1" class="prop" stroke-dasharray="2 2"/>${s}</g>`;
  }
  function arrow(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const hx = x2 - ux * 4, hy = y2 - uy * 4, px = -uy * 3, py = ux * 3;
    return `<g class="arrow" stroke-width="2.2" stroke-linecap="round" fill="none"><line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(hx)}" y2="${r1(hy)}"/><path d="M${r1(hx + px)} ${r1(hy + py)} L${r1(x2)} ${r1(y2)} L${r1(hx - px)} ${r1(hy - py)}"/></g>`;
  }

  /* ---------------- pose library ---------------- */
  const A = {}; // base poses (facing right)
  A.stand = { hip: [44, 50], torso: -90, arms: { l: [92, 92], r: [88, 88] }, legs: { l: [92, 90, 0], r: [88, 90, 0] } };
  A.standArmsUp = Object.assign({}, A.stand, { arms: { l: [-95, -95], r: [-85, -85] } });
  A.squatTop = Object.assign({}, A.stand, { arms: { l: [-5, -5], r: [-5, -5] } });
  A.squat = { hip: [36, 60], torso: -65, arms: { l: [-8, -8], r: [-8, -8] }, legs: { l: [2, 100, 0], r: [-2, 98, 0] } };
  A.squatDeep = { hip: [34, 66], torso: -62, arms: { l: [-12, -12], r: [-12, -12] }, legs: { l: [-10, 108, 0], r: [-14, 106, 0] } };
  A.lungeTop = Object.assign({}, A.stand, { arms: { l: [92, 92], r: [88, 88] } });
  A.lunge = { hip: [44, 56], torso: -88, arms: { l: [92, 92], r: [88, 88] }, legs: { l: [118, 150, -60], r: [0, 90, 0] } };
  A.pushTop = { hip: [42, 62], torso: -14, arms: { l: [92, 92, 0], r: [88, 88, 0] }, legs: { l: [168, 168, 110], r: [166, 166, 110] } };
  A.pushBottom = { hip: [42, 72], torso: -10, arms: { l: [150, 62, 0], r: [148, 60, 0] }, legs: { l: [172, 172, 110], r: [170, 170, 110] } };
  A.plank = { hip: [42, 62], torso: -14, arms: { l: [96, 0, 0], r: [92, 0, 0] }, legs: { l: [168, 168, 110], r: [166, 166, 110] } };
  A.pikeTop = { hip: [48, 36], torso: 52, neck: 70, arms: { l: [92, 92, 0], r: [88, 88, 0] }, legs: { l: [128, 128, 110], r: [126, 126, 110] } };
  A.pikeBottom = { hip: [48, 40], torso: 58, neck: 80, arms: { l: [138, 70, 0], r: [136, 68, 0] }, legs: { l: [128, 128, 110], r: [126, 126, 110] } };
  A.downDog = { hip: [48, 34], torso: 40, neck: 50, arms: { l: [92, 92, 0], r: [88, 88, 0] }, legs: { l: [118, 118, 100], r: [116, 116, 100] } };
  A.supine = { hip: [52, 78], torso: 180, neck: 185, arms: { l: [178, 178, 180], r: [182, 182, 180] }, legs: { l: [2, 2, 2], r: [-2, -2, -2] } };
  A.supineBent = Object.assign({}, A.supine, { legs: { l: [-62, 62, 0], r: [-66, 66, 0] } });
  A.bridge = { hip: [50, 66], torso: 162, neck: 185, arms: { l: [176, 176, 180], r: [180, 180, 180] }, legs: { l: [-40, 84, 0], r: [-44, 86, 0] } };
  A.deadbugStart = Object.assign({}, A.supine, { arms: { l: [-92, -92, -92], r: [-88, -88, -88] }, legs: { l: [-70, 0, -20], r: [-66, 0, -20] } });
  A.deadbugReach = Object.assign({}, A.supine, { arms: { l: [-92, -92, -92], r: [176, 176, 178] }, legs: { l: [-70, 0, -20], r: [-14, -14, -14] } });
  A.hollow = { hip: [52, 78], torso: 206, neck: 214, arms: { l: [200, 200, 200], r: [204, 204, 204] }, legs: { l: [-22, -22, -22], r: [-26, -26, -26] } };
  A.prone = { hip: [48, 78], torso: 0, neck: -12, arms: { l: [182, 182, 180], r: [178, 178, 180] }, legs: { l: [178, 178, 150], r: [182, 182, 150] } };
  A.proneArmsOver = Object.assign({}, A.prone, { arms: { l: [-2, -2, 0], r: [2, 2, 0] } });
  A.superman = { hip: [48, 78], torso: -20, neck: -26, arms: { l: [-24, -24, -26], r: [-18, -18, -20] }, legs: { l: [198, 198, 170], r: [202, 202, 170] } };
  A.cobra = { hip: [48, 78], torso: -34, neck: -38, arms: { l: [118, 86, 0], r: [112, 84, 0] }, legs: { l: [178, 178, 150], r: [182, 182, 150] } };
  A.quad = { hip: [40, 60], torso: -2, neck: -20, arms: { l: [92, 92, 0], r: [88, 88, 0] }, legs: { l: [92, 180, 180], r: [88, 180, 180] } };
  A.birdDog = Object.assign({}, A.quad, { arms: { l: [-4, -4, -4], r: [88, 88, 0] }, legs: { l: [92, 180, 180], r: [184, 184, 184] } });
  A.catUp = { hip: [40, 60], torso: -20, neck: 30, arms: { l: [100, 100, 0], r: [96, 96, 0] }, legs: { l: [92, 180, 180], r: [88, 180, 180] } };
  A.cowDown = { hip: [40, 60], torso: 10, neck: -40, arms: { l: [92, 92, 0], r: [88, 88, 0] }, legs: { l: [92, 180, 180], r: [88, 180, 180] } };
  A.sidePlank = { hip: [48, 70], torso: -24, neck: -24, arms: { l: [92, 0, 0], r: [-90, -90, -90] }, legs: { l: [156, 156, 90], r: [156, 156, 90] } };
  A.sidePlankDown = { hip: [48, 78], torso: -34, neck: -34, arms: { l: [92, 0, 0], r: [-90, -90, -90] }, legs: { l: [162, 162, 90], r: [162, 162, 90] } };
  A.seated = { hip: [50, 76], torso: -62, arms: { l: [10, -40, -40], r: [14, -36, -36] }, legs: { l: [-28, 60, 0], r: [-32, 62, 0] } };
  A.reversePlank = { hip: [50, 64], torso: 196, neck: 190, arms: { l: [112, 112, 0], r: [108, 108, 0] }, legs: { l: [16, 16, 0], r: [20, 20, 0] } };
  A.kneelHalf = { hip: [44, 62], torso: -90, arms: { l: [92, 92], r: [88, 88] }, legs: { l: [92, 180, 180], r: [-6, 90, 0] } };
  A.hinge = { hip: [44, 56], torso: -20, neck: -30, arms: { l: [60, 60], r: [56, 56] }, legs: { l: [96, 92, 0], r: [92, 90, 0] } };
  A.rdl = { hip: [44, 56], torso: -8, neck: -16, arms: { l: [70, 70], r: [64, 64] }, legs: { l: [176, 176, 110], r: [94, 92, 0] } };
  A.wallSit = { hip: [44, 60], torso: -90, arms: { l: [92, 92], r: [88, 88] }, legs: { l: [2, 90, 0], r: [-2, 90, 0] } };
  A.wallPushTop = { hip: [40, 52], torso: -70, arms: { l: [-18, -18, 0], r: [-14, -14, 0] }, legs: { l: [102, 100, 0], r: [98, 100, 0] } };
  A.wallPushBottom = { hip: [40, 52], torso: -62, arms: { l: [40, -60, 0], r: [44, -56, 0] }, legs: { l: [102, 100, 0], r: [98, 100, 0] } };
  A.inclineTop = { hip: [34, 56], torso: -34, arms: { l: [72, 72, 0], r: [68, 68, 0] }, legs: { l: [150, 150, 100], r: [148, 148, 100] } };
  A.inclineBottom = { hip: [34, 60], torso: -30, arms: { l: [150, 20, 0], r: [148, 18, 0] }, legs: { l: [152, 152, 100], r: [150, 150, 100] } };
  A.kneePushTop = { hip: [44, 66], torso: -36, arms: { l: [92, 92, 0], r: [88, 88, 0] }, legs: { l: [150, 150, 150], r: [148, 148, 150] } };
  A.kneePushBottom = { hip: [44, 72], torso: -24, arms: { l: [150, 60, 0], r: [148, 58, 0] }, legs: { l: [156, 156, 150], r: [154, 154, 150] } };
  A.kneeRaise = Object.assign({}, A.stand, { legs: { l: [92, 90, 0], r: [-2, 90, 0] }, arms: { l: [96, 96], r: [84, 84] } });
  A.calfRaise = { hip: [44, 48], torso: -90, arms: { l: [-30, -30, 0], r: [-30, -30, 0] }, legs: { l: [92, 90, -30], r: [88, 90, -30] } };
  A.march = Object.assign({}, A.stand, { legs: { l: [92, 90, 0], r: [10, 100, 0] }, arms: { l: [120, 30], r: [60, -30] } });
  A.highKnee = Object.assign({}, A.stand, { legs: { l: [96, 90, -20], r: [-20, 100, 0] }, arms: { l: [130, 40], r: [40, -50] } });
  A.jackClosed = { hip: [50, 50], torso: -90, arms: { l: [100, 100], r: [80, 80] }, legs: { l: [96, 92, 180], r: [84, 88, 0] } };
  A.jackOpen = { hip: [50, 50], torso: -90, arms: { l: [-120, -120], r: [-60, -60] }, legs: { l: [112, 108, 180], r: [68, 72, 0] } };
  A.sumo = { hip: [50, 60], torso: -90, arms: { l: [100, 100, 100], r: [80, 80, 80] }, legs: { l: [148, 96, 200], r: [32, 84, -20] } };
  A.sumoTop = { hip: [50, 50], torso: -90, arms: { l: [96, 96], r: [84, 84] }, legs: { l: [114, 96, 200], r: [66, 84, -20] } };
  A.lateral = { hip: [40, 58], torso: -70, arms: { l: [-10, -10], r: [-10, -10] }, legs: { l: [160, 160, 180], r: [10, 100, 0] } };
  A.cossack = { hip: [44, 66], torso: -72, arms: { l: [-5, -5], r: [-5, -5] }, legs: { l: [176, 176, 250], r: [-20, 110, 0] } };
  A.pistol = { hip: [40, 64], torso: -60, arms: { l: [-5, -5], r: [-5, -5] }, legs: { l: [-24, -4, -4], r: [-6, 104, 0] } };
  A.pistolTop = Object.assign({}, A.stand, { legs: { l: [-10, -10, -10], r: [88, 90, 0] }, arms: { l: [-5, -5], r: [-5, -5] } });
  A.skater = { hip: [44, 58], torso: -76, arms: { l: [-160, -160], r: [30, 30] }, legs: { l: [142, 110, 160], r: [12, 100, 0] } };
  A.burpeeDown = { hip: [38, 70], torso: -56, arms: { l: [34, 90, 0], r: [34, 90, 0] }, legs: { l: [-12, 110, 0], r: [-16, 108, 0] } };
  A.jump = { hip: [44, 40], torso: -90, arms: { l: [-95, -95], r: [-85, -85] }, legs: { l: [96, 100, 20], r: [84, 100, 20] }, ground: false };
  A.bearCrawl = { hip: [40, 62], torso: -4, neck: -20, arms: { l: [92, 92, 0], r: [70, 92, 0] }, legs: { l: [110, 170, 110], r: [130, 170, 110] } };
  A.mountain = Object.assign({}, A.pushTop, { legs: { l: [168, 168, 110], r: [150, 60, 0] } });
  A.mountainB = Object.assign({}, A.pushTop, { legs: { l: [150, 60, 0], r: [168, 168, 110] } });
  A.vup = { hip: [50, 76], torso: -62, neck: -62, arms: { l: [-30, -30, -30], r: [-34, -34, -34] }, legs: { l: [-36, -36, -36], r: [-40, -40, -40] } };
  A.sitUp = { hip: [50, 76], torso: -74, arms: { l: [20, 160, 160], r: [20, 160, 160] }, legs: { l: [-62, 62, 0], r: [-66, 66, 0] } };
  A.sitUpDown = Object.assign({}, A.supineBent, { arms: { l: [120, 20, 20], r: [120, 20, 20] } });
  A.crunch = Object.assign({}, A.supineBent, { torso: 200, neck: 216, arms: { l: [220, 40, 40], r: [220, 40, 40] } });
  A.legRaiseUp = Object.assign({}, A.supine, { legs: { l: [-86, -86, -86], r: [-90, -90, -90] } });
  A.legRaiseDown = Object.assign({}, A.supine, { legs: { l: [-12, -12, -12], r: [-16, -16, -16] } });
  A.bentKneeUp = Object.assign({}, A.supine, { legs: { l: [-110, -20, -20], r: [-106, -16, -16] } });
  A.bentKneeDown = Object.assign({}, A.supine, { legs: { l: [-70, 0, 0], r: [-66, 4, 4] } });
  A.flutter = Object.assign({}, A.supine, { legs: { l: [-20, -20, -20], r: [-8, -8, -8] } });
  A.flutterB = Object.assign({}, A.supine, { legs: { l: [-8, -8, -8], r: [-20, -20, -20] } });
  A.bicycle = { hip: [50, 76], torso: 200, neck: 216, arms: { l: [220, 40, 40], r: [220, 40, 40] }, legs: { l: [-10, -10, -10], r: [-96, 10, 10] } };
  A.bicycleB = Object.assign({}, A.bicycle, { legs: { l: [-96, 10, 10], r: [-10, -10, -10] } });
  A.wipers = { hip: [50, 78], torso: 180, neck: 185, arms: { l: [176, 176, 176], r: [184, 184, 184] }, legs: { l: [-92, -2, -2], r: [-88, 2, 2] } };
  A.wipersSide = Object.assign({}, A.wipers, { legs: { l: [-40, 50, 50], r: [-36, 54, 54] } });
  A.heelTouch = Object.assign({}, A.supineBent, { torso: 196, neck: 210, arms: { l: [-6, -6, 0], r: [-2, -2, 0] } });
  A.twist = Object.assign({}, A.seated, { torso: -58, arms: { l: [-20, -20, -20], r: [-20, -20, -20] } });
  A.twistB = Object.assign({}, A.seated, { torso: -58, arms: { l: [140, 170, 170], r: [140, 170, 170] } });
  A.reverseCrunchUp = Object.assign({}, A.supine, { hip: [52, 74], torso: 176, legs: { l: [-120, -30, -30], r: [-116, -26, -26] } });
  A.kneelTall = { hip: [44, 62], torso: -90, arms: { l: [92, 92], r: [88, 88] }, legs: { l: [92, 180, 180], r: [88, 180, 180] } };
  A.childPose = { hip: [44, 70], torso: -30, neck: 0, arms: { l: [-10, -10, 0], r: [-6, -6, 0] }, legs: { l: [160, 180, 180], r: [160, 180, 180] } };
  A.splitTop = { hip: [44, 52], torso: -90, arms: { l: [92, 92], r: [88, 88] }, legs: { l: [130, 100, 0], r: [40, 100, 0] } };
  A.pigeon = { hip: [44, 72], torso: -70, neck: -60, arms: { l: [60, 60, 0], r: [56, 56, 0] }, legs: { l: [176, 176, 150], r: [20, 180, 180] } };
  A.goodMorningTop = Object.assign({}, A.stand, { arms: { l: [-150, 30], r: [-150, 30] } });
  A.goodMorning = { hip: [46, 56], torso: -20, neck: -30, arms: { l: [-120, 60], r: [-120, 60] }, legs: { l: [96, 92, 0], r: [92, 90, 0] } };
  A.wallSlideDown = { hip: [44, 52], torso: -90, arms: { l: [0, -90, -90], r: [0, -90, -90] }, legs: { l: [96, 90, 0], r: [84, 90, 0] } };
  A.wallSlideUp = Object.assign({}, A.wallSlideDown, { arms: { l: [-70, -90, -90], r: [-70, -90, -90] } });
  A.frog = Object.assign({}, A.bridge, { legs: { l: [-10, 70, 0], r: [-60, 100, 0] } });
  A.frogDown = Object.assign({}, A.supineBent, { legs: { l: [-10, 70, 0], r: [-60, 100, 0] } });
  A.hipThrust = { hip: [50, 60], torso: 180, neck: 200, arms: { l: [120, 120, 120], r: [116, 116, 116] }, legs: { l: [-36, 84, 0], r: [-40, 86, 0] } };
  A.hipThrustDown = { hip: [50, 74], torso: 160, neck: 190, arms: { l: [120, 120, 120], r: [116, 116, 116] }, legs: { l: [-60, 70, 0], r: [-64, 72, 0] } };
  A.bridgeMarch = Object.assign({}, A.bridge, { legs: { l: [-40, 84, 0], r: [-70, 30, 30] } });
  A.slBridge = Object.assign({}, A.bridge, { legs: { l: [-40, 84, 0], r: [-30, -30, -30] } });
  A.slBridgeDown = Object.assign({}, A.supineBent, { legs: { l: [-62, 62, 0], r: [-30, -30, -30] } });
  A.proneW = Object.assign({}, A.prone, { torso: -8, neck: -14, arms: { l: [220, 160, 160], r: [214, 154, 154] } });
  A.proneWDown = Object.assign({}, A.prone, { arms: { l: [190, 150, 150], r: [186, 146, 146] } });
  A.proneT = Object.assign({}, A.prone, { torso: -8, neck: -14, arms: { l: [-100, -100, -100], r: [-80, -80, -80] } });
  A.proneY = Object.assign({}, A.prone, { torso: -8, neck: -14, arms: { l: [-24, -24, -24], r: [-18, -18, -18] } });
  A.proneAngelsDown = Object.assign({}, A.prone, { arms: { l: [172, 172, 170], r: [168, 168, 170] } });
  A.swimmers = Object.assign({}, A.prone, { torso: -6, neck: -14, arms: { l: [-18, -18, -18], r: [2, 2, 0] }, legs: { l: [178, 178, 150], r: [196, 196, 160] } });
  A.latPull = Object.assign({}, A.prone, { torso: -8, neck: -14, arms: { l: [150, 10, 10], r: [146, 6, 6] } });
  A.scapTop = Object.assign({}, A.pushTop, { torso: -10 });
  A.scapDown = Object.assign({}, A.pushTop, { hip: [42, 66], torso: -20 });
  A.planche = { hip: [40, 62], torso: -8, arms: { l: [122, 122, 0], r: [118, 118, 0] }, legs: { l: [168, 168, 110], r: [166, 166, 110] } };
  A.shoulderTap = Object.assign({}, A.pushTop, { arms: { l: [92, 92, 0], r: [170, 50, 50] } });
  A.archer = { hip: [42, 70], torso: -10, arms: { l: [172, 172, 180], r: [150, 60, 0] }, legs: { l: [172, 172, 110], r: [170, 170, 110] } };
  A.hindu = Object.assign({}, A.cobra, { torso: -40, arms: { l: [96, 96, 0], r: [92, 92, 0] } });
  A.upDownsLow = A.plank;
  A.upDownsMid = Object.assign({}, A.pushTop, { arms: { l: [96, 0, 0], r: [88, 88, 0] } });
  A.thoracicDown = Object.assign({}, A.quad, { arms: { l: [92, 92, 0], r: [30, 160, 160] } });
  A.thoracicUp = Object.assign({}, A.quad, { torso: -12, neck: -60, arms: { l: [92, 92, 0], r: [-70, -160, -160] } });
  A.wgsLunge = { hip: [44, 62], torso: -40, neck: -40, arms: { l: [70, 70, 0], r: [66, 66, 0] }, legs: { l: [160, 180, 180], r: [-10, 94, 0] } };
  A.wgsReach = { hip: [44, 62], torso: -50, neck: -70, arms: { l: [70, 70, 0], r: [-80, -80, -80] }, legs: { l: [160, 180, 180], r: [-10, 94, 0] } };
  A.ninety = { hip: [50, 76], torso: -84, arms: { l: [60, 60, 0], r: [56, 56, 0] }, legs: { l: [-4, 90, 0], r: [180, 90, 0] } };
  A.deepSquat = { hip: [36, 70], torso: -70, arms: { l: [-10, 80, 0], r: [-10, 80, 0] }, legs: { l: [-20, 112, 0], r: [-24, 110, 0] } };
  A.shadow = { hip: [44, 54], torso: -84, arms: { l: [-10, -10, -10], r: [20, 150, 150] }, legs: { l: [108, 96, 0], r: [72, 84, 0] } };
  A.walk = { hip: [44, 52], torso: -88, arms: { l: [110, 110], r: [70, 70] }, legs: { l: [110, 100, 0], r: [70, 84, 0] } };
  A.walkB = { hip: [44, 52], torso: -88, arms: { l: [70, 70], r: [110, 110] }, legs: { l: [70, 84, 0], r: [110, 100, 0] } };
  A.marchB = Object.assign({}, A.stand, { legs: { l: [10, 100, 0], r: [92, 90, 0] }, arms: { l: [60, -30], r: [120, 30] } });
  A.stairs = { hip: [40, 52], torso: -82, arms: { l: [110, 110], r: [70, 70] }, legs: { l: [104, 96, 0], r: [20, 96, 0] } };
  A.armCircle = Object.assign({}, A.stand, { arms: { l: [-100, -100], r: [-80, -80] } });
  A.hipFlexor = { hip: [44, 60], torso: -92, arms: { l: [92, 92], r: [88, 88] }, legs: { l: [110, 190, 190], r: [-16, 90, 0] } };
  A.angelOver = Object.assign({}, A.prone, { torso: -4, arms: { l: [-4, -4, 0], r: [0, 0, 0] } });

  const flip = p => Object.assign({}, p, { flip: true });
  /* Frames per exercise: [pose, label]. Optional props/hands/arrows. */
  const POSES = {
    'standard-push-ups': { frames: [[A.pushTop, 'Top'], [A.pushBottom, 'Lower'], [A.pushTop, 'Press']], hands: 'standard' },
    'decline-push-ups': { frames: [[Object.assign({}, A.pushTop, { hip: [44, 52], torso: 2, legs: { l: [184, 184, 100], r: [182, 182, 100] } }), 'Feet up'], [Object.assign({}, A.pushBottom, { hip: [44, 64], torso: 10, legs: { l: [188, 188, 100], r: [186, 186, 100] } }), 'Lower']], props: ['step-feet'], hands: 'standard' },
    'wide-push-ups': { frames: [[A.pushTop, 'Top'], [A.pushBottom, 'Lower']], hands: 'wide' },
    'pike-push-ups': { frames: [[A.pikeTop, 'Hips high'], [A.pikeBottom, 'Head down']] },
    'close-grip-push-ups': { frames: [[A.pushTop, 'Top'], [A.pushBottom, 'Elbows in']], hands: 'close' },
    'tempo-push-ups': { frames: [[A.pushTop, '3 s down'], [A.pushBottom, 'Pause 1 s'], [A.pushTop, 'Press']], hands: 'standard' },
    'staggered-push-ups': { frames: [[A.pushTop, 'Top'], [A.pushBottom, 'Lower']], hands: 'staggered' },
    'diamond-push-ups': { frames: [[A.pushTop, 'Top'], [A.pushBottom, 'Lower']], hands: 'diamond' },
    'wall-push-ups': { frames: [[A.wallPushTop, 'Lean'], [A.wallPushBottom, 'Chest in']], props: ['wall-hands'] },
    'incline-push-ups': { frames: [[A.inclineTop, 'Top'], [A.inclineBottom, 'Lower']], props: ['couch-hands'] },
    'knee-push-ups': { frames: [[A.kneePushTop, 'Top'], [A.kneePushBottom, 'Lower']] },
    'archer-push-ups': { frames: [[A.pushTop, 'Wide'], [A.archer, 'One side'], [flip(A.archer), 'Other side']], hands: 'wide' },
    'hindu-push-ups': { frames: [[A.downDog, 'Start'], [A.pushBottom, 'Dive'], [A.hindu, 'Chest up']] },
    'plank-up-downs': { frames: [[A.plank, 'Forearms'], [A.upDownsMid, 'One hand'], [A.pushTop, 'Both']] },
    'pseudo-planche-lean': { frames: [[A.pushTop, 'Start'], [A.planche, 'Lean & hold']] },
    'scapular-push-ups': { frames: [[A.scapTop, 'Push away'], [A.scapDown, 'Squeeze']] },
    'bodyweight-squats': { frames: [[A.squatTop, 'Stand'], [A.squat, 'Sit back']] },
    'pause-squats': { frames: [[A.squatTop, 'Stand'], [A.squat, 'Hold 2 s']] },
    'sumo-squats': { frames: [[A.sumoTop, 'Wide'], [A.sumo, 'Down']] },
    'jump-squats': { frames: [[A.squat, 'Load'], [A.jump, 'Jump'], [A.squat, 'Land soft']] },
    'wall-sit': { frames: [[A.wallSit, 'Hold']], props: ['wall-back'] },
    'reverse-lunges': { frames: [[A.lungeTop, 'Stand'], [flip(A.lunge), 'Step back']] },
    'forward-lunges': { frames: [[A.lungeTop, 'Stand'], [A.lunge, 'Step forward']] },
    'walking-lunges': { frames: [[A.lunge, 'Lunge'], [A.lungeTop, 'Step through'], [A.lunge, 'Lunge']] },
    'curtsy-lunges': { frames: [[A.lungeTop, 'Stand'], [flip(A.lunge), 'Back & across']] },
    'split-squats': { frames: [[A.splitTop, 'Long stance'], [A.lunge, 'Straight down']] },
    'bulgarian-split-squats': { frames: [[{ hip: [48, 52], torso: -90, arms: { l: [92, 92], r: [88, 88] }, legs: { l: [138, 192, 200], r: [62, 102, 0] } }, 'Rear foot up'], [{ hip: [48, 60], torso: -84, arms: { l: [92, 92], r: [88, 88] }, legs: { l: [118, 196, 200], r: [8, 96, 0] } }, 'Lower']], props: ['couch-foot'] },
    'lateral-lunges': { frames: [[A.stand, 'Feet together'], [A.lateral, 'Step wide, sit']] },
    'cossack-squats': { frames: [[A.sumoTop, 'Wide'], [A.cossack, 'Sit to one side']] },
    'assisted-pistol-squats': { frames: [[A.pistolTop, 'One leg'], [A.pistol, 'Lower']], props: ['post'] },
    'calf-raises': { frames: [[A.stand, 'Flat'], [A.calfRaise, 'Rise']] },
    'single-leg-calf-raises': { frames: [[Object.assign({}, A.stand, { legs: { l: [110, 110, 90], r: [88, 90, 0] } }), 'One foot'], [Object.assign({}, A.calfRaise, { legs: { l: [110, 110, 90], r: [88, 90, -30] } }), 'Rise']] },
    'skater-hops': { frames: [[A.skater, 'Land left'], [flip(A.skater), 'Bound right']] },
    'single-leg-rdl': { frames: [[A.stand, 'One leg'], [A.rdl, 'Hinge']] },
    'glute-bridges': { frames: [[A.supineBent, 'Feet flat'], [A.bridge, 'Drive up']] },
    'glute-bridge-march': { frames: [[A.bridge, 'Hold'], [A.bridgeMarch, 'Lift one']] },
    'single-leg-glute-bridges': { frames: [[A.slBridgeDown, 'One leg out'], [A.slBridge, 'Drive up']] },
    'supermans': { frames: [[A.proneArmsOver, 'Face down'], [A.superman, 'Lift']] },
    'good-mornings': { frames: [[A.goodMorningTop, 'Stand'], [A.goodMorning, 'Hips back']] },
    'frog-pumps': { frames: [[A.frogDown, 'Soles together'], [A.frog, 'Pump up']] },
    'hip-thrusts': { frames: [[A.hipThrustDown, 'Back on couch'], [A.hipThrust, 'Drive up']], props: ['couch-back'] },
    'reverse-plank': { frames: [[A.seated, 'Sit'], [A.reversePlank, 'Lift & hold']] },
    'rows': { frames: [[A.supine, 'Under the edge'], [A.bridge, 'Pull']] },
    'prone-swimmers': { frames: [[A.swimmers, 'Opposite lift'], [flip(A.swimmers), 'Switch']] },
    'reverse-snow-angels': { frames: [[A.proneAngelsDown, 'Arms at hips'], [A.proneT, 'Sweep'], [A.angelOver, 'Overhead']] },
    'prone-ytw-raises': { frames: [[A.proneY, 'Y'], [A.proneT, 'T'], [A.proneW, 'W']] },
    'prone-w-raises': { frames: [[A.proneWDown, 'Relax'], [A.proneW, 'Squeeze']] },
    'prone-cobra-hold': { frames: [[A.prone, 'Face down'], [Object.assign({}, A.proneW, { arms: { l: [196, 196, 196], r: [192, 192, 192] } }), 'Lift & hold']] },
    'prone-lat-pulls': { frames: [[A.proneArmsOver, 'Reach'], [A.latPull, 'Pull']] },
    'wall-slides': { frames: [[A.wallSlideDown, 'Goalpost'], [A.wallSlideUp, 'Slide up']], props: ['wall-back'] },
    'plank': { frames: [[A.plank, 'Hold']] },
    'plank-shoulder-taps': { frames: [[A.pushTop, 'Wide feet'], [A.shoulderTap, 'Tap']] },
    'mountain-climbers': { frames: [[A.mountain, 'Knee in'], [A.mountainB, 'Switch']] },
    'bicycle-crunches': { frames: [[A.bicycle, 'Elbow to knee'], [A.bicycleB, 'Switch']] },
    'flutter-kicks': { frames: [[A.flutter, 'Scissor'], [A.flutterB, 'Scissor']] },
    'straight-leg-raises': { frames: [[A.legRaiseUp, 'Vertical'], [A.legRaiseDown, 'Lower slowly']] },
    'bent-knee-leg-raises': { frames: [[A.bentKneeDown, 'Knees bent'], [A.bentKneeUp, 'Lift']] },
    'v-ups': { frames: [[A.supine, 'Flat'], [A.vup, 'Fold']] },
    'sit-ups': { frames: [[A.sitUpDown, 'Lie back'], [A.sitUp, 'Curl up']] },
    'crunches': { frames: [[A.supineBent, 'Lie back'], [A.crunch, 'Curl']] },
    'russian-twists': { frames: [[A.twist, 'One side'], [A.twistB, 'Other side']] },
    'hollow-hold': { frames: [[A.hollow, 'Hold']] },
    'hollow-rocks': { frames: [[A.hollow, 'Rock back'], [Object.assign({}, A.hollow, { torso: 218, neck: 226, legs: { l: [-34, -34, -34], r: [-38, -38, -38] } }), 'Rock forward']] },
    'side-plank': { frames: [[A.sidePlank, 'Hold']] },
    'side-plank-dips': { frames: [[A.sidePlank, 'Up'], [A.sidePlankDown, 'Dip']] },
    'windshield-wipers': { frames: [[A.wipers, 'Knees up'], [A.wipersSide, 'To one side']] },
    'heel-touches': { frames: [[A.heelTouch, 'Reach'], [flip(A.heelTouch), 'Other side']] },
    'bear-crawl': { frames: [[A.bearCrawl, 'Knees low'], [Object.assign({}, A.bearCrawl, { arms: { l: [70, 92, 0], r: [92, 92, 0] }, legs: { l: [130, 170, 110], r: [110, 170, 110] } }), 'Step']] },
    'reverse-crunches': { frames: [[A.bentKneeDown, 'Shins level'], [A.reverseCrunchUp, 'Curl']] },
    'dead-bugs': { frames: [[A.deadbugStart, 'Arms up'], [A.deadbugReach, 'Reach']] },
    'bird-dogs': { frames: [[A.quad, 'All fours'], [A.birdDog, 'Reach']] },
    'standing-knee-raises': { frames: [[A.stand, 'Tall'], [A.kneeRaise, 'Knee up']] },
    'jumping-jacks': { frames: [[A.jackClosed, 'In'], [A.jackOpen, 'Out']] },
    'high-knees': { frames: [[A.highKnee, 'Drive'], [Object.assign({}, A.highKnee, { legs: { l: [-20, 100, 0], r: [96, 90, -20] }, arms: { l: [40, -50], r: [130, 40] } }), 'Switch']] },
    'burpees': { frames: [[A.burpeeDown, 'Hands down'], [A.pushTop, 'Feet back'], [A.jump, 'Up']] },
    'squat-thrusts': { frames: [[A.burpeeDown, 'Hands down'], [A.pushTop, 'Feet back'], [A.stand, 'Stand']] },
    'shadowboxing': { frames: [[A.shadow, 'Jab'], [Object.assign({}, A.shadow, { arms: { l: [20, 150, 150], r: [-10, -10, -10] } }), 'Cross']] },
    'walk-or-shadowbox': { frames: [[A.walk, 'Walk'], [A.shadow, 'or box']] },
    'brisk-walking': { frames: [[A.walk, 'Brisk'], [A.walkB, 'pace']] },
    'comfortable-walking': { frames: [[A.walk, 'Easy']] },
    'march-in-place': { frames: [[A.march, 'March'], [A.marchB, '']] },
    'stair-climbing': { frames: [[A.stairs, 'Up']], props: ['stairs'] },
    'cobra-press-ups': { frames: [[A.prone, 'Face down'], [A.cobra, 'Press up']] },
    'cat-cow': { frames: [[A.catUp, 'Cat'], [A.cowDown, 'Cow']] },
    'hip-mobility': { frames: [[A.ninety, '90/90'], [A.deepSquat, 'Deep squat']] },
    'worlds-greatest-stretch': { frames: [[A.wgsLunge, 'Elbow down'], [A.wgsReach, 'Rotate up']] },
    'thoracic-rotations': { frames: [[A.thoracicDown, 'Elbow under'], [A.thoracicUp, 'Open up']] },
    'down-dog-to-cobra': { frames: [[A.downDog, 'Down dog'], [A.cobra, 'Cobra']] },
    'deep-squat-hold': { frames: [[A.deepSquat, 'Hold']] },
    'hip-flexor-stretch': { frames: [[A.kneelHalf, 'Half kneel'], [A.hipFlexor, 'Shift forward']] },
    'pigeon-stretch': { frames: [[A.pigeon, 'Hold']] },
    'arm-circles': { frames: [[A.stand, 'Arms out'], [A.armCircle, 'Circle']] },
    'child-pose-reach': { frames: [[A.kneelTall, 'Kneel'], [A.childPose, 'Reach']] }
  };

  const FRAME_W = 100;
  function frameSvg(exId, i) {
    const spec = POSES[exId]; if (!spec) return '';
    const [pose] = spec.frames[i] || spec.frames[0];
    const { svg, f } = figure(pose);
    let s = `<line x1="4" y1="${FLOOR + 3.5}" x2="96" y2="${FLOOR + 3.5}" stroke-width="1.5" class="floor"/>`;
    for (const k of (spec.props || [])) s += prop(k, f);
    s += svg;
    if (spec.hands && i === 0) s += handsInset(spec.hands);
    return s;
  }
  /* Full strip: all frames side by side with labels and an arrow between them. */
  function strip(exId, opts) {
    opts = opts || {};
    const spec = POSES[exId]; if (!spec) return '';
    const n = spec.frames.length, w = n * FRAME_W + (n - 1) * 6, h = 100 + (opts.labels === false ? 0 : 10);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" class="fig" role="img" aria-label="${attr(opts.name || exId)}">`;
    for (let i = 0; i < n; i++) {
      const x = i * (FRAME_W + 6);
      s += `<g transform="translate(${x} 0)">${frameSvg(exId, i)}`;
      if (opts.labels !== false && spec.frames[i][1]) s += `<text x="50" y="${h - 1}" text-anchor="middle" class="flabel">${attr(spec.frames[i][1])}</text>`;
      s += '</g>';
      if (i < n - 1) s += `<g transform="translate(${x + FRAME_W - 2} 0)">${arrow(-8, 50, 12, 50)}</g>`;
    }
    return s + '</svg>';
  }
  function attr(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  /* First frame only — a thumbnail. */
  function thumb(exId, opts) { const spec = POSES[exId]; if (!spec) return ''; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="fig" aria-hidden="true">${frameSvg(exId, (opts && opts.frame) || 0)}</svg>`; }
  function has(exId) { return !!POSES[exId]; }
  function frameCount(exId) { return POSES[exId] ? POSES[exId].frames.length : 0; }

  return { strip, thumb, has, frameCount, solve, POSES, FLOOR };
});
