/* ============ utils ============ */
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const sum = arr => arr.reduce((a, b) => a + b, 0);
const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));

export const EMOTIONS = [
  { key: 'joy',      cn: '喜悦', en: 'Joy',      v: '--joy' },
  { key: 'calm',     cn: '平静', en: 'Calm',     v: '--calm' },
  { key: 'sadness',  cn: '悲伤', en: 'Sadness',  v: '--sadness' },
  { key: 'anger',    cn: '愤怒', en: 'Anger',    v: '--anger' },
  { key: 'fear',     cn: '忧虑', en: 'Anxiety',  v: '--fear' },
  { key: 'surprise', cn: '惊讶', en: 'Surprise', v: '--surprise' }
];
const EKEY = EMOTIONS.map(e => e.key);

export const cssVar = name =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const emoColor = e => cssVar(e.v);

/* 词典 */
const LEX = {
  joy: ['开心','高兴','快乐','幸福','喜欢','热爱','满足','满意','期待','骄傲','成就','顺利','完美','棒','优秀','赞','漂亮','成功','谢谢','温暖','放松','兴奋','惊喜','爽','爱','美好','太棒','happy','joy','love','great','good','nice','awesome','excellent','perfect','amazing','wonderful','glad','excited','proud','fantastic'],
  calm: ['平静','安静','舒服','宁静','轻松','安稳','踏实','从容','安逸','calm','relax','peaceful','quiet','serene','comfortable','easy'],
  sadness: ['难过','伤心','失望','孤独','哭','累','疲惫','痛苦','心碎','遗憾','沮丧','低落','委屈','无望','sad','lonely','cry','tired','exhausted','depressed','disappointed','sorrow','hurt','miss'],
  anger: ['愤怒','生气','气死','讨厌','烦','该死','可恶','恼火','火大','受不了','离谱','垃圾','angry','mad','hate','annoying','furious','rage','disgusting','ridiculous'],
  fear: ['害怕','恐惧','担心','焦虑','紧张','不安','慌','怕','压力','忐忑','afraid','fear','worried','anxious','nervous','scared','panic','stress'],
  surprise: ['惊讶','震惊','意外','没想到','居然','竟然','哇','天呐','离谱','surprise','shock','wow','unexpected','unbelievable','whoa']
};

function distFromVA(v, a){
  const d = {
    joy:      1.00 * gauss(v, 0.60, 0.42) * gauss(a, 0.62, 0.40),
    calm:     1.50 * gauss(v, 0.30, 0.52) * gauss(a, 0.16, 0.26),
    sadness:  0.95 * gauss(v,-0.62, 0.42) * gauss(a, 0.26, 0.30),
    anger:    1.25 * gauss(v,-0.66, 0.40) * gauss(a, 0.84, 0.30),
    fear:     0.95 * gauss(v,-0.45, 0.40) * gauss(a, 0.58, 0.28),
    surprise: 1.05 * gauss(v, 0.10, 0.46) * gauss(a, 0.90, 0.28)
  };
  return normalize(d, 0.010);
}
function normalize(d, floor = 0.008, power = 1.35){
  let t = 0;
  const o = {};
  for (const k of EKEY){
    o[k] = Math.pow(Math.max(d[k] || 0, 0) + floor, power);
    t += o[k];
  }
  for (const k of EKEY) o[k] /= t;
  return o;
}
function mix(a, b, w){
  const o = {};
  for (const k of EKEY) o[k] = a[k] * (1 - w) + b[k] * w;
  return normalize(o);
}

/* ============ TEXT ============ */
const POS_WORDS = ['开心','高兴','快乐','幸福','喜欢','满意','好','棒','不错','成功','顺利','happy','good','love','great','nice'];
const NEG_FALSE_PREFIX = '特分区别级个性派送惜告离道差鉴辨作类';

function hasNegation(low){
  const NEGS = ['不','没','别','无','未','不是','没有','not ','never ',"n't"];
  for (const ng of NEGS){
    let i = low.indexOf(ng);
    while (i !== -1){
      const prev = i > 0 ? low[i - 1] : '';
      if (!NEG_FALSE_PREFIX.includes(prev)){
        const win = low.slice(i + ng.length, i + ng.length + 7);
        if (POS_WORDS.some(w => win.includes(w))) return true;
      }
      i = low.indexOf(ng, i + 1);
    }
  }
  return false;
}

