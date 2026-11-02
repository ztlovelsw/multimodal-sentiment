import React, {
  useState, useEffect, useRef, useCallback
} from 'react';
import {
  EMOTIONS, cssVar, emoColor, clamp,
  analyzeText, analyzeImage, analyzeAudio, fuse, faceIdOf, WEIGHTS_TEXT
} from './analysis.js';
import {
  analyzeTextWithLLM, loadLlmConfig, saveLlmConfig, LLM_PRESETS
} from './llm.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const THEME_KEY = 'mmsentiment.theme';
const SAMPLES = {
  pos: '今天终于把项目跑通了！虽然熬到凌晨三点，但看到结果那一刻真的超有成就感，特别开心，感谢一起熬夜的队友。',
  neg: '又一次失败了，改了一整天还是报错，真的很失望也很累，有点担心自己根本做不完这件事。',
  neu: '收到了会议通知，周三下午两点在第三会议室，议题是下季度的排期安排。'
};

/* ---------- 小组件 ---------- */

function ThemeSwitch({ theme, onToggle }){
  return (
    <button className="theme-switch" type="button" role="switch"
      aria-checked={theme === 'light'}
      aria-label="切换深色 / 浅色主题"
      title={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
      onClick={onToggle}>
      <span className="knob">
        <svg className="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>
        <svg className="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>
      </span>
    </button>
  );
}

const LLM_TEST_TEXT = '今天项目终于跑通了，虽然熬到凌晨三点，但看到结果那一刻真的超有成就感，特别开心。';

function LlmSettings({ open, cfg, onClose, onSave, toast }){
  const [draft, setDraft] = useState(cfg);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);

  useEffect(() => {
    if (!open) return;
    setDraft(cfg);
    setTestMsg(null);
    setShowKey(false);
  }, [open, cfg]);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const applyPreset = dialect => {
    const p = LLM_PRESETS[dialect];
    if (!p) return;
    setDraft(d => ({ ...d, dialect, endpoint: p.endpoint, model: p.model }));
    setTestMsg(null);
  };

  const test = async () => {
    if (testing) return;
    if (!draft.apiKey.trim()){ setTestMsg({ ok: false, text: '请先填写 API Key' }); return; }
    setTesting(true);
    setTestMsg({ ok: true, text: '正在请求…' });
    try {
      const r = await analyzeTextWithLLM(LLM_TEST_TEXT, draft);
      const top = EMOTIONS.find(e => e.key === (r.meta.top || 'calm')) || EMOTIONS[0];
      setTestMsg({
        ok: true,
        text: `连接成功 · ${top.cn} · 极性 ${r.valence.toFixed(2)} · ${r.meta.model} · ${r.meta.latency}s`
      });
    } catch (e){
      setTestMsg({ ok: false, text: e && e.message ? e.message : '连接失败' });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    if (draft.enabled){
      if (!draft.apiKey.trim()){ setTestMsg({ ok: false, text: '启用大模型前请填写 API Key' }); return; }
      if (!draft.endpoint.trim()){ setTestMsg({ ok: false, text: '请填写接口地址' }); return; }
      if (!draft.model.trim()){ setTestMsg({ ok: false, text: '请填写模型名称' }); return; }
    }
    const saved = saveLlmConfig(draft);
    onSave(saved);
    toast(saved.enabled ? '大模型情感判断已启用' : '已切换为本地分析');
    onClose();
  };

  const isJev = draft.dialect === 'jev';

  return (
    <div className="llm-mask" role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="llm-panel" role="dialog" aria-modal="true" aria-labelledby="llmTitle">
        <div className="llm-head">
          <div>
            <h3 id="llmTitle">大模型情感判断</h3>
            <p>Jev 类型化决策 · OpenAI 兼容接口</p>
          </div>
          <button className="llm-x" type="button" aria-label="关闭设置" onClick={onClose}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        <div className="llm-body">
          <label className="llm-toggle">
            <input type="checkbox" checked={draft.enabled}
              onChange={e => set('enabled', e.target.checked)} />
            <span className="llm-switch" aria-hidden="true"><i></i></span>
            <span className="llm-toggle-txt">
              <b>启用大模型</b>
              <small>{draft.enabled ? '文本将发送到所配置的接口，图片与语音仍在本地分析' : '当前使用本地词典，文本不会离开浏览器'}</small>
            </span>
          </label>

          <div className="llm-seg" role="group" aria-label="接口类型">
            <button type="button" className={isJev ? 'on' : ''}
              onClick={() => applyPreset('jev')}>Jev 类型化决策</button>
            <button type="button" className={!isJev ? 'on' : ''}
              onClick={() => applyPreset('chat')}>OpenAI 兼容</button>
          </div>

          <label className="llm-field">
            <span>接口地址</span>
            <input value={draft.endpoint} spellCheck={false}
              onChange={e => set('endpoint', e.target.value)}
              placeholder={isJev ? 'https://api.beatapi.io/v1/systemone' : 'https://api.deepseek.com/v1'} />
            <em>{isJev
              ? '默认 BeatAPI 免费接口；换服务商时请同时确认接口路径与模型名。'
              : '填 Base URL 或完整的 /chat/completions 地址，模型需支持 JSON 输出。'}</em>
          </label>

          <label className="llm-field">
            <span>模型</span>
            <input value={draft.model} spellCheck={false}
              onChange={e => set('model', e.target.value)}
              placeholder={isJev ? 'jev-1.14-free' : 'deepseek-chat'} />
          </label>

          <label className="llm-field">
            <span>API Key</span>
            <span className="llm-key">
              <input type={showKey ? 'text' : 'password'} value={draft.apiKey}
                autoComplete="off" spellCheck={false}
                onChange={e => set('apiKey', e.target.value)}
                placeholder="sk-..." />
              <button type="button" onClick={() => setShowKey(v => !v)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </span>
          </label>

          <label className="llm-remember">
            <input type="checkbox" checked={draft.remember}
              onChange={e => set('remember', e.target.checked)} />
            在本机记住密钥（写入 localStorage）
          </label>

          <div className={'llm-test' + (testMsg ? (testMsg.ok ? ' ok' : ' err') : '')}>
            {testMsg ? testMsg.text : '密钥只保存在本机浏览器；Jev 免费档每分钟 1 次；请勿用于公开部署。'}
          </div>
        </div>

        <div className="llm-foot">
          <button className="btn ghost small" type="button" onClick={test} disabled={testing}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          <div className="llm-actions">
            <button className="btn ghost small" type="button" onClick={onClose}>取消</button>
            <button className="btn primary small" type="button" onClick={save}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModHead({ icon, title, sub, stateText }){
  return (
    <div className="mod-head">
      <div className="mod-ico">{icon}</div>
      <div>
        <div className="mod-title">{title}</div>
        <div className="mod-sub">{sub}</div>
      </div>
      <span className="mod-state"><span className="dot"></span><span className="stxt">{stateText}</span></span>
    </div>
  );
}

/* ---------- Grok Ball hooks ---------- */
function useGrokBall(hostRef, emotionKey){
  const ballRef = useRef(null);
  useEffect(() => {
    if (!emotionKey || !window.GrokBall || !hostRef.current) return;
    const id = faceIdOf(emotionKey);
    if (ballRef.current) ballRef.current.setEmotion(id);
    else ballRef.current = window.GrokBall.create(hostRef.current, { emotion: id });
    return () => {};
  }, [emotionKey, hostRef]);

  useEffect(() => () => {
    if (ballRef.current){ try { ballRef.current.destroy(); } catch(e){} ballRef.current = null; }
  }, []);
  return ballRef;
}

/* 视线跟随 */
function feedGaze(ball, host, hw, hh, e){
  const r = host.getBoundingClientRect();
  if (!r.width) return;
  ball.setGaze(
    clamp((e.clientX - (r.left + r.width / 2)) / (hw || r.width / 2), -1, 1),
    clamp((e.clientY - (r.top + r.height / 2)) / (hh || r.height / 2), -1, 1)
  );
}

/* ---------- 主组件 ---------- */
export default function App(){
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) ||
        (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    } catch(e){ return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch(e){}
  }, [theme]);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const h = e => {
      let saved = null;
      try { saved = localStorage.getItem(THEME_KEY); } catch(err){}
      if (!saved) setTheme(e.matches ? 'light' : 'dark');
    };
    mql.addEventListener ? mql.addEventListener('change', h) : mql.addListener(h);
    return () => mql.removeEventListener ? mql.removeEventListener('change', h) : mql.removeListener(h);
  }, []);

  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef();
  const toast = useCallback(msg => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2200);
  }, []);

  /* --- 大模型配置 --- */
  const [llmCfg, setLlmCfg] = useState(() => loadLlmConfig());
  const [llmOpen, setLlmOpen] = useState(false);
  const [textEngine, setTextEngine] = useState('');
  const llmOn = !!(llmCfg.enabled && llmCfg.apiKey.trim() && llmCfg.model.trim());

  /* --- 输入状态 --- */
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);      // {url, name, w, h, kb, el}
  const [audioFile, setAudioFile] = useState(null);
  const [audioMeta, setAudioMeta] = useState(null); // 分析后的元信息
  const [modState, setModState] = useState({ text: ['idle','待输入'], image: ['idle','未上传'], audio: ['idle','未上传'] });
  const setMod = (k, st, txt) => setModState(s => ({ ...s, [k]: [st, txt] }));

  /* --- 运行状态 --- */
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fused, setFused] = useState(null);
  const [flash, setFlash] = useState(null);      // {emo, fused}
  const [audioFrames, setAudioFrames] = useState(null);
  const [imgStat, setImgStat] = useState('');
  const [audioStat, setAudioStat] = useState('');

  const imageRef = useRef(null);  // HTMLImageElement
  const audioFileRef = useRef(null);

  /* --- Grok balls --- */
  const faceRef = useRef(null);
  const flashFaceRef = useRef(null);
  const faceBall = useGrokBall(faceRef, fused ? fused.top : null);
  const flashBall = useGrokBall(flashFaceRef, flash ? flash.emo.key : null);

  useEffect(() => {
    if (flash && flashBall.current) flashBall.current.burst(26);
  }, [flash]); // eslint-disable-line

  useEffect(() => {
    const h = e => {
      if (faceBall.current && faceRef.current) feedGaze(faceBall.current, faceRef.current, 300, 170, e);
      if (flashBall.current && flashFaceRef.current) feedGaze(flashBall.current, flashFaceRef.current, 0, 0, e);
    };
    const leave = () => {
      faceBall.current && faceBall.current.clearGaze();
      flashBall.current && flashBall.current.clearGaze();
    };
    window.addEventListener('pointermove', h, { passive: true });
    document.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', h);
      document.removeEventListener('pointerleave', leave);
    };
  }, []); // eslint-disable-line

  const closeFlash = useCallback(() => setFlash(null), []);
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') closeFlash(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [closeFlash]);

  /* --- 主题切换后重绘 canvas --- */
  useEffect(() => {
    if (!fused) return;
    const emo = EMOTIONS.find(e => e.key === fused.top);
    document.documentElement.style.setProperty('--accent', emoColor(emo));
  }, [fused, theme]);

  /* --- 图片 --- */
  const loadImage = useCallback(file => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImage({ url, name: file.name, w: img.width, h: img.height, kb: (file.size / 1024).toFixed(0) });
      setImgStat('待分析');
      setMod('image', 'idle', '已载入');
    };
    img.onerror = () => toast('图片读取失败');
    img.src = url;
  }, [toast, setMod]); // eslint-disable-line

  const genDemoImage = useCallback(() => {
    const palettes = [
      ['#ff8a3d','#ffc93c','#ff5f6d','#ffd76e'],
      ['#1b2a4a','#3b5b8c','#6b8aff','#243b63'],
      ['#5ad1a5','#a8e6cf','#356859','#dcedc1']
    ];
    const p = palettes[Math.floor(Math.random() * palettes.length)];
    const c = document.createElement('canvas');
    c.width = 640; c.height = 420;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 640, 420);
    g.addColorStop(0, p[0]); g.addColorStop(.5, p[1]); g.addColorStop(1, p[2]);
    x.fillStyle = g; x.fillRect(0, 0, 640, 420);
    for (let i = 0; i < 26; i++){
      x.beginPath();
      x.globalAlpha = Math.random() * .35 + .08;
      x.fillStyle = p[Math.floor(Math.random() * p.length)];
      x.arc(Math.random() * 640, Math.random() * 420, Math.random() * 110 + 20, 0, 7);
      x.fill();
    }
    x.globalAlpha = 1;
    c.toBlob(b => loadImage(new File([b], 'sample-gradient.png', { type: 'image/png' })), 'image/png');
  }, [loadImage]);

  /* --- 音频 --- */
  const loadAudio = useCallback(file => {
    audioFileRef.current = file;
    setAudioFile({ name: file.name, kb: (file.size / 1024).toFixed(0) });
    setAudioStat('待分析');
    setAudioFrames(null);
    setAudioMeta(null);
    setMod('audio', 'idle', '已载入');
  }, []); // eslint-disable-line

  const clearAudio = useCallback(() => {
    audioFileRef.current = null;
    setAudioFile(null);
    setAudioFrames(null);
    setAudioMeta(null);
    setAudioStat('');
    setMod('audio', 'idle', '未上传');
  }, []); // eslint-disable-line

  /* --- 运行 --- */
  const runRef = useRef();
  const run = useCallback(async () => {
    if (running) return;
    const hasText = text.trim().length > 0;
    if (!hasText && !imageRef.current && !audioFileRef.current){
      toast('请至少提供一种模态的输入');
      return;
    }
    setRunning(true);
    setProgress(4);
    const mods = {};

    if (hasText){
      setMod('text', 'busy', llmOn ? '大模型分析中' : '分析中');
      setProgress(12);
      if (llmOn){
        try {
          mods.text = await analyzeTextWithLLM(text, llmCfg);
          setTextEngine('LLM · ' + mods.text.meta.model);
          setMod('text', 'ready', '大模型完成');
        } catch (err){
          const reason = err && err.message ? err.message : '调用失败';
          toast('大模型调用失败：' + reason + '，已回退本地词典');
          await wait(120);
          mods.text = analyzeText(text);
          mods.text.meta.fallback = reason;
          setTextEngine('本地词典 · 已回退');
          setMod('text', 'ready', '已回退本地');
        }
      } else {
        await wait(160);
        mods.text = analyzeText(text);
        setTextEngine('本地词典');
        setMod('text', 'ready', '完成');
      }
      setProgress(32);
    } else {
      setMod('text', 'skip', '已跳过');
      setTextEngine('');
    }

    if (imageRef.current){
      setMod('image', 'busy', '分析中');
      await wait(160);
      mods.image = analyzeImage(imageRef.current);
      setImgStat(`亮度 ${mods.image.meta.brightness} · 饱和 ${mods.image.meta.saturation}`);
      setProgress(62);
      setMod('image', 'ready', '完成');
    } else setMod('image', 'skip', '已跳过');

    if (audioFileRef.current){
      setMod('audio', 'busy', '分析中');
      setProgress(72);
      const res = await analyzeAudio(audioFileRef.current);
      if (res.ok){
        mods.audio = res;
        setAudioFrames(res.meta.frames);
        setAudioMeta({ dur: res.meta.duration.toFixed(1), sr: res.meta.sampleRate });
        setAudioStat(`能量 ${res.meta.energy} · 动态 ${res.meta.dynamics}`);
        setMod('audio', 'ready', '完成');
      } else {
        setMod('audio', 'idle', '解析失败');
        toast('音频解码失败，已忽略该模态');
      }
      setProgress(92);
    } else setMod('audio', 'skip', '已跳过');

    await wait(120);
    const f = fuse(mods);
    setProgress(100);
    setFused(f);
    if (f){
      const emo = EMOTIONS.find(e => e.key === f.top);
      document.documentElement.style.setProperty('--accent', emoColor(emo));
      setFlash({ emo, f });
    }
    if (window.innerWidth <= 1040){
      const hero = document.getElementById('heroCard');
      if (hero){
        const top = hero.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
    await wait(420);
    setProgress(0);
    setRunning(false);
  }, [running, text, toast, llmCfg, llmOn]); // eslint-disable-line
  runRef.current = run;

  useEffect(() => {
    const h = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter'){ e.preventDefault(); runRef.current && runRef.current(); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const loadDemo = useCallback(() => {
    setText(SAMPLES.pos);
    setTextEngine('');
    setMod('text', 'idle', '已输入');
    genDemoImage();
    toast('示例已载入 — 可直接开始分析');
  }, [genDemoImage, toast]); // eslint-disable-line

  useEffect(() => {
    if (/(\?|#|&)demo/.test(window.location.hash + window.location.search)){
      const t = setTimeout(() => { loadDemo(); setTimeout(() => runRef.current && runRef.current(), 700); }, 260);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  /* --- 渲染 --- */
  const f = fused;
  const topEmo = f ? EMOTIONS.find(e => e.key === f.top) : null;
  const engineLabel = textEngine || (llmOn ? 'LLM · ' + llmCfg.model : '本地词典');
  const engineBadge = engineLabel.indexOf('LLM') === 0 ? 'LLM' : '本地';

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <div className="brand">
            <div className="mark"></div>
            <div>
              <h1>Multimodal Sentiment</h1>
              <p>Affective Fusion Engine</p>
            </div>
          </div>
          <div className="top-right">
            <span className={'pill' + (llmOn ? ' llm' : '')}
              title={llmOn ? `文本交由 ${llmCfg.model} 判定` : '所有分析均在浏览器本地完成'}>
              <span className="live"></span>
              <span className="ptxt">{llmOn ? `大模型 · ${llmCfg.model}` : '本地推理 · 无数据上传'}</span>
            </span>
            <button className="btn ghost small ai-btn" onClick={() => setLlmOpen(true)} title="配置大模型情感判断">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"/><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z"/></svg>
              <span>AI 设置</span>
            </button>
            <ThemeSwitch theme={theme} onToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
            <button className="btn ghost small" onClick={loadDemo}>载入示例</button>
            <button className="btn primary" onClick={run} disabled={running}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3l14 9-14 9V3z"/></svg>
              {running ? '分析中…' : (f ? '重新分析' : '开始分析')}
            </button>
          </div>
        </div>
      </header>

      <div className="wrap">
        <div className="grid">
          {/* ===== LEFT ===== */}
          <div className="col">
            <section className="card" id="cardText" data-state={modState.text[0]}>
              <ModHead
                icon={<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h12M4 18h8"/></svg>}
                title="文本语义" sub={llmOn ? 'Text · LLM' : 'Text · Lexical'}
                state={modState.text[0]} stateText={modState.text[1]} />
              <textarea value={text} placeholder={'输入一段话，让模型读取其中的情绪倾向……\n例如：今天项目终于跑通了，虽然熬到三点，但真的很爽。'}
                onChange={e => {
                  setText(e.target.value);
                  setTextEngine('');
                  setMod('text', 'idle', e.target.value.trim() ? '已输入' : '待输入');
                }} />
              <div className="text-foot">
                <div className="chip-row">
                  <button className="chip" onClick={() => { setText(SAMPLES.pos); setTextEngine(''); setMod('text','idle','已输入'); }}>正面样例</button>
                  <button className="chip" onClick={() => { setText(SAMPLES.neg); setTextEngine(''); setMod('text','idle','已输入'); }}>负面样例</button>
                  <button className="chip" onClick={() => { setText(SAMPLES.neu); setTextEngine(''); setMod('text','idle','已输入'); }}>中性样例</button>
                </div>
                <span className="text-meta" title={engineLabel}>
                  <b className={engineBadge === 'LLM' ? 'on' : ''}>{engineBadge}</b>
                  <span> · {text.trim().length} 字</span>
                </span>
              </div>
            </section>

            <ImageCard modState={modState.image} image={image} imgStat={imgStat}
              onLoad={loadImage} onDemo={genDemoImage} toast={toast} />

            <VideoCard />

            <AudioCard modState={modState.audio} audioFile={audioFile} audioMeta={audioMeta}
              audioStat={audioStat} frames={audioFrames} theme={theme}
              onLoad={loadAudio} onClear={clearAudio} toast={toast} />

            <section className="card" id="cardWeights">
              <div className="weights">
                <span>融合权重</span>
                <div className="wbar">
                  <i className="w-t" style={{ width: '50%' }}></i><i className="w-i" style={{ width: '28%' }}></i><i className="w-a" style={{ width: '22%' }}></i>
                </div>
                <span>{WEIGHTS_TEXT}</span>
              </div>
              <div className={'progress-track' + (progress > 0 ? ' on' : '')}>
                <div className="progress-fill" style={{ width: progress + '%' }}></div>
              </div>
            </section>
          </div>

          {/* ===== RIGHT ===== */}
          <div className="col">
            <section className="card hero" id="heroCard">
              {!f ? (
                <div className="empty">
                  <div className="ring2">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" style={{ opacity: .55 }}><path d="M3 12h3l2.5-7 3 14 2.5-7H21"/></svg>
                  </div>
                  <p>输入文本、图像或语音后点击<em>开始分析</em>，系统将输出融合后的情绪判定、情感极性、唤醒度与置信度。</p>
                </div>
              ) : (
                <div id="heroResult">
                  <div className="hero-top">
                    <div className="hero-emo">
                      <div className="face" ref={faceRef} aria-hidden="true"></div>
                      <div style={{ minWidth: 0 }}>
                        <div className="hero-cn" style={{ color: emoColor(topEmo) }}>{topEmo.cn}</div>
                        <div className="hero-en">{topEmo.en} · Dominant</div>
                        <div className="hero-tags">
                          <span className="tag">Valence {(f.valence >= 0 ? '+' : '') + f.valence.toFixed(2)}</span>
                          <span className="tag">Arousal {f.arousal.toFixed(2)}</span>
                          <span className="tag">{f.active.length} 模态融合</span>
                          {f.active.includes('text') && textEngine && (
                            <span className="tag tag-engine" title={textEngine}>{textEngine}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ConfRing confidence={f.confidence} />
                  </div>
                  <div className="hero-dims">
                    <DimBar label="情感极性 · Valence" left="负向" right="正向"
                      value={f.valence} bipolar theme={theme} />
                    <DimBar label="唤醒程度 · Arousal" left="平静" right="激烈"
                      value={f.arousal} bipolar={false} theme={theme} />
                  </div>
                </div>
              )}
            </section>

            <section className="card" id="cardDist">
              <div className="card-title"><h2>情绪分布</h2><div className="line"></div></div>
              <div className="ebars">
                {EMOTIONS.map(e => (
                  <EmotionBar key={e.key} e={e} dist={f ? f.dist[e.key] : 0} top={f && f.top === e.key} />
                ))}
              </div>
            </section>

            <div className="grid2">
              <section className="card">
                <div className="card-title"><h2>六维情绪谱</h2><div className="line"></div></div>
                <Radar dist={f ? f.dist : null} theme={theme} />
              </section>

              <section className="card">
                <div className="card-title"><h2>模态贡献</h2><div className="line"></div></div>
                <div className="contrib">
                  {[
                    ['text', '文本 Text', 'var(--a1)'],
                    ['image', '视觉 Vision', 'var(--a2)'],
                    ['audio', '语音 Audio', '#d4698f']
                  ].map(([k, label, bg]) => {
                    const on = f && f.active.includes(k);
                    return (
                      <div className="crow" key={k}>
                        <div className="chead"><span>{label}</span><b>{on ? Math.round(f.weight[k] * 100) + '%' : '未启用'}</b></div>
                        <div className="ctrack"><div className="cfill" style={{ background: bg, width: on ? (f.weight[k] * 100) + '%' : '0%', opacity: on ? 1 : .25 }}></div></div>
                      </div>
                    );
                  })}
                </div>
                <div className="consistency">
                  <span>模态一致性</span>
                  <div className="cdots">
                    {Array.from({ length: 10 }, (_, i) => (
                      <i key={i} className={f && i < Math.round(f.consistency * 10) ? 'on' : ''}></i>
                    ))}
                  </div>
                  <span id="consTxt" style={{ marginLeft: 'auto', color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
                    {f ? Math.round(f.consistency * 100) + '%' : '—'}
                  </span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <footer className="foot">
        <span>{llmOn
          ? '文本由所配置的大模型判定 · 图像 / 语音仍为本地启发式'
          : '纯前端演示 · 情感词典 + 色彩心理 + 音频韵律统计'}</span>
        <span className="sep">·</span>
        <span><kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> 快速分析</span>
        <span className="sep">·</span>
        <span>结果仅供演示，非临床或决策依据</span>
      </footer>

      <div className={'toast' + (toastMsg ? ' on' : '')}>{toastMsg}</div>

      <LlmSettings open={llmOpen} cfg={llmCfg}
        onClose={() => setLlmOpen(false)}
        onSave={setLlmCfg} toast={toast} />

      <div className="flash" hidden={!flash} onClick={e => {
        if (flashBall.current && e.target && e.target.closest && e.target.closest('.flash-face')){
          flashBall.current.spin(1);
          setTimeout(closeFlash, 800);
          return;
        }
        closeFlash();
      }}>
        <div className="flash-aura"></div>
        <div className="flash-face" ref={flashFaceRef} aria-hidden="true"></div>
        {flash && (
          <div className="flash-meta">
            <div className="flash-cn">{flash.emo.cn}</div>
            <div className="flash-en">{flash.emo.en} · Dominant</div>
            <div className="flash-tags">
              <span className="tag">Valence {(flash.f.valence >= 0 ? '+' : '') + flash.f.valence.toFixed(2)}</span>
              <span className="tag">Arousal {flash.f.arousal.toFixed(2)}</span>
              <span className="tag">{Math.round(flash.f.confidence * 100)}% 置信度</span>
            </div>
          </div>
        )}
        <div className="flash-hint">移动鼠标与它对视 · 点击任意处 / 右上角 × / Esc 收起</div>
        <button className="flash-close" type="button" aria-label="关闭表情包"
          onClick={e => { e.stopPropagation(); closeFlash(); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
    </>
  );
}

/* ---------- 情绪分布条 ----------
   宽度由 rAF/setTimeout 混合驱动：后台标签页 rAF 被冻结时 setTimeout 仍会触发，
   保证 CSS transition 失效的环境下进度条最终也能到位。 */
function EmotionBar({ e, dist, top }){
  const [pct, setPct] = useState(0);
  const target = dist * 100;
  useEffect(() => {
    const from = pct;
    const start = performance.now();
    let raf, timer;
    const update = () => {
      const k = Math.min(1, (performance.now() - start) / 850);
      const ease = 1 - Math.pow(1 - k, 3);
      // 收尾时直接对齐目标值，避免浮点残差（如 78.0499）让 0 变成 0.0x 的细线
      setPct(k < 1 ? from + (target - from) * ease : target);
      if (k < 1) schedule();
    };
    const schedule = () => {
      raf = requestAnimationFrame(update);
      // 后台标签页 rAF 不触发，setTimeout(1s 节流)兜底
      timer = setTimeout(update, 120);
    };
    schedule();
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [target]); // eslint-disable-line
  return (
    <div className={'ebar' + (top ? ' top' : '')} style={{ '--c': `var(${e.v})` }}>
      <span className="nm"><i></i>{e.cn}</span>
      <span className="etrack">
        <span className={'efill' + (pct > 0.05 ? '' : ' zero')}
          style={{ width: pct > 0.05 ? pct.toFixed(1) + '%' : '0' }}></span>
      </span>
      <span className="pc">{target.toFixed(1)}%</span>
    </div>
  );
}

/* ---------- 图片卡 ---------- */
function ImageCard({ modState, image, imgStat, onLoad, onDemo, toast }){
  const fileRef = useRef(null);
  const dropRef = useRef(null);
  return (
    <section className="card" id="cardImage" data-state={modState[0]}>
      <ModHead
        icon={<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M3 16.5l5-4.5 4.5 4 3-2.5L21 17"/></svg>}
        title="视觉情绪" sub="Vision · Color Affect"
        state={modState[0]} stateText={modState[1]} />
      <div className="drop" ref={dropRef}
        onClick={() => fileRef.current && fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); dropRef.current.classList.add('over'); }}
        onDragLeave={() => dropRef.current.classList.remove('over')}
        onDrop={e => {
          e.preventDefault();
          dropRef.current.classList.remove('over');
          const f = e.dataTransfer.files && e.dataTransfer.files[0];
          if (f && f.type.startsWith('image/')) onLoad(f);
          else toast('请拖入图片文件');
        }}>
        {image ? (
          <div className="thumb">
            <img src={image.url} alt="" />
            <div className="meta">
              <div className="name">{image.name}</div>
              <div className="sub">{image.w} × {image.h} · {image.kb} KB</div>
            </div>
          </div>
        ) : (
          <div className="drop-hint">
            <b>点击或拖入图片</b>
            <span>分析色调 / 亮度 / 饱和度传递的情绪</span>
          </div>
        )}
      </div>
      <input type="file" ref={fileRef} accept="image/*" hidden
        onChange={e => { const f = e.target.files[0]; if (f) onLoad(f); e.target.value = ''; }} />
      <div className="text-foot" style={{ marginTop: 10 }}>
        <div className="chip-row"><button className="chip" onClick={onDemo}>生成示例图</button></div>
        <span>{imgStat || '—'}</span>
      </div>
    </section>
  );
}

/* ---------- 视频卡（仅 UI 展示，不参与融合分析） ---------- */
function VideoCard(){
  // file 只存展示所需的轻量信息；尺寸/时长由 <video> 的 onLoadedMetadata 回填
  const [file, setFile] = useState(null);   // {url, name, mb}
  const [meta, setMeta] = useState(null);   // {w, h, dur}
  const [frames, setFrames] = useState([]); // 抽帧缩略图 dataURL
  const [err, setErr] = useState(false);
  const fileRef = useRef(null);
  const dropRef = useRef(null);
  const vidRef = useRef(null);
  const grabbing = useRef(false);

  const pick = f => {
    if (!f || !f.type.startsWith('video/')) return;
    if (file) URL.revokeObjectURL(file.url);
    setFile({ url: URL.createObjectURL(f), name: f.name, mb: (f.size / 1024 / 1024).toFixed(1) });
    setMeta(null); setFrames([]); setErr(false); grabbing.current = false;
  };

  /* 元数据就绪后抽 6 帧拼时间轴（纯视觉预览） */
  const grabFrames = () => {
    const v = vidRef.current;
    if (!v || grabbing.current || !v.duration || !isFinite(v.duration)) return;
    grabbing.current = true;
    const N = 6;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    const thumbs = [];
    let i = 0;
    const seekNext = () => {
      if (i >= N){ setFrames(thumbs); v.currentTime = 0; return; }
      v.currentTime = (v.duration * (i + 0.5)) / N;
      i++;
    };
    v.onseeked = () => {
      try {
        cv.width = 96;
        cv.height = Math.max(1, Math.round(96 * v.videoHeight / (v.videoWidth || 1)));
        ctx.drawImage(v, 0, 0, cv.width, cv.height);
        thumbs.push(cv.toDataURL('image/jpeg', 0.55));
      } catch(e){ /* 跨域/解码异常时跳过该帧 */ }
      seekNext();
    };
    seekNext();
  };

  const clear = e => {
    e && e.stopPropagation();
    if (file) URL.revokeObjectURL(file.url);
    setFile(null); setMeta(null); setFrames([]); setErr(false); grabbing.current = false;
  };

  const fmt = s => {
    if (!s || !isFinite(s)) return '—';
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const state = err ? ['idle', '读取失败'] : file ? ['ready', '已载入'] : ['idle', '未上传'];

  return (
    <section className="card" id="cardVideo" data-state={state[0]}>
      <ModHead
        icon={<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="14" height="14" rx="2.5"/><path d="M16.5 10.5l5-3v9l-5-3"/></svg>}
        title="视频动态" sub="Video · Temporal"
        stateText={state[1]} />
      <div className="drop" ref={dropRef}
        onClick={() => fileRef.current && fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); dropRef.current.classList.add('over'); }}
        onDragLeave={() => dropRef.current.classList.remove('over')}
        onDrop={e => {
          e.preventDefault();
          dropRef.current.classList.remove('over');
          pick(e.dataTransfer.files && e.dataTransfer.files[0]);
        }}>
        {file ? (
          <div className="thumb" style={{ width: '100%' }}>
            <video key={file.url} ref={vidRef} src={file.url}
              muted loop playsInline preload="metadata"
              className="vthumb"
              onLoadedMetadata={e => {
                const v = e.currentTarget;
                setMeta({ w: v.videoWidth, h: v.videoHeight, dur: v.duration });
                grabFrames();
              }}
              onError={() => setErr(true)}
              onMouseEnter={e => { e.currentTarget.play().catch(() => {}); }}
              onMouseLeave={e => { e.currentTarget.pause(); }} />
            <div className="meta">
              <div className="name">{file.name}</div>
              <div className="sub">
                {meta ? `${meta.w} × ${meta.h} · ${fmt(meta.dur)} · ` : ''}{file.mb} MB
              </div>
            </div>
          </div>
        ) : (
          <div className="drop-hint">
            <b>点击或拖入视频</b>
            <span>时序画面 · 表情 / 动作 / 场景变化</span>
          </div>
        )}
      </div>
      {frames.length > 0 && (
        <div className="filmstrip">
          {frames.map((src, i) => <img key={i} src={src} alt="" />)}
        </div>
      )}
      <input type="file" ref={fileRef} accept="video/*" hidden
        onChange={e => { pick(e.target.files[0]); e.target.value = ''; }} />
      <div className="text-foot" style={{ marginTop: 10 }}>
        <span>{file ? '悬停预览 · 分析即将支持' : '—'}</span>
        {file && <button className="chip" onClick={clear}>移除</button>}
      </div>
    </section>
  );
}

/* ---------- 音频卡 ---------- */
function AudioCard({ modState, audioFile, audioMeta, audioStat, frames, theme, onLoad, onClear, toast }){
  const fileRef = useRef(null);
  const dropRef = useRef(null);
  return (
    <section className="card" id="cardAudio" data-state={modState[0]}>
      <ModHead
        icon={<svg viewBox="0 0 24 24"><path d="M4 10v4M8 6.5v11M12 3.5v17M16 7.5v9M20 10.5v3"/></svg>}
        title="语音韵律" sub="Audio · Prosody"
        state={modState[0]} stateText={modState[1]} />
      <div className="drop" ref={dropRef}
        onClick={() => fileRef.current && fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); dropRef.current.classList.add('over'); }}
        onDragLeave={() => dropRef.current.classList.remove('over')}
        onDrop={e => {
          e.preventDefault();
          dropRef.current.classList.remove('over');
          const f = e.dataTransfer.files && e.dataTransfer.files[0];
          if (f && (f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(f.name))) onLoad(f);
          else toast('请拖入音频文件');
        }}>
        {audioFile ? (
          <div className="thumb" style={{ width: '100%' }}>
            <div className="mod-ico" style={{ width: 44, height: 44, borderRadius: 11, color: '#d4698f' }}>
              <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}><path d="M4 10v4M8 6.5v11M12 3.5v17M16 7.5v9M20 10.5v3"/></svg>
            </div>
            <div className="meta">
              <div className="name">{audioFile.name}</div>
              <div className="sub">{audioMeta ? `${audioMeta.dur}s · ${audioMeta.sr}Hz` : `${audioFile.kb} KB · 等待解析`}</div>
            </div>
          </div>
        ) : (
          <div className="drop-hint">
            <b>点击或拖入音频</b>
            <span>解析能量 / 动态范围 / 过零率</span>
          </div>
        )}
      </div>
      <WaveCanvas frames={frames} theme={theme} />
      <input type="file" ref={fileRef} accept="audio/*" hidden
        onChange={e => { const f = e.target.files[0]; if (f) onLoad(f); e.target.value = ''; }} />
      <div className="text-foot" style={{ marginTop: 10 }}>
        <span>{audioStat || '—'}</span>
        {audioFile && <button className="chip" onClick={e => { e.stopPropagation(); onClear(); }}>移除</button>}
      </div>
    </section>
  );
}

/* ---------- Canvas 组件 ---------- */
function WaveCanvas({ frames, theme }){
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (!frames || !frames.length){ cv.classList.add('hide'); return; }
    cv.classList.remove('hide');
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 380, H = 34;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.height = H + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const bars = Math.min(frames.length, Math.floor(W / 3));
    const stepf = frames.length / bars;
    const maxV = Math.max(...frames) || 1;
    for (let i = 0; i < bars; i++){
      let peak = 0;
      for (let j = Math.floor(i * stepf); j < Math.floor((i + 1) * stepf); j++) peak = Math.max(peak, frames[j] || 0);
      const hh = Math.max(1.5, (peak / maxV) * (H - 8));
      const x = i * 3 + 1;
      ctx.fillStyle = cssVar('--wave');
      if (typeof ctx.roundRect === 'function'){
        ctx.beginPath(); ctx.roundRect(x, (H - hh) / 2, 2, hh, 1); ctx.fill();
      } else ctx.fillRect(x, (H - hh) / 2, 2, hh);
    }
  }, [frames, theme]);
  return <canvas className="wave hide" ref={ref}></canvas>;
}

function Radar({ dist, theme }){
  const ref = useRef(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = () => setTick(t => t + 1);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 300;
    const h = cv.clientHeight || 246;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2 + 2;
    const R = Math.min(w, h) / 2 - 34;
    const n = EMOTIONS.length;
    const ang = i => -Math.PI / 2 + i * 2 * Math.PI / n;

    for (let r = 1; r <= 4; r++){
      ctx.beginPath();
      for (let i = 0; i < n; i++){
        const a = ang(i), rr = R * r / 4;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = r === 4 ? cssVar('--stroke-2') : cssVar('--stroke');
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (let i = 0; i < n; i++){
      const a = ang(i);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = cssVar('--stroke');
      ctx.stroke();
    }
    if (!dist) {
      ctx.font = '11px -apple-system,"PingFang SC",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      EMOTIONS.forEach((e, i) => {
        const a = ang(i);
        ctx.fillStyle = cssVar('--dim-2');
        ctx.fillText(e.cn, cx + Math.cos(a) * (R + 20), cy + Math.sin(a) * (R + 18));
      });
      return;
    }
    const maxV = Math.max(...EMOTIONS.map(e => dist[e.key]), 0.001);
    const pts = EMOTIONS.map((e, i) => {
      const a = ang(i);
      const rr = R * (dist[e.key] / maxV) * 0.96;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    });
    const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    grad.addColorStop(0, cssVar('--radar-fill-1'));
    grad.addColorStop(1, cssVar('--radar-fill-2'));
    ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = cssVar('--radar-stroke');
    ctx.lineWidth = 1.6;
    ctx.stroke();
    pts.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 7);
      ctx.fillStyle = emoColor(EMOTIONS[i]);
      ctx.fill();
      ctx.strokeStyle = cssVar('--bg');
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.font = '11px -apple-system,"PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    EMOTIONS.forEach((e, i) => {
      const a = ang(i);
      ctx.fillStyle = dist[e.key] === maxV ? emoColor(e) : cssVar('--dim');
      ctx.fillText(e.cn, cx + Math.cos(a) * (R + 20), cy + Math.sin(a) * (R + 18));
    });
  }, [dist, theme, tick]);

  return <canvas id="radar" ref={ref}></canvas>;
}

/* ---------- 数值动画环 ---------- */
function ConfRing({ confidence }){
  const [val, setVal] = useState(0);
  useEffect(() => {
    const target = Math.round(confidence * 100);
    const start = val;
    const t0 = performance.now();
    let raf;
    const tick = t => {
      const k = Math.min(1, (t - t0) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setVal(Math.round(start + (target - start) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [confidence]); // eslint-disable-line

  const C = 314.159;
  return (
    <div className="ring-wrap">
      <svg className="ring" viewBox="0 0 120 120">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e8a33d"/>
            <stop offset="100%" stopColor="#3fae8c"/>
          </linearGradient>
        </defs>
        <circle className="bg" cx="60" cy="60" r="50"/>
        <circle className="fg" cx="60" cy="60" r="50"
          strokeDasharray="314.159"
          strokeDashoffset={C * (1 - confidence)} />
      </svg>
      <div className="ring-label">
        <b>{val}</b>
        <small>置信度</small>
      </div>
    </div>
  );
}

/* ---------- 极性/唤醒条 ---------- */
function DimBar({ label, left, right, value, bipolar, theme }){
  // 依赖 theme 触发 cssVar 重取（主题切换时 CSS 变量值变化）
  void theme;
  let fillStyle = {};
  if (bipolar){
    const pinL = (value + 1) / 2 * 100;
    fillStyle = value >= 0
      ? { left: '50%', width: (pinL - 50) + '%', background: `linear-gradient(90deg, ${cssVar('--val-pos-fade')}, ${cssVar('--val-pos')})` }
      : { left: pinL + '%', width: (50 - pinL) + '%', background: `linear-gradient(90deg, ${cssVar('--val-neg')}, ${cssVar('--val-neg-fade')})` };
  } else {
    fillStyle = { left: '0', width: (value * 100) + '%', background: 'var(--arousal-grad)' };
  }
  const pinLeft = bipolar ? ((value + 1) / 2 * 100) + '%' : (value * 100) + '%';
  return (
    <div className="dim">
      <label>{label}</label>
      <div className="dim-track">
        <div className="dim-fill" style={fillStyle}></div>
        <div className="pin" style={{ left: pinLeft }}></div>
      </div>
      <div className="dim-val">
        <span>{left}</span>
        <b>{bipolar ? (value >= 0 ? '+' : '') + value.toFixed(2) : value.toFixed(2)}</b>
        <span>{right}</span>
      </div>
    </div>
  );
}
