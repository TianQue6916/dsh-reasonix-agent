# -*- coding: utf-8 -*-
"""Figure 9.1 needs a two-part clip: the section heading '9.1 The big picture' sits at
y 269.8-280.6 across x 65-163.8 and overlaps the figure's left column. Render an upper
strip that starts at x=190 (right of the heading) and the main body below it, then stitch
on a white canvas so the heading tail never enters the PNG."""
import os
import fitz
from PIL import Image

PDF = r"C:/Users/27063/Documents/源料-教材/MacKay信息论/MacKay信息论_p141-160.pdf"
OUT = r"C:/Users/27063/Documents/翻译产出/教材/MacKay信息论/_assets"
DPI = 400
proj = os.path.join(OUT, "..", "_assets")

doc = fitz.open(PDF)
page = doc[17]   # PDF p18

X0, X1 = 117.4, 342.8
YSPLIT = 283.0
upper = fitz.Rect(186.0, 270.0, X1, YSPLIT)
body = fitz.Rect(X0, YSPLIT, X1, 421.2)

pu = page.get_pixmap(dpi=DPI, clip=upper)
pb = page.get_pixmap(dpi=DPI, clip=body)
iu = Image.frombytes("RGB", (pu.width, pu.height), pu.samples)
ib = Image.frombytes("RGB", (pb.width, pb.height), pb.samples)

scale = DPI / 72.0
off_x = int(round((186.0 - X0) * scale))
canvas = Image.new("RGB", (ib.width, iu.height + ib.height), "white")
canvas.paste(iu, (off_x, 0))
canvas.paste(ib, (0, iu.height))
out = os.path.join(OUT, "fig_158_fig9-1_system_diagram.png")
canvas.save(out)
print("SAVED", out, canvas.size, os.path.getsize(out), "bytes")
print("upper", pu.width, pu.height, "body", pb.width, pb.height, "off_x", off_x)
doc.close()
