# talkback plan

Updated 2026-11-11.

## Done

- Static web app, no server: `index.html`, `styles.css`, `app.js`, `ai.js`, `test.js`.
- Tabs: Solve Math, Interview Answers, Mock Interview (resume + job description), Live Assist, Settings.
- Answers come from Claude (Anthropic API) by default, with the user's own key. An OpenAI-compatible provider is the alternative.
- Live Assist: Auto Answer, Answer now, document upload, end-of-call AI notes.
- "Grid" design (mockup 1 in `mockups.html`) applied to the real app. Dark only.
- Live listening with a Groq key: captures the shared call audio ("Them") and the microphone ("You"), cuts audio into utterances, transcribes each with Groq Whisper (`whisper-large-v3-turbo`). Without a Groq key it falls back to browser speech recognition on the microphone.
- Desktop app (Electron, `main.js`): same files in a window; "sharing" means the computer's own sound, no picker. Windows portable EXE builds locally with `npm run dist`.
- Release workflow (`.github/workflows/release.yml`): pushing a `v*` tag builds the Windows EXE and Mac DMG on GitHub and attaches them to a release.

## Verified so far

- `node test.js`: request building, question detection, utterance cutting.
- Inside the desktop app on Windows: the page loads, Anthropic and Groq are reachable from it (both answered a dummy key with 401, so nothing is blocked), the microphone opens, and the level worklet reports about 20 times a second.

## Known problems and not yet verified

- Capturing the computer's sound failed on the development PC ("Could not start audio source") with a USB headset as the output device, on Electron 45 and 39. Cause not confirmed. The app falls back to the microphone and says so. Worth retrying with speakers or a monitor as the Windows output device.
- Nothing has been run with real Claude or Groq keys, or on a real call.
- The Mac build has never been run. Mac system-sound capture is the riskiest part; it needs Screen Recording permission and may not work at all, in which case the microphone fallback applies.
- Neither build is code-signed: Windows shows a SmartScreen notice, macOS needs "Open Anyway". Signing costs roughly $99/year (Apple) and $100-400/year (Windows).

## Next steps

1. Test the desktop app with real keys on a test call, on Windows and on the Mac.
2. If system sound still fails on Windows with other output devices, investigate (try `desktopCapturer` window sources, or a virtual audio cable as a workaround).
3. Open question from the owner's message "have it link": meaning not confirmed. Best guess is "connect to the call audio automatically", which the desktop app's system-sound capture is meant to do.
4. Small leftovers: download button for AI notes, streaming replies, an app icon.

## Decisions

- No hiding from screen sharing. The app is for practice and for calls where AI help is allowed and disclosed.
- Bring-your-own keys, stored locally; nothing leaves the machine except calls to Anthropic (answers) and Groq (transcription).
- MIT license.
