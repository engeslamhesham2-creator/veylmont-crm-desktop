const { contextBridge, ipcRenderer } = require("electron");

// Native geolocation bridge. Chromium's navigator.geolocation needs a Google
// API key on Windows that Electron apps don't ship with, so it always fails
// (POSITION_UNAVAILABLE). The CRM's lib/geo.ts calls this instead when it
// detects the desktop shell; the main process reads the OS location service.
contextBridge.exposeInMainWorld("veylmontDesktop", {
  getLocation: () => ipcRenderer.invoke("veylmont:get-location")
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.setAttribute("data-veylmont-desktop", "1");
});
