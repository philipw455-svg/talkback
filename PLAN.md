# talkback plan

Saved 2026-11-11. Work is paused here at the owner's request.

## Done

- Static web app, no server: `index.html`, `styles.css`, `app.js`, `ai.js`, `test.js`.
- Tabs: Solve Math, Interview Answers, Mock Interview (resume + job description), Live Assist, Settings.
- Answers come from Claude (Anthropic API) by default, with the user's own key. An OpenAI-compatible provider is the alternative.
- Live Assist: Auto Answer, Answer now, document upload, end-of-call AI notes.
- "Grid" design (mockup 1 in `mockups.html`) applied to the real app. Dark only.
- Live listening with a Groq key: captures shared tab audio ("Them") and the microphone ("You"), cuts audio into utterances, transcribes each with Groq Whisper (`whisper-large-v3-turbo`). Without a Groq key it falls back to browser speech recognition on the microphone.

## Written but not yet verified

- The shared-audio + Groq path has only been syntax-checked and unit-tested (`node test.js` covers request building, question detection and utterance cutting). It has not been run against a real call, a real Groq key or a real Claude key.
- README does not yet describe the Groq key or shared-audio listening.

## Next steps

1. Try Live Assist in Chrome with real Claude and Groq keys on a test call. Watch for: the worklet loading, utterances arriving in order, and echo (use headphones so the mic does not re-hear the other side).
2. Update `README.md` for the Groq key and shared-audio listening.
3. Windows EXE (requested, not started): wrap the same files in Electron.
   - `main.js`: one window loading `index.html`; a display-media handler that returns system audio (`audio: 'loopback'`) so the call is heard with no share picker.
   - `package.json` with `electron` and `electron-builder`, target `portable` (single `.exe`). If the builder fails on Windows symlink permissions, fall back to `@electron/packager` (folder with `talkback.exe`).
   - Browser speech recognition does not work inside Electron, so the EXE needs the Groq key for listening.
   - Unsigned build: Windows shows an "unknown publisher" warning. Code signing costs roughly $100-400/year.
4. Open question from the owner's message "have it link": meaning not confirmed. Best guess is "connect to the call audio automatically", which step 3's loopback capture does. Ask before building anything else for it.
5. Small leftovers: download button for AI notes, streaming replies.

## Decisions

- No hiding from screen sharing. The app is for practice and for calls where AI help is allowed and disclosed.
- Bring-your-own keys, stored in the browser's local storage; nothing else leaves the machine except calls to Anthropic (answers) and Groq (transcription).
- MIT license.
