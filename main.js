const { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, Notification, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

// The deployed CRM. Override at runtime with VEYLMONT_URL if the domain changes.
const APP_URL = process.env.VEYLMONT_URL || "https://keelmont.com";

// Auto-update only activates in electron-builder / CI builds (deps bundled +
// app-update.yml present). In the manual portable build it is simply absent.
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch {
  /* not bundled */
}

let mainWindow = null;
let splash = null;
let tray = null;

// --- window bounds persistence ---------------------------------------------
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return {};
  }
}
function saveState() {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
      fs.writeFileSync(stateFile(), JSON.stringify(mainWindow.getBounds()));
    }
  } catch {
    /* ignore */
  }
}

function iconPath() {
  return path.join(__dirname, "build", process.platform === "win32" ? "icon.ico" : "icon.png");
}

// --- branded splash ---------------------------------------------------------
function createSplash() {
  splash = new BrowserWindow({
    width: 460,
    height: 360,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: "#02101c",
    alwaysOnTop: true,
    skipTaskbar: true
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.on("closed", () => (splash = null));
}
function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.close();
  splash = null;
}

function fadeIn(win) {
  let o = 0;
  const step = () => {
    if (!win || win.isDestroyed()) return;
    o = Math.min(1, o + 0.09);
    win.setOpacity(o);
    if (o < 1) setTimeout(step, 16);
  };
  step();
}

function showMain() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  const s = loadState();
  mainWindow = new BrowserWindow({
    width: s.width || 1280,
    height: s.height || 820,
    x: s.x,
    y: s.y,
    minWidth: 980,
    minHeight: 620,
    show: false,
    opacity: 0,
    backgroundColor: "#02101c",
    title: "Veylmont CRM",
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      spellcheck: true
    }
  });

  mainWindow.loadURL(APP_URL);

  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    closeSplash();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      fadeIn(mainWindow);
    }
  };
  mainWindow.webContents.once("did-finish-load", () => setTimeout(reveal, 350));
  mainWindow.once("ready-to-show", () => setTimeout(reveal, 450));
  setTimeout(reveal, 9000);

  // Premium offline screen instead of Chromium's error page.
  mainWindow.webContents.on("did-fail-load", (e, errorCode, _desc, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      mainWindow.loadFile(path.join(__dirname, "error.html"), { query: { u: APP_URL } });
      reveal();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(APP_URL) && /^https?:\/\//.test(url) && !url.includes("supabase.co") && !url.startsWith("file:")) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Minimize to tray on close so realtime + notifications keep running.
  mainWindow.on("close", (e) => {
    saveState();
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => (mainWindow = null));
}

// --- system tray ------------------------------------------------------------
function createTray() {
  let img = nativeImage.createFromPath(iconPath());
  if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip("Veylmont CRM");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Veylmont CRM", click: showMain },
      { label: "Reload", click: () => mainWindow && mainWindow.loadURL(APP_URL) },
      { type: "separator" },
      { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } }
    ])
  );
  tray.on("click", showMain);
  tray.on("double-click", showMain);
}

// --- native geolocation (Windows Location Service) ---------------------------
// navigator.geolocation inside Electron on Windows requires a Google API key
// (Chromium network location provider) — without one it always fails. So the
// renderer asks us (via preload) and we read the position straight from the
// Windows Location Service with PowerShell's GeoCoordinateWatcher. Requires
// Windows Settings → Privacy → Location to be ON for desktop apps.
const GEO_PS_SCRIPT = `
Add-Type -AssemblyName System.Device
$w = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::Default)
$w.Start()
$deadline = (Get-Date).AddSeconds(18)
while ((Get-Date) -lt $deadline) {
  if ($w.Permission -eq 'Denied') { Write-Output 'DENIED'; $w.Stop(); exit }
  $c = $w.Position.Location
  if (-not $c.IsUnknown) {
    $ci = [System.Globalization.CultureInfo]::InvariantCulture
    Write-Output ("OK " + $c.Latitude.ToString($ci) + "," + $c.Longitude.ToString($ci) + "," + $c.HorizontalAccuracy.ToString($ci))
    $w.Stop(); exit
  }
  Start-Sleep -Milliseconds 250
}
Write-Output 'TIMEOUT'
$w.Stop()
`;

