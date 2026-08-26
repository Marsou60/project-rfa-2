"""Generate Expo app icons from Groupement Union brand logo."""
from PIL import Image
from pathlib import Path
import numpy as np

src_path = Path(r"frontend\public\marques\GROUPEMENT UNIO LOGO.png")
out = Path(r"mobile\assets")
out.mkdir(parents=True, exist_ok=True)

full = Image.open(src_path).convert("RGBA")
bbox = full.getbbox()
if bbox:
    full = full.crop(bbox)

# Extract left emblem (first content run) for square app icon
arr = np.array(full)
alpha = arr[:, :, 3]
lum = arr[:, :, :3].mean(axis=2)
mask = (alpha > 20) & (lum > 15)
cols = mask.any(axis=0)
runs = []
start = None
for i, v in enumerate(cols):
    if v and start is None:
        start = i
    if not v and start is not None:
        runs.append((start, i - 1))
        start = None
if start is not None:
    runs.append((start, len(cols) - 1))

if runs:
    a, b = runs[0]
    a = max(0, a - 2)
    b = min(full.width - 1, b + 2)
    emblem = full.crop((a, 0, b + 1, full.height))
    eb = emblem.getbbox()
    if eb:
        emblem = emblem.crop(eb)
else:
    emblem = full

print(f"full: {full.size}  emblem: {emblem.size}")


def fit_on_canvas(logo: Image.Image, size: int, bg, pad_ratio: float = 0.14) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    max_side = int(size * (1 - 2 * pad_ratio))
    scale = min(max_side / logo.width, max_side / logo.height)
    nw, nh = max(1, int(logo.width * scale)), max(1, int(logo.height * scale))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


NAVY = (11, 31, 58, 255)

# Square icons = emblem only (readable at small size)
icon = fit_on_canvas(emblem, 1024, NAVY, pad_ratio=0.16)
icon.save(out / "icon.png", optimize=True)

fg = fit_on_canvas(emblem, 1024, (0, 0, 0, 0), pad_ratio=0.20)
fg.save(out / "android-icon-foreground.png", optimize=True)

Image.new("RGBA", (1024, 1024), NAVY).save(out / "android-icon-background.png")

g = emblem.convert("L")
mono_rgba = Image.merge("RGBA", (g, g, g, g))
fit_on_canvas(mono_rgba, 1024, (0, 0, 0, 0), pad_ratio=0.20).save(
    out / "android-icon-monochrome.png", optimize=True
)

# Splash / in-app = full horizontal logo
splash = Image.new("RGBA", (1284, 2778), NAVY)
logo_w = 900
scale = logo_w / full.width
logo = full.resize((logo_w, max(1, int(full.height * scale))), Image.Resampling.LANCZOS)
splash.paste(logo, ((1284 - logo.width) // 2, (2778 - logo.height) // 2 - 100), logo)
splash.save(out / "splash-icon.png", optimize=True)

mark_w = 320
mark = full.resize((mark_w, max(1, int(mark_w * full.height / full.width))), Image.Resampling.LANCZOS)
mark.save(out / "union-mark.png", optimize=True)

fit_on_canvas(emblem, 96, NAVY, pad_ratio=0.12).save(out / "favicon.png")

# Clean copy for marques folder
(out / "marques").mkdir(exist_ok=True)
full.save(out / "marques" / "GROUPEMENTUNION.png", optimize=True)
emblem.save(out / "_emblem.png", optimize=True)

print("OK")
for name in ("icon.png", "union-mark.png", "splash-icon.png", "android-icon-foreground.png"):
    print(name, (out / name).stat().st_size)