export function analyzeText(raw){
  const text = raw.trim();
  const low = text.toLowerCase();
  const counts = { joy:0, calm:0, sadness:0, anger:0, fear:0, surprise:0 };
  const hits = [];

  for (const key of Object.keys(LEX)){
    for (const w of LEX[key]){
      let i = low.indexOf(w);
      while (i !== -1){
        counts[key]++;
        if (hits.length < 10 && !hits.includes(w)) hits.push(w);
        i = low.indexOf(w, i + w.length);
      }
    }
  }

  const pos = counts.joy + counts.calm;
  const neg = counts.sadness + counts.anger + counts.fear;
  const negated = hasNegation(low);

  let valence = Math.tanh((pos - neg) / 2.0);
  if (negated){
    valence = valence * 0.35 - 0.4;
    const j = counts.joy + counts.calm;
    counts.joy = 0; counts.calm = 0;
    counts.sadness += j * 0.7;
    counts.fear += j * 0.3;
  }

  const excl  = (text.match(/[!！]/g) || []).length;
  const ques  = (text.match(/[?？]/g) || []).length;
  const upperR = (text.match(/[A-Z]/g) || []).length / Math.max(1, text.length);
  const emoji = (text.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu) || []).length;
  const emph  = (text.match(/(真的|超级|特别|非常|太|极其|absolutely|really|so\s)/g) || []).length;

  let arousal = 0.30
    + Math.min(0.28, excl * 0.075)
    + Math.min(0.10, ques * 0.03)
    + Math.min(0.16, upperR * 1.4)
    + Math.min(0.14, emoji * 0.07)
    + Math.min(0.14, emph * 0.045)
    + Math.min(0.12, (counts.anger + counts.fear + counts.surprise) * 0.035);
  arousal = clamp(arousal, 0.06, 0.97);
  valence = clamp(valence, -1, 1);

  let dist = distFromVA(valence, arousal);
  const total = sum(EKEY.map(k => counts[k]));
  if (total > 0){
    const kw = normalize(Object.fromEntries(EKEY.map(k => [k, counts[k] / total * 0.85])));
    dist = mix(dist, kw, 0.42);
  }

  return { ok: true, valence, arousal, dist, meta: { hits, words: total, chars: text.length } };
}

