// Run: node test.js
const assert = require('node:assert/strict');
const AI = require('./ai.js');

const messages = [{ role: 'user', content: [
  { type: 'file', mime: 'application/pdf', name: 'cv.pdf', data: 'AAA' },
  { type: 'file', mime: 'image/png', name: 'p.png', data: 'BBB' },
  { type: 'text', text: 'hi' },
] }];

// Anthropic
const a = AI.buildRequest({ provider: 'anthropic', key: 'k' }, 'sys', messages);
assert.equal(a.url, 'https://api.anthropic.com/v1/messages');
assert.equal(a.headers['x-api-key'], 'k');
assert.equal(a.body.model, AI.DEFAULT_MODELS.anthropic);
assert.equal(a.body.system, 'sys');
assert.deepEqual(a.body.messages[0].content.map(p => p.type), ['document', 'image', 'text']);
assert.deepEqual(a.body.messages[0].content[0].source, { type: 'base64', media_type: 'application/pdf', data: 'AAA' });
assert.throws(() => AI.buildRequest({ provider: 'anthropic' }, 'sys', messages), /API key/);

// OpenAI-compatible, custom base URL, no key (local server)
const o = AI.buildRequest({ provider: 'openai', baseUrl: 'http://localhost:11434/v1/', model: 'llama3' }, 'sys', messages);
assert.equal(o.url, 'http://localhost:11434/v1/chat/completions');
assert.equal(o.headers.authorization, undefined);
assert.equal(o.body.model, 'llama3');
assert.deepEqual(o.body.messages[0], { role: 'system', content: 'sys' });
assert.deepEqual(o.body.messages[1].content.map(p => p.type), ['file', 'image_url', 'text']);
assert.equal(o.body.messages[1].content[1].image_url.url, 'data:image/png;base64,BBB');
assert.equal(AI.buildRequest({ provider: 'openai', key: 'k' }, 's', []).headers.authorization, 'Bearer k');

// Responses
assert.equal(AI.parseResponse('anthropic', { content: [{ type: 'text', text: ' a ' }, { type: 'text', text: 'b' }] }), 'a b');
assert.equal(AI.parseResponse('openai', { choices: [{ message: { content: 'ok' } }] }), 'ok');
assert.throws(() => AI.parseResponse('anthropic', { content: [] }), /empty/);

// Prompts carry the settings the UI passes in
assert.match(AI.PROMPTS.mock(5, 'technical'), /exactly 5 questions/);
assert.match(AI.PROMPTS.qa('star'), /Situation, Task, Action, Result/);

// Question detection on unpunctuated speech
for (const q of ['tell me about yourself', 'So what is your biggest weakness', 'that makes sense?', 'okay, how would you scale it'])
  assert.equal(AI.isQuestion(q), true, q);
for (const s of ['I worked at Acme for two years', 'thanks for joining', 'somehow it broke'])
  assert.equal(AI.isQuestion(s), false, s);

// Utterance cutting: starts on sound, cuts after a pause, and caps long speech
const seg = AI.makeSegmenter({ threshold: 0.03, silenceMs: 700, maxMs: 5000 });
assert.equal(seg(0.01, 0), null);        // silence: nothing recorded
assert.equal(seg(0.5, 100), 'start');
assert.equal(seg(0.01, 500), null);      // short pause inside a sentence
assert.equal(seg(0.5, 700), null);
assert.equal(seg(0.01, 1399), null);
assert.equal(seg(0.01, 1400), 'stop');   // 700 ms after the last sound
assert.equal(seg(0.01, 1500), null);
assert.equal(seg(0.5, 2000), 'start');
assert.equal(seg(0.5, 6999), null);
assert.equal(seg(0.5, 7000), 'stop');    // still talking at the cap

// Utterance collecting: keeps a lead-in, returns the pieces when the speaker pauses, drops blips
const col = AI.makeCollector({ silenceMs: 300, leadIn: 2, minVoiced: 2 });
const feed = (name, loud) => col.push(name, loud ? 0.5 : 0.01, 100);
assert.equal(feed('q1'), null); assert.equal(feed('q2'), null); assert.equal(feed('q3'), null);
assert.equal(feed('L1', true), null); assert.equal(feed('L2', true), null);
assert.equal(feed('q4'), null); assert.equal(feed('q5'), null);
assert.deepEqual(feed('q6'), ['q2', 'q3', 'L1', 'L2', 'q4', 'q5', 'q6']);
feed('q7'); feed('blip', true); feed('q8'); feed('q9');
assert.equal(feed('q10'), null);                       // one loud piece is not speech
feed('L3', true); feed('L4', true);
assert.deepEqual(col.flush(), ['L3', 'L4']);           // stopping mid-sentence keeps what was said
assert.equal(col.flush(), null);

// WAV encoding: header and 16-bit samples
const wav = new DataView(AI.encodeWav([Float32Array.of(0, 1), Float32Array.of(-1)], 16000));
assert.equal(wav.byteLength, 44 + 6);
assert.equal(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3)), 'RIFF');
assert.equal(wav.getUint32(24, true), 16000);
assert.deepEqual([wav.getInt16(44, true), wav.getInt16(46, true), wav.getInt16(48, true)], [0, 32767, -32767]);

console.log('ok');