function windowsLocation() {
  return new Promise((resolve, reject) => {
    // -EncodedCommand (UTF-16LE base64) avoids every quoting/newline pitfall.
    const encoded = Buffer.from(GEO_PS_SCRIPT, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { timeout: 25000, windowsHide: true },
      (err, stdout) => {
        const out = (stdout || "").trim();
        if (out.startsWith("OK ")) {
          const [lat, lng, acc] = out.slice(3).split(",").map(Number);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            // HorizontalAccuracy can be NaN on some providers — assume coarse.
            resolve({ lat, lng, accuracy: Number.isFinite(acc) ? acc : 500 });
            return;
          }
        }
        if (out.includes("DENIED")) reject(new Error("GEO_DENIED"));
        else if (out.includes("TIMEOUT") || (err && err.killed)) reject(new Error("GEO_TIMEOUT"));
        else reject(new Error("GEO_UNAVAILABLE"));
      }
    );
  });
}

ipcMain.handle("veylmont:get-location", async () => {
  // macOS/Linux: Chromium geolocation generally works there — tell the page
  // to fall back to navigator.geolocation.
  if (process.platform !== "win32") return { error: "GEO_FALLBACK" };
  try {
    return await windowsLocation();
  } catch (e) {
    return { error: e.message || "GEO_UNAVAILABLE" };
  }
});

// --- app lifecycle ----------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMain);

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(true));
    buildMenu();
    createTray();
    createSplash();
    createWindow();

    if (autoUpdater) {
      // Silent, in-app updates — the user never visits a website. The app
      // downloads the update in the background, then offers a one-click restart.
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      let promptShown = false;

      autoUpdater.on("update-available", (info) => {
        if (Notification.isSupported()) {
          new Notification({
            title: "Veylmont CRM",
            body: `جارِ تنزيل تحديث جديد (${info?.version || ""})…`
          }).show();
        }
      });

      autoUpdater.on("update-downloaded", (info) => {
        if (promptShown) return;
        promptShown = true;
        const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
        dialog
          .showMessageBox(win, {
            type: "info",
            buttons: ["إعادة التشغيل الآن", "لاحقًا"],
            defaultId: 0,
            cancelId: 1,
            title: "تحديث جديد جاهز",
            message: `وصل تحديث جديد لتطبيق Veylmont CRM (${info?.version || ""}).`,
            detail: "هيتم تثبيته وإعادة تشغيل البرنامج فورًا. لو اخترت لاحقًا، هيتثبّت تلقائيًا عند إغلاق البرنامج."
          })
          .then((res) => {
            if (res.response === 0) {
              app.isQuitting = true;
              autoUpdater.quitAndInstall(); // installs + relaunches into the new version
            }
          })
          .catch(() => {});
      });

      autoUpdater.on("error", () => {
        /* offline / no feed — ignore, retry next check */
      });

      autoUpdater.checkForUpdates().catch(() => {});
      // re-check every 2 hours so a freshly published release reaches users fast
      setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 2 * 60 * 60 * 1000);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createSplash();
        createWindow();
      } else {
        showMain();
      }
    });
  });
}

app.on("before-quit", () => (app.isQuitting = true));
app.on("window-all-closed", () => {
  // Stay alive in the tray; only the tray "Quit" fully exits.
  if (app.isQuitting && process.platform !== "darwin") app.quit();
});

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    {
      label: "Veylmont CRM",
      submenu: [
        { label: "Home", accelerator: "CmdOrCtrl+H", click: () => mainWindow && mainWindow.loadURL(APP_URL) },
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => mainWindow && mainWindow.reload() },
        { type: "separator" },
        { label: "Quit", accelerator: isMac ? "Cmd+Q" : "Ctrl+Q", click: () => { app.isQuitting = true; app.quit(); } }
      ]
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { label: "Developer Tools", accelerator: "F12", click: () => mainWindow && mainWindow.webContents.toggleDevTools() }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
