# Veylmont CRM — Desktop App

A thin native shell (Electron) that opens the **deployed CRM** (`https://keelmont.com`)
in a desktop window. Same UI, same database, same everything — just a real app on the
desktop with more control (menu, window, single-instance, native notifications).
It always stays in sync with the website because it loads the live site.

---

## 🪟 Windows — ready to use
1. Extract **`Veylmont-CRM-Windows.zip`**.
2. Open the **`Veylmont CRM`** folder → double-click **`Veylmont CRM.exe`**.
3. (Optional) right-click the exe → *Send to → Desktop* to make a shortcut, or pin to taskbar.

> It's a **portable** app — no installation needed. Copy the folder to any PC and run.
> First run, Windows SmartScreen may say "unknown publisher" → **More info → Run anyway**
> (the app isn't code-signed; signing needs a paid certificate).

---

## 🍎 macOS — build the .dmg (needs a Mac)
A signed Mac app can only be produced on macOS. On any Mac:
```bash
# install Node 20+, then in this folder:
npm install
npm run dist:mac      # -> dist/Veylmont CRM-1.0.0.dmg  (+ arm64/x64)
```
Open the `.dmg`, drag **Veylmont CRM** to Applications. First launch:
right-click the app → **Open** (Gatekeeper, because it's unsigned).

### Or build BOTH platforms automatically with GitHub Actions (no Mac needed)
Push this folder to a GitHub repo — `.github/workflows/build-desktop.yml` builds the
Windows `.exe` **and** the macOS `.dmg` on GitHub's runners and attaches them as artifacts.

---

## 🔧 Configuration
- **Change the URL** (if the domain changes): set the env var `VEYLMONT_URL`, or edit
  `APP_URL` at the top of `main.js` and rebuild.
- **Run from source** (dev): `npm install` then `npm start`.

## 🛠️ Rebuild Windows yourself
```bash
npm install
node pack-win.mjs     # manual packaging (avoids a Defender false-positive on electron-builder)
python zip-win.py     # -> Veylmont-CRM-Windows.zip
```
> We package manually because Windows Defender intermittently quarantines the copied
> `electron.exe` during `electron-builder`'s rename step. `pack-win.mjs` copies the
> runtime straight to `Veylmont CRM.exe`, which Defender leaves alone.

## Notes
- Notifications, sound, push, realtime — all work exactly like the website (it *is* the website).
- The app loads the live site, so any update you deploy shows up automatically — no need to
  rebuild the desktop app for content/feature changes.
