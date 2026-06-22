from PIL import Image
import os, json

KF = "/Users/stefan/TC BCCC/bccc-driving-range/art-src/swing"
ORDER = ["01_address.png", "02_midback.png", "03_top.png", "04_middown.png", "05_impact.png", "06_follow.png"]
# which frames to mirror so they face the target (right). address (A3) + the 4
# confirmed frames already aim right; top is pending the user's pick.
FLIP = set()
OUT = "/Users/stefan/TC BCCC/bccc-driving-range/public/assets/art/golfer-swing.png"
PAD = 24
DARK = 170

def analyze(path, flip=False):
    im = Image.open(path).convert("RGB")
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    gray = im.convert("L")
    mask = gray.point(lambda v: 255 if v < DARK else 0)
    bb = mask.getbbox()  # (l,t,r,b) of dark content
    l, t, r, b = bb
    # feet anchor: dark pixels in the bottom 16% of the content
    mpx = mask.load()
    fy0 = int(b - 0.16 * (b - t))
    minx, maxx = r, l
    for y in range(fy0, b):
        for x in range(l, r):
            if mpx[x, y]:
                if x < minx: minx = x
                if x > maxx: maxx = x
    foot_cx = (minx + maxx) / 2 if maxx >= minx else (l + r) / 2
    crop = im.crop(bb)
    return {"crop": crop, "footcx_local": foot_cx - l, "w": crop.width, "h": crop.height}

frames = [analyze(os.path.join(KF, fn), fn in FLIP) for fn in ORDER]

left_need = max(f["footcx_local"] for f in frames)
right_need = max(f["w"] - f["footcx_local"] for f in frames)
cellW = int(left_need + right_need + 2 * PAD)
cellH = int(max(f["h"] for f in frames) + 2 * PAD)
foot_x = left_need + PAD
foot_y = cellH - PAD  # feet sit near the bottom of the cell

sheet = Image.new("RGB", (cellW * len(frames), cellH), (255, 255, 255))
for i, f in enumerate(frames):
    px = int(round(i * cellW + foot_x - f["footcx_local"]))
    py = int(round(foot_y - f["h"]))
    sheet.paste(f["crop"], (px, py))

sheet.save(OUT)
meta = {"cols": len(frames), "rows": 1, "cellW": cellW, "cellH": cellH, "footAnchorY": round(foot_y / cellH, 4)}
json.dump(meta, open("/tmp/kf/swing_meta.json", "w"))
print(OUT)
print(meta)
