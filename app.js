const $ = s => document.querySelector(s);
const AI = TalkbackAI;
const MAX_FILE = 10 * 1024 * 1024;
const text = t => ({ type: 'text', text: t });

// ---------- settings ----------
let settings = {};
try { settings = JSON.parse(localStorage.getItem('talkback.cfg')) || {}; } catch { /* storage blocked: keep in memory */ }

const settingsForm = $('#settings-form');
function syncModelPlaceholder() {
  $('#set-model').placeholder = AI.DEFAULT_MODELS[$('#set-provider').value];
}
for (const [name, value] of Object.entries(settings)) {
  if (settingsForm.elements[name]) settingsForm.elements[name].value = value;
}
syncModelPlaceholder();
$('#set-provider').onchange = syncModelPlaceholder;
settingsForm.onsubmit = e => {
  e.preventDefault();
  settings = Object.fromEntries([...new FormData(settingsForm)].map(([k, v]) => [k, v.trim()]));
  let saved = 'Saved.';
  try { localStorage.setItem('talkback.cfg', JSON.stringify(settings)); } catch { saved = 'Saved for this visit only (browser storage is blocked).'; }
  $('#settings-status').textContent = saved;
};

// ---------- tabs ----------
const navButtons = document.querySelectorAll('nav button');
navButtons.forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(s => s.hidden = s.id !== b.dataset.tab);
  navButtons.forEach(n => n === b ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current'));
});

// ---------- shared helpers ----------
function bubble(thread, role, content) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = content;
  thread.append(el);
  el.scrollIntoView({ block: 'end' });
  return el;
}

// Sends the conversation, shows the reply (or the error) in the thread. Returns the reply, or null on failure.
async function run(thread, system, messages, buttons) {
  const el = bubble(thread, 'pending', 'Thinking…');
  buttons.forEach(b => b.disabled = true);
  try {
    const reply = await AI.complete(settings, system, messages);
    el.className = 'msg';
    el.textContent = reply;
    return reply;
  } catch (err) {
    el.className = 'msg error';
    el.textContent = err.message;
    return null;
  } finally {
    buttons.forEach(b => b.disabled = false);
    el.scrollIntoView({ block: 'end' });
  }
}

function readFile(file, asText) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    asText ? r.readAsText(file) : r.readAsDataURL(file);
  });
}
async function filePart(file) {
  return { type: 'file', mime: file.type, name: file.name, data: (await readFile(file)).split(',')[1] };
}
const tooBig = file => file.size > MAX_FILE ? `${file.name} is over 10 MB.` : '';

// Enter sends, Shift+Enter adds a line.
document.querySelectorAll('.composer textarea').forEach(t => t.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); t.form.requestSubmit(); }
}));

// ---------- math ----------
let mathHistory = [];
$('#math-image').onchange = e => {
  const f = e.target.files[0];
  $('#math-image-name').textContent = f ? (tooBig(f) || f.name) : '';
  if (f && tooBig(f)) e.target.value = '';
};
$('#math-clear').onclick = () => { mathHistory = []; $('#math-thread').replaceChildren(); };
$('#math-form').onsubmit = async e => {
  e.preventDefault();
  const input = $('#math-input'), fileInput = $('#math-image');
  const problem = input.value.trim(), image = fileInput.files[0];
  if (!problem && !image) return input.focus();

  const content = [];
  if (image) content.push(await filePart(image));
  content.push(text(problem || 'Solve the problem in this image.'));
  bubble($('#math-thread'), 'user', (image ? `[photo: ${image.name}] ` : '') + problem);
  input.value = ''; fileInput.value = ''; $('#math-image-name').textContent = '';

  const history = mathHistory; // a Clear during the request starts a new array
  history.push({ role: 'user', content });
  const reply = await run($('#math-thread'), AI.PROMPTS.math, history, [e.target.querySelector('.btn:not(.ghost)')]);
  if (reply === null) { history.pop(); input.value = problem; }
  else history.push({ role: 'assistant', content: [text(reply)] });
};