/* ============ IMAGE ============ */
export function analyzeImage(img){
  const S = 88;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const scale = Math.max(S / img.width, S / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
  const px = ctx.getImageData(0, 0, S, S).data;

  let sv = 0, ss = 0, warm = 0, cool = 0, n = 0;
  const vs = [];
  for (let i = 0; i < px.length; i += 4){
    const r = px[i] / 255, g = px[i+1] / 255, b = px[i+2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const v = mx;
    const s = mx <= 0.001 ? 0 : (mx - mn) / mx;
    sv += v; ss += s; vs.push(v); n++;

    const dd = mx - mn;
    let hue = 0;
    if (dd > 0.002){
      if (mx === r) hue = 60 * (((g - b) / dd) % 6);
      else if (mx === g) hue = 60 * ((b - r) / dd + 2);
      else hue = 60 * ((r - g) / dd + 4);
    }
    if (hue < 0) hue += 360;
    if (hue >= 330 || hue < 70) warm++;
    if (hue >= 165 && hue < 290) cool++;
  }
  const mv = sv / n, ms = ss / n;
  const warmR = warm / n, coolR = cool / n;
  const mean = sum(vs) / vs.length;
  const contrast = Math.sqrt(sum(vs.map(v => (v - mean) ** 2)) / vs.length);

  const valence = clamp(
    (mv - 0.44) * 1.5 + (warmR - 0.26) * 1.05 + (ms - 0.34) * 0.55 - (coolR - 0.16) * 0.35,
    -1, 1
  );
  const arousal = clamp(ms * 0.85 + contrast * 1.25 + Math.abs(mv - 0.5) * 0.35, 0.07, 0.97);

  let dist = distFromVA(valence, arousal);
  if (warmR > 0.45) dist = mix(dist, { joy:0.42, anger:0.28, calm:0.1, sadness:0.06, fear:0.08, surprise:0.06 }, 0.25);
  if (coolR > 0.4)  dist = mix(dist, { calm:0.34, sadness:0.3, joy:0.1, anger:0.06, fear:0.13, surprise:0.07 }, 0.25);
  if (mv < 0.22)    dist = mix(dist, { sadness:0.4, fear:0.3, calm:0.12, joy:0.06, anger:0.07, surprise:0.05 }, 0.28);

  return {
    ok: true, valence, arousal, dist,
    meta: { brightness: round(mv), saturation: round(ms), warm: round(warmR), cool: round(coolR), contrast: round(contrast) }
  };
}

/* ============ AUDIO ============ */
export async function analyzeAudio(file){
  try {
    const buf = await file.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    const decoded = await new Promise((res, rej) => {
      let p;
      try { p = ac.decodeAudioData(buf, res, rej); } catch(e){ rej(e); }
      if (p && typeof p.then === 'function') p.then(res).catch(rej);
    });

    let data = decoded.getChannelData(0);
    const sr = decoded.sampleRate;
    const maxLen = Math.min(data.length, sr * 45);
    data = data.subarray(0, maxLen);

    const frame = Math.max(1, Math.floor(sr * 0.04));
    const frames = [];
    for (let i = 0; i + frame < data.length; i += frame){
      let s = 0;
      for (let j = i; j < i + frame; j++) s += data[j] * data[j];
      frames.push(Math.sqrt(s / frame));
    }
    const meanE = sum(frames) / Math.max(1, frames.length);
    const varr = sum(frames.map(v => (v - meanE) ** 2)) / Math.max(1, frames.length);
    const dyn = Math.sqrt(varr) / (meanE + 1e-6);

    let zc = 0, cnt = 0;
    const step = 4;
    for (let i = 0; i + step < data.length; i += step){
      if ((data[i] >= 0) !== (data[i + step] >= 0)) zc++;
      cnt++;
    }
    const zcr = zc / Math.max(1, cnt);

    const dur = decoded.duration;
    const arousal = clamp(
      0.18 + Math.min(0.42, meanE * 6.5) + Math.min(0.22, dyn * 0.28) + Math.min(0.16, zcr * 1.1),
      0.07, 0.97
    );
    const valence = clamp(0.28 - dyn * 0.22 + (meanE * 4 - 0.35) * 0.42 - (zcr - 0.06) * 1.6, -1, 1);

    let dist = distFromVA(valence, arousal);
    if (dyn > 0.9) dist = mix(dist, { anger:0.32, surprise:0.28, fear:0.2, joy:0.1, sadness:0.06, calm:0.04 }, 0.3);
    if (meanE < 0.012) dist = mix(dist, { calm:0.4, sadness:0.34, fear:0.12, joy:0.06, anger:0.04, surprise:0.04 }, 0.35);

    ac.close && ac.close();
    return {
      ok: true, valence, arousal, dist,
      meta: { duration: dur, energy: round(meanE, 4), dynamics: round(dyn), zcr: round(zcr, 4), sampleRate: sr, frames }
    };
  } catch (e){
    return { ok: false, error: '音频解码失败' };
  }
}

/* ============ FUSION ============ */
const BASE_W = { text: 0.50, image: 0.28, audio: 0.22 };
export const WEIGHTS_TEXT = '文本 50 · 视觉 28 · 语音 22';

export function fuse(mods){
  const active = Object.keys(BASE_W).filter(k => mods[k]);
  if (!active.length) return null;

  const wsum = sum(active.map(k => BASE_W[k]));
  const weight = {};
  active.forEach(k => weight[k] = BASE_W[k] / wsum);

  const dist = Object.fromEntries(EKEY.map(k => [k, 0]));
  let valence = 0, arousal = 0;
  active.forEach(k => {
    const m = mods[k];
    EKEY.forEach(e => dist[e] += m.dist[e] * weight[k]);
    valence += m.valence * weight[k];
    arousal += m.arousal * weight[k];
  });

  const nd = normalize(dist);
  const pmax = Math.max(...EKEY.map(k => nd[k]));
  const top = EKEY.reduce((a, k) => nd[k] > nd[a] ? k : a, EKEY[0]);

  let cons = 1;
  if (active.length > 1){
    cons = 0;
    active.forEach(k => {
      const a = EKEY.map(e => mods[k].dist[e]);
      const b = EKEY.map(e => nd[e]);
      const dot = sum(a.map((v, i) => v * b[i]));
      const na = Math.sqrt(sum(a.map(v => v * v)));
      const nb = Math.sqrt(sum(b.map(v => v * v)));
      cons += dot / (na * nb + 1e-9) * weight[k];
    });
  }

  const penalty = active.length === 1 ? 0.18 : active.length === 2 ? 0.05 : 0;
  const confidence = clamp(0.10 + pmax * 1.05 + cons * 0.15 - penalty, 0.15, 0.95);

  return {
    dist: nd, valence: clamp(valence, -1, 1), arousal: clamp(arousal, 0, 1),
    top, pmax, weight, active, consistency: clamp(cons, 0, 1), confidence
  };
}

/* 页面 6 类情绪 → grok-ball 表情 ID */
export const FACE_ID = { joy: '10', calm: '19', sadness: '12', anger: '21', fear: '17', surprise: '13' };
export const faceIdOf = key => FACE_ID[key] || '19';
