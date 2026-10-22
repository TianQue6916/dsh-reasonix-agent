import subprocess, sys, os, fitz
html, raw, out = sys.argv[1], sys.argv[2], sys.argv[3]
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if os.path.exists(raw): os.remove(raw)
subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
                "--print-to-pdf=" + raw, "file:///" + html.replace("\\", "/")], timeout=110, check=False)
d = fitz.open(raw)
f = fitz.Font('china-s')
for i, pg in enumerate(d):
    t = "— %d —" % (i + 1)
    w = f.text_length(t, fontsize=11)
    pg.insert_text((pg.rect.width / 2 - w / 2, pg.rect.height - 34), t, fontname='china-s', fontsize=11)
d.save(out)
d2 = fitz.open(out)
tails = [d2[i].get_text().strip()[-6:].replace("\n", " ") for i in range(d2.page_count)]
print("OUT", out, "pages", d2.page_count, "bytes", os.path.getsize(out), "tails", tails)