// ---------- resume + job description (shared by Interview Answers and Mock Interview) ----------
let resumePdf = null;
$('#resume-file').onchange = async e => {
  const f = e.target.files[0], name = $('#resume-name');
  if (!f) return;
  resumePdf = null;
  if (tooBig(f)) name.textContent = tooBig(f);
  else if (f.type === 'application/pdf') { resumePdf = await filePart(f); name.textContent = `Using ${f.name}`; }
  else if (f.type.startsWith('text/') || /\.(txt|md)$/i.test(f.name)) { $('#resume-text').value = await readFile(f, true); name.textContent = ''; }
  else name.textContent = 'Use a .pdf, .txt or .md file (for Word, save as PDF or paste the text).';
  e.target.value = '';
};
$('#jd-file').onchange = async e => {
  const f = e.target.files[0];
  if (f && !tooBig(f)) $('#jd-text').value = await readFile(f, true);
  e.target.value = '';
};
function contextParts() {
  const parts = [], resume = $('#resume-text').value.trim(), jd = $('#jd-text').value.trim();
  if (resumePdf) parts.push(text('RESUME (attached file):'), resumePdf);
  if (resume) parts.push(text(`RESUME:\n${resume}`));
  if (jd) parts.push(text(`JOB DESCRIPTION:\n${jd}`));
  return [...parts, ...documents];
}

// ---------- interview answers ----------
$('#qa-clear').onclick = () => $('#qa-thread').replaceChildren();
$('#qa-form').onsubmit = async e => {
  e.preventDefault();
  const input = $('#qa-input'), question = input.value.trim();
  if (!question) return input.focus();
  bubble($('#qa-thread'), 'user', question);
  input.value = '';
  const messages = [{ role: 'user', content: [...contextParts(), text(`INTERVIEW QUESTION:\n${question}`)] }];
  const reply = await run($('#qa-thread'), AI.PROMPTS.qa($('#qa-style').value), messages, [e.target.querySelector('.btn:not(.ghost)')]);
  if (reply === null) input.value = question;
};

// ---------- mock interview ----------
let mock = null;
const mockButtons = [$('#mock-send'), $('#mock-end')];
function showMockSetup(error = '') {
  mock = null;
  speechSynthesis?.cancel();
  $('#mock-error').textContent = error;
  $('#mock-setup').hidden = false;
  $('#mock-chat').hidden = true;
}
async function mockTurn(sent) {
  const session = mock;
  const reply = await run($('#mock-thread'), session.system, session.messages, mockButtons);
  if (mock !== session) return; // interview was restarted while waiting
  if (reply === null) {
    session.messages.pop();
    if (!session.messages.length) return showMockSetup('Could not start: ' + $('#mock-thread').lastChild.textContent);
    if (sent) $('#mock-input').value = sent;
    return;
  }
  session.messages.push({ role: 'assistant', content: [text(reply)] });
  if ($('#mock-speak').checked) speechSynthesis?.speak(new SpeechSynthesisUtterance(reply));
}
$('#mock-setup').onsubmit = e => {
  e.preventDefault();
  const context = contextParts();
  if (!context.length) return showMockSetup('Add your resume or the job description first.');
  mock = {
    system: AI.PROMPTS.mock(+$('#mock-count').value, $('#mock-type').value),
    messages: [{ role: 'user', content: [...context, text('Begin the interview.')] }],
  };
  $('#mock-thread').replaceChildren();
  $('#mock-setup').hidden = true;
  $('#mock-chat').hidden = false;
  mockTurn();
};
function mockSend(message, shown) {
  bubble($('#mock-thread'), 'user', shown);
  mock.messages.push({ role: 'user', content: [text(message)] });
  mockTurn(message === shown ? message : '');
}
$('#mock-form').onsubmit = e => {
  e.preventDefault();
  const input = $('#mock-input'), answer = input.value.trim();
  if (!answer || !mock) return input.focus();
  input.value = '';
  mockSend(answer, answer);
};
$('#mock-end').onclick = () => mock && mockSend('End the interview now and give the final report.', '[Ended interview, requested report]');
$('#mock-new').onclick = () => showMockSetup();

