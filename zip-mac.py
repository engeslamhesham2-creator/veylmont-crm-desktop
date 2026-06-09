# Package the macOS source bundle: everything needed to run/build on a Mac,
# minus node_modules, dist, .git, and secrets. Top folder = "Veylmont CRM Mac".
import os, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
TOP = "Veylmont CRM Mac"
OUT = os.path.join(ROOT, "Veylmont-CRM-Mac.zip")

INCLUDE_FILES = [
    "main.js",
    "preload.js",
    "splash.html",
    "error.html",
    "package.json",
    "README.md",
    "RUN-ON-MAC.md",
    "build/icon.png",
    "build/icon.ico",
    ".github/workflows/build-desktop.yml",
]

if os.path.exists(OUT):
    os.remove(OUT)

count = 0
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for rel in INCLUDE_FILES:
        src = os.path.join(ROOT, rel)
        if os.path.exists(src):
            z.write(src, f"{TOP}/{rel}")
            count += 1
        else:
            print("  (skip, missing):", rel)

size = os.path.getsize(OUT) / 1024.0
print(f"created {os.path.basename(OUT)}  {size:.1f} KB  ({count} files)")
