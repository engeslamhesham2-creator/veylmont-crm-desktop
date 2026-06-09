// Reserved for future native bridges (e.g. exposing app version to the page).
// Intentionally minimal — the CRM runs as the normal web app inside this shell.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.setAttribute("data-veylmont-desktop", "1");
});