// Dictation where the browser supports it (Chrome, Edge, Safari).
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
  const mic = $('#mock-mic'), rec = new Recognition();
  rec.continuous = true;
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) $('#mock-input').value += e.results[i][0].transcript + ' ';
  };
  rec.onend = () => { mic.setAttribute('aria-pressed', 'false'); mic.textContent = 'Dictate'; };
  mic.hidden = false;
  mic.onclick = () => {
    if (mic.getAttribute('aria-pressed') === 'true') return rec.stop();
    rec.start();
    mic.setAttribute('aria-pressed', 'true');
    mic.textContent = 'Stop dictating';
  };
}

// ---------- live assist ----------
let documents = [], docNames = [], transcript = [];
const liveThread = $('#live-thread'), liveError = $('#live-error');

function showDocs(note = '') {
  $('#live-docs').textContent = [docNames.join(', '), note].filter(Boolean).join(' · ');
  $('#live-docs-clear').hidden = !docNames.length;
}
$('#live-docs-file').onchange = async e => {
  let note = '';
  for (const f of e.target.files) {
    if (tooBig(f)) note = tooBig(f);
    else if (f.type === 'application/pdf') documents.push(text(`DOCUMENT ${f.name} (attached file):`), await filePart(f));
    else if (f.type.startsWith('text/') || /\.(txt|md)$/i.test(f.name)) documents.push(text(`DOCUMENT ${f.name}:\n${await readFile(f, true)}`));
    else { note = `${f.name} skipped: use .pdf, .txt or .md.`; continue; }
    if (!tooBig(f)) docNames.push(f.name);
  }
  e.target.value = '';
  showDocs(note);
};
$('#live-docs-clear').onclick = () => { documents = []; docNames = []; showDocs(); };

function liveAnswer(question) {
  const recent = transcript.slice(-30).join('\n'); // enough context without resending a whole call
  run(liveThread, AI.PROMPTS.live, [{ role: 'user', content: [...contextParts(), text(`TRANSCRIPT SO FAR:\n${recent}\n\nSUGGEST A REPLY TO:\n${question}`)] }], []);
}
$('#live-answer').onclick = () => {
  liveError.textContent = transcript.length ? '' : 'Nothing heard yet.';
  if (transcript.length) liveAnswer(transcript.at(-1));
};

let stopListening = () => {};
$('#live-notes').onclick = async e => {
  stopListening();
  liveError.textContent = transcript.length ? '' : 'Nothing heard yet, so there is nothing to summarize.';
  if (!transcript.length) return;
  const session = transcript;
  transcript = []; // the next call starts a fresh transcript
  const reply = await run(liveThread, AI.PROMPTS.notes, [{ role: 'user', content: [text(`TRANSCRIPT:\n${session.join('\n')}`)] }], [e.target]);
  if (reply === null) transcript = [...session, ...transcript]; // keep it so notes can be retried
};

function heard(said, who) {
  if (!said) return;
  const line = who ? `${who}: ${said}` : said;
  transcript.push(line);
  bubble(liveThread, 'user', line);
  // With speaker labels, only the other side's questions trigger an answer.
  if (who !== 'You' && $('#live-auto').checked && AI.isQuestion(said)) liveAnswer(line);
}

// Fallback without a Groq key: browser speech recognition. Keyless, but hears only the microphone.
function startBrowser() {
  if (!Recognition) throw new Error('Add a Groq key in Settings to listen to a call. Without one, live listening needs Chrome, Edge or Safari.');
  const rec = new Recognition();
  let active = true;
  rec.continuous = true;
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) heard(e.results[i][0].transcript.trim());
  };
  rec.onerror = e => {
    const fatal = {
      'not-allowed': 'Microphone access was blocked. Allow it and try again.',
      'service-not-allowed': 'Microphone access was blocked. Allow it and try again.',
      network: 'Browser speech recognition is not available here. Add a Groq key in Settings.',
    }[e.error];
    if (!fatal) return;
    stopListening();
    liveError.textContent = fatal;
  };
  rec.onend = () => { if (active) rec.start(); }; // the browser stops after a silence
  rec.start();
  return () => { active = false; rec.stop(); };
}

