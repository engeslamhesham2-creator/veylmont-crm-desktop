// Manual Windows packaging — avoids electron-builder's rename step that
// Windows Defender keeps interrupting. We never write a file literally named
// "electron.exe" into the output (Defender's heuristic target); we copy the
// runtime straight to the final "Veylmont CRM.exe".
import { cpSync, rmSync, mkdirSync, copyFileSync, writeFileSync, existsSync, statSync } from "fs";
import path from "path";
const _rc = await import("rcedit");
const rcedit = typeof _rc === "function" ? _rc : _rc.default || _rc.rcedit;

const APP_NAME = "Veylmont CRM";
const out = "dist/win-unpacked";
const elDist = "node_modules/electron/dist";

rmSync("dist", { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1) copy the electron runtime EXCEPT electron.exe
cpSync(elDist, out, {
  recursive: true,
  filter: (src) => path.basename(src).toLowerCase() !== "electron.exe"
});

// 2) place the renamed executable directly
copyFileSync(path.join(elDist, "electron.exe"), path.join(out, `${APP_NAME}.exe`));

// 3) our app -> resources/app (overrides the bundled default_app)
const appDir = path.join(out, "resources", "app");
rmSync(path.join(out, "resources", "default_app.asar"), { force: true });
mkdirSync(path.join(appDir, "build"), { recursive: true });
copyFileSync("main.js", path.join(appDir, "main.js"));
copyFileSync("preload.js", path.join(appDir, "preload.js"));
copyFileSync("splash.html", path.join(appDir, "splash.html"));
copyFileSync("error.html", path.join(appDir, "error.html"));
copyFileSync("build/icon.ico", path.join(appDir, "build", "icon.ico"));
copyFileSync("build/icon.png", path.join(appDir, "build", "icon.png"));
writeFileSync(
  path.join(appDir, "package.json"),
  JSON.stringify({ name: "veylmont-crm-desktop", productName: APP_NAME, version: "1.0.0", main: "main.js" }, null, 2)
);

// 3.5) pack app/ -> app.asar so the source code is NOT shipped as plain files.
//      End users get a sealed archive; only run, no readable .js/.html.
const asarMod = await import("@electron/asar");
const createPackage = asarMod.createPackage || (asarMod.default && asarMod.default.createPackage);
await createPackage(appDir, path.join(out, "resources", "app.asar"));
rmSync(appDir, { recursive: true, force: true });
console.log("packed app.asar — source hidden (no plain files shipped)");

// 4) brand the exe (icon + version strings) — non-fatal
try {
  await rcedit(path.join(out, `${APP_NAME}.exe`), {
    icon: "build/icon.ico",
    "version-string": {
      ProductName: APP_NAME,
      FileDescription: APP_NAME,
      CompanyName: "Veylmont",
      LegalCopyright: "Veylmont"
    }
  });
  console.log("exe icon set OK");
} catch (e) {
  console.log("rcedit skipped:", e.message);
}

const exe = path.join(out, `${APP_NAME}.exe`);
console.log("exe exists:", existsSync(exe), existsSync(exe) ? statSync(exe).size + " bytes" : "");
console.log("packed ->", out);
