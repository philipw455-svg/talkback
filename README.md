# talkback

An open source AI practice partner for math and job interviews. No server, no account, no build step: it is a static page that talks straight to the AI provider you choose, with your own key.

## What it does

- **Solve Math**: type a problem or attach a photo of one, get a numbered step-by-step solution, and ask follow-ups.
- **Interview Answers**: paste any interview question and get an answer you could say out loud (STAR, concise or detailed), tailored to your resume and the job description when you have added them.
- **Mock Interview**: upload your resume (PDF or text) and the job description. An AI interviewer asks tailored questions one at a time, gives feedback on each answer, and finishes with a scored report. You can dictate answers and have questions read aloud in browsers that support it.
- **Live Assist**: listens to a call, shows who said what, and suggests an answer when the other side asks a question (Auto Answer) or when you press Answer now. Add documents (briefs, notes, playbooks) for it to draw on. End the call to get AI notes: summary, key points, questions, decisions and action items.
  - With a Groq API key in Settings (free at console.groq.com): share the call's tab with "Also share tab audio" on. The tab is transcribed as "Them" and your microphone as "You", using Groq's hosted Whisper. Chrome or Edge. Use headphones so the microphone does not pick up the other side twice.
  - Without one: browser speech recognition on your microphone only (Chrome, Edge or Safari).

## Run it

Open `index.html` in a browser. Then go to **Settings** and pick a provider:

| Provider | What you need |
| --- | --- |
| Anthropic (Claude) | An API key from console.anthropic.com |
| OpenAI-compatible | An API key, or a local server such as Ollama (`http://localhost:11434/v1`, no key) |

Photo and PDF upload need a model that accepts images and files.

If your browser blocks requests from a `file://` page, serve the folder instead:

```bash
npx serve .
```

## Privacy

Your keys are kept in this browser's local storage. Your resume, job description and questions are sent only to the provider you chose. With a Groq key, call audio is sent to Groq to be transcribed. Nothing else leaves your machine.

## Use it honestly

talkback is for practice, study and calls where AI help is allowed. It does not hide itself from screen sharing. Tell the people on a call that you are using it, and do not use it in an interview or exam that forbids AI help. In Chrome, speech recognition sends microphone audio to the browser vendor's speech service.

## Develop

```bash
node test.js
```

- `index.html`, `styles.css`: the UI
- `app.js`: UI behaviour
- `ai.js`: provider requests and prompts (the part covered by `test.js`)

## License

MIT, see [LICENSE](LICENSE).
