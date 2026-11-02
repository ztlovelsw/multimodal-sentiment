/* 大模型适配层自测：全部使用 mock fetch，不产生真实网络请求与费用 */
import assert from 'node:assert/strict';
import {
  buildJevRequest, parseJevResponse, buildChatRequest, parseChatResponse,
  analyzeTextWithLLM, chatEndpoint, normalizeDist
} from '../src/llm.js';

const jevCfg = {
  enabled: true,
  dialect: 'jev',
  endpoint: 'https://api.beatapi.io/v1/systemone',
  model: 'jev-1.14-free',
  apiKey: 'test-key'
};

const chatCfg = {
  ...jevCfg,
  dialect: 'chat',
  endpoint: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat'
};

const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const jevAnswers = {
  emotion: {
    type: 'choice',
    choice: 'joy',
    confidence: 0.82,
    probabilities: { joy: 0.72, calm: 0.12, sadness: 0.03, anger: 0.02, fear: 0.03, surprise: 0.08 }
  },
  valence: { type: 'score', score: 3.6, confidence: 0.7 },
  arousal: { type: 'score', score: 2.4, confidence: 0.6 }
};

let passed = 0;
const ok = name => { passed++; console.log('  ✓ ' + name); };

console.log('llm.js selftest');

/* 1. Jev 请求结构 */
{
  const req = buildJevRequest('今天很开心', jevCfg);
  assert.equal(req.model, 'jev-1.14-free');
  assert.equal(req.state, '今天很开心');
  assert.equal(Object.keys(req.questions).length, 3);
  assert.equal(req.questions.emotion.type, 'choice');
  assert.equal(Object.keys(req.questions.emotion.criteria).length, 6);
  assert.equal(req.questions.valence.type, 'score');
  assert.equal(req.questions.valence.criteria.length, 5);
  assert.deepEqual(buildChatRequest('hi', chatCfg).messages.map(m => m.role), ['system', 'user']);
  ok('构建 Jev / Chat 请求');
}

/* 2. Jev 响应映射 */
{
  const r = parseJevResponse({ model: 'jev-1.14-free', answers: jevAnswers, usage: { input_tokens: 120 } }, jevCfg);
  assert.equal(r.ok, true);
  assert.equal(r.meta.provider, 'jev');
  assert.equal(r.meta.top, 'joy');
  assert.ok(Math.abs(r.valence - 0.8) < 1e-9, 'valence 3.6 → 0.8');
  assert.ok(Math.abs(r.arousal - 0.6) < 1e-9, 'arousal 2.4 → 0.6');
  assert.ok(Math.abs(sum(r.dist) - 1) < 1e-9);
  assert.ok(Math.abs(r.meta.confidence - 0.82) < 1e-9);
  ok('解析 Jev answers 并映射 valence / arousal / 分布');
}

/* 3. JevModel data 信封 + 错误码 */
{
  const wrapped = { code: 0, message: 'ok', data: { model: 'jev-1.13', answers: jevAnswers } };
  const r = parseJevResponse(wrapped, { model: 'jev-1.13' });
  assert.equal(r.meta.model, 'jev-1.13');
  assert.throws(() => parseJevResponse({ code: -1, message: 'INSUFFICIENT_TOKENS' }, jevCfg), /INSUFFICIENT_TOKENS/);
  ok('兼容 JevModel data 信封与错误码');
}

/* 4. Chat JSON（含代码围栏） */
{
  const payload = {
    model: 'deepseek-chat',
    choices: [{ message: { content: '```json\n{"emotion":"sadness","scores":{"joy":0.02,"calm":0.08,"sadness":0.7,"anger":0.1,"fear":0.08,"surprise":0.02},"valence":-0.6,"arousal":0.35,"confidence":0.8,"reason":"表达失望"}\n```' } }]
  };
  const r = parseChatResponse(payload, chatCfg);
  assert.equal(r.meta.top, 'sadness');
  assert.equal(r.meta.reason, '表达失望');
  assert.ok(Math.abs(r.valence + 0.6) < 1e-9);
  assert.ok(Math.abs(sum(r.dist) - 1) < 1e-9);
  ok('解析 Chat JSON 围栏并归一化');
}

/* 5. Chat 缺字段兜底 */
{
  const r = parseChatResponse({ choices: [{ message: { content: '{"emotion":"anger","valence":-0.8,"arousal":0.9}' } }] }, chatCfg);
  assert.equal(r.meta.top, 'anger');
  assert.ok(r.dist.anger > 0.95);
  assert.ok(Math.abs(r.valence + 0.8) < 1e-9);
  assert.ok(r.dist.calm < 0.01);
  ok('Chat 缺 scores 时按 emotion 生成分布');
}

/* 6. 分布归一化与端点拼接 */
{
  const d = normalizeDist({ joy: 3, calm: 1 }, 'joy');
  assert.ok(Math.abs(sum(d) - 1) < 1e-9);
  assert.ok(d.joy > d.calm);
  const one = normalizeDist(null, 'fear');
  assert.ok(one.fear > 0.9);
  assert.equal(chatEndpoint('https://api.deepseek.com/v1'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(chatEndpoint('https://api.openai.com'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(chatEndpoint('https://x.test/v1/chat/completions'), 'https://x.test/v1/chat/completions');
  ok('分布归一化 / chatEndpoint 拼接');
}

/* 7. 真实调用路径（mock fetch） */
{
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return new Response(JSON.stringify({ model: 'jev-1.14-free', answers: jevAnswers }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  const r = await analyzeTextWithLLM('今天项目跑通了，特别开心', jevCfg);
  assert.equal(r.meta.engine, 'llm');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, jevCfg.endpoint);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(calls[0].opts.body).state, '今天项目跑通了，特别开心');
  assert.ok(r.meta.latency >= 0);
  ok('analyzeTextWithLLM 使用 Jev 端点与 Bearer 头');
}

/* 8. HTTP 429 错误映射 */
{
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'rate limit' } }), {
    status: 429, headers: { 'Content-Type': 'application/json' }
  });
  await assert.rejects(() => analyzeTextWithLLM('x', jevCfg), /429/);
  ok('429 限流错误映射');
}

/* 9. 超时中止 */
{
  globalThis.fetch = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
  await assert.rejects(() => analyzeTextWithLLM('x', jevCfg, { timeoutMs: 20 }), /超时/);
  ok('超时中止');
}

/* 10. Chat 非 JSON 返回 */
{
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '不是 JSON' } }] }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
  await assert.rejects(() => analyzeTextWithLLM('x', chatCfg), /有效 JSON/);
  ok('Chat 非 JSON 返回报错');
}

console.log('\nAll ' + passed + ' checks passed.');
