// Desktop shell: shows the same web app in its own window.
const { app, BrowserWindow, session, desktopCapturer } = require('electron');

app.whenReady().then(() => {
  const ses = session.defaultSession;

  // Live Assist asks to "share" audio. In the desktop app that is the computer's own sound, so there is no picker.
  // macOS asks for Screen Recording permission the first time.
  ses.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then(sources => callback({ video: sources[0], audio: 'loopback' }))
      .catch(() => callback()); // rejects the page's request, which shows its own message
  });

  // Microphone and audio capture only; nothing else is granted.
  ses.setPermissionRequestHandler((contents, permission, callback) => callback(['media', 'display-capture'].includes(permission)));

  const win = new BrowserWindow({ width: 1200, height: 800, title: 'talkback', autoHideMenuBar: true, backgroundColor: '#232323' });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(`${__dirname}/index.html`);
});

app.on('window-all-closed', () => app.quit());
