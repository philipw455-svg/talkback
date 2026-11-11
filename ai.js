// Provider layer + prompts. Loaded as a plain script in the browser and require()d by test.js.
// Messages use a neutral shape: { role, content: [{type:'text', text} | {type:'file', mime, name, data(base64)}] }

const DEFAULT_MODELS = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o' };

// The UI shows replies as plain text, so every prompt asks for plain text.
const PLAIN = 'Write plain text only: no Markdown, no LaTeX. Write math with Unicode symbols (x², √, ×, ÷, π).';

const PROMPTS = {
  math: `You are a careful math tutor. Solve the problem step by step, numbering each step and explaining why it is done. Check the result before answering. End with a line starting "Answer:". If the problem is ambiguous or unreadable, say what is unclear. ${PLAIN}`,

  qa: style => `You are an interview coach. Write the answer the candidate could say out loud, in first person. ${{
    star: 'Structure it as Situation, Task, Action, Result, with a labelled line for each.',
    concise: 'Keep it under 120 words.',
    detailed: 'Give a thorough answer, then list 3 likely follow-up questions.',
  }[style] || ''} If a resume or job description is provided, draw only on real details from them and never invent experience; where a detail is missing, leave a [bracketed placeholder] for the candidate to fill in. For technical questions, give the correct answer and the reasoning. ${PLAIN}`,

  mock: (count, type) => `You are a professional interviewer running a ${type} mock interview for the role in the job description, with a candidate whose resume is provided. Ask exactly ${count} questions, one at a time, tailored to the resume and the job. Label each "Question k/${count}:". After each answer, first give 2-3 sentences of honest, specific feedback labelled "Feedback:", then ask the next question. After the final answer, or if asked to end early, give a final report: overall score out of 10, top strengths, top improvements, and one example of a stronger answer to the weakest response. Never answer on the candidate's behalf. ${PLAIN}`,

  live: `You are a live call assistant. From the transcript, suggest what the user could say next in reply to the latest question. Lead with a one-sentence direct answer, then up to 3 short supporting points they can glance at while talking. Take facts from the provided documents, resume and job description, and never invent facts about the user. ${PLAIN}`,

  notes: `Summarize this call transcript. It comes from speech recognition, has no speaker labels and may contain errors. Give these sections: Summary (2-3 sentences), Key points, Questions asked, Decisions, Action items. Write "None" under an empty section. ${PLAIN}`,
};

// shortcut: keyword match, because browser speech recognition returns no punctuation; a missed question is covered by the "Answer now" button.
const isQuestion = t => /\?\s*$/.test(t) ||
  /^((so|and|okay|ok|well|now|alright),? )*(who|what|when|where|why|how|which|can|could|would|will|do|does|did|is|are|was|were|have|has|should|tell me|walk me|describe|explain|give me|talk about)\b/i.test(t.trim());

function toAnthropic(part) {
  if (part.type === 'text') return part;
  const source = { type: 'base64', media_type: part.mime, data: part.data };
  return { type: part.mime === 'application/pdf' ? 'document' : 'image', source };
}

function toOpenAI(part) {
  if (part.type === 'text') return part;
  const url = `data:${part.mime};base64,${part.data}`;
  return part.mime === 'application/pdf'
    ? { type: 'file', file: { filename: part.name || 'file.pdf', file_data: url } }
    : { type: 'image_url', image_url: { url } };
}

function buildRequest(cfg, system, messages) {
  const provider = cfg.provider === 'openai' ? 'openai' : 'anthropic';
  const model = cfg.model || DEFAULT_MODELS[provider];
  if (provider === 'anthropic') {
    if (!cfg.key) throw new Error('Add your API key in Settings first.');
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true', // required for calls made from a browser
      },
      body: { model, max_tokens: 4096, system, messages: messages.map(m => ({ role: m.role, content: m.content.map(toAnthropic) })) },
    };
  }
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  return {
    url: `${base}/chat/completions`,
    headers: { 'content-type': 'application/json', ...(cfg.key && { authorization: `Bearer ${cfg.key}` }) },
    body: { model, messages: [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role, content: m.content.map(toOpenAI) }))] },
  };
}

function parseResponse(provider, json) {
  const text = provider === 'openai'
    ? json.choices?.[0]?.message?.content
    : json.content?.filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text) throw new Error('The AI returned an empty reply. Try again.');
  return text.trim();
}

// shortcut: waits for the full reply instead of streaming; switch to SSE if replies feel slow.
async function complete(cfg, system, messages) {
  const req = buildRequest(cfg, system, messages);
  let res;
  try {
    res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
  } catch {
    throw new Error('Could not reach the AI provider. Check your connection and the Base URL in Settings.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || `Request failed (${res.status}).`);
  return parseResponse(cfg.provider, json);
}

// Speech to text with Groq's hosted Whisper. Takes one recorded utterance, returns its text.
async function transcribe(key, blob) {
  const form = new FormData();
  form.append('file', blob, 'audio.webm');
  form.append('model', 'whisper-large-v3-turbo');
  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
  } catch {
    throw new Error('Could not reach Groq for transcription. Check your connection.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Transcription failed: ${json.error?.message || res.status}`);
  return (json.text || '').trim();
}

// Decides when to start and cut a recording from audio level samples, so each
// recording is one utterance: it starts on sound and is cut after a pause.
// shortcut: fixed loudness threshold, so a noisy room may never "pause"; maxMs caps that. Swap in a real voice detector if it matters.
function makeSegmenter({ threshold = 0.03, silenceMs = 700, maxMs = 20000 } = {}) {
  let start = null, lastVoice = 0;
  return (level, now) => {
    const voiced = level > threshold;
    if (start === null) {
      if (!voiced) return null;
      start = lastVoice = now;
      return 'start';
    }
    if (voiced) lastVoice = now;
    if (now - lastVoice < silenceMs && now - start < maxMs) return null;
    start = null;
    return 'stop';
  };
}

const TalkbackAI = { DEFAULT_MODELS, PROMPTS, isQuestion, buildRequest, parseResponse, complete, transcribe, makeSegmenter };
if (typeof module !== 'undefined') module.exports = TalkbackAI;