// Reports the audio level about 20 times a second. It runs on the audio thread, so it keeps
// working while this window is in the background (timers are throttled there).
const LEVEL_WORKLET = URL.createObjectURL(new Blob([`registerProcessor('level', class extends AudioWorkletProcessor {
  constructor() { super(); this.peak = 0; this.blocks = 0; }
  process([input]) {
    for (const s of input[0] || []) this.peak = Math.max(this.peak, Math.abs(s));
    if (++this.blocks === 16) { this.port.postMessage(this.peak); this.peak = this.blocks = 0; }
    return true;
  }
});`], { type: 'text/javascript' }));

// Records one stream an utterance at a time and sends each to Groq. Returns a function that flushes the last one.
function watchStream(ctx, stream, who, key) {
  const audio = new MediaStream(stream.getAudioTracks());
  const node = new AudioWorkletNode(ctx, 'level'), segment = AI.makeSegmenter();
  let rec;
  ctx.createMediaStreamSource(audio).connect(node).connect(ctx.destination); // the node outputs silence; connecting it keeps it running
  node.port.onmessage = e => {
    const action = segment(e.data, performance.now());
    if (action === 'start') {
      const chunks = [], r = rec = new MediaRecorder(audio);
      r.ondataavailable = d => chunks.push(d.data);
      r.onstop = () => AI.transcribe(key, new Blob(chunks, { type: r.mimeType }))
        .then(said => heard(said, who), err => { liveError.textContent = err.message; });
      r.start();
    } else if (action === 'stop' && rec.state === 'recording') rec.stop();
  };
  return () => { if (rec?.state === 'recording') rec.stop(); };
}

// With a Groq key: the shared call audio is "Them", the microphone is "You".
async function startGroq() {
  let shared = null;
  try { shared = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); }
  catch (err) {
    // NotReadableError: the computer's sound could not be opened (seen with some USB headsets). Carry on with the microphone.
    if (err.name !== 'NotReadableError') throw new Error('Sharing was cancelled, so nothing is being heard.');
  }
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
  if (!shared && !mic) throw new Error('Neither the computer\'s sound nor the microphone could be opened.');
  const ctx = new AudioContext(), flush = [];
  const stop = () => {
    flush.forEach(f => f());
    [shared, mic].forEach(s => s?.getTracks().forEach(t => t.stop()));
    ctx.close();
  };
  try {
    if (shared && !shared.getAudioTracks().length) throw new Error('No audio was shared. Pick the tab with your call and turn on "Also share tab audio".');
    await ctx.audioWorklet.addModule(LEVEL_WORKLET);
    if (shared) flush.push(watchStream(ctx, shared, 'Them', settings.groqKey));
    // Without the shared sound the microphone may hear both sides, so its lines get no label.
    if (mic) flush.push(watchStream(ctx, mic, shared ? 'You' : undefined, settings.groqKey));
    if (!mic) liveError.textContent = 'Microphone is blocked, so only the other side is transcribed.';
    if (!shared) liveError.textContent = 'Could not capture this computer\'s sound, so only your microphone is heard. Play the call on speakers, or switch the sound output away from a USB headset and try again.';
  } catch (err) { stop(); throw err; }
  shared?.getTracks().forEach(t => t.onended = () => stopListening()); // user pressed the browser's "Stop sharing"
  return stop;
}

const toggle = $('#live-toggle');
let stopCapture = null;
const showListening = on => {
  toggle.setAttribute('aria-pressed', on);
  toggle.textContent = on ? 'Stop listening' : 'Start listening';
};
stopListening = () => {
  if (!stopCapture) return;
  stopCapture();
  stopCapture = null;
  showListening(false);
};
toggle.onclick = async () => {
  liveError.textContent = '';
  if (stopCapture) return stopListening();
  toggle.disabled = true; // the share picker may be open
  try {
    stopCapture = settings.groqKey ? await startGroq() : startBrowser();
    showListening(true);
  } catch (err) { liveError.textContent = err.message; }
  finally { toggle.disabled = false; }
};
