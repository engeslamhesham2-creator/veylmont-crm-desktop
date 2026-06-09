import zipfile, os

root = "dist/win-unpacked"
out = "Veylmont-CRM-Windows.zip"
top = "Veylmont CRM"
if os.path.exists(out):
    os.remove(out)
n = 0
zf = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6)
for dp, dns, fns in os.walk(root):
    for fn in fns:
        full = os.path.join(dp, fn)
        rel = os.path.relpath(full, root).replace(os.sep, "/")
        try:
            zf.write(full, top + "/" + rel)
            n += 1
        except Exception as e:
            print("skip", rel, e)
zf.close()
print("created %s  %.1f MB  (%d files)" % (out, os.path.getsize(out) / 1024 / 1024, n))
