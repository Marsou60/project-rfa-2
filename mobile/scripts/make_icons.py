from PIL import Image, ImageOps
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "assets"
logo = Image.open(root / "vitrine" / "logo-union.png").convert("RGBA")

pixels = logo.load()
w, h = logo.size
minx, miny, maxx, maxy = w, h, 0, 0
for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if a < 10:
            continue
        if r > 245 and g > 245 and b > 245:
            continue
        minx = min(minx, x)
        miny = min(miny, y)
        maxx = max(maxx, x)
        maxy = max(maxy, y)

content = logo.crop((minx, miny, maxx + 1, maxy + 1))
print("content bbox", content.size)


def make_square(src, size, bg=(255, 255, 255, 255), pad_ratio=0.12):
    canvas = Image.new("RGBA", (size, size), bg)
    max_w = int(size * (1 - 2 * pad_ratio))
    max_h = int(size * (1 - 2 * pad_ratio))
    fitted = ImageOps.contain(src, (max_w, max_h))
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


icon = make_square(content, 1024, (255, 255, 255, 255), 0.10)
icon.convert("RGB").save(root / "icon.png", "PNG")
icon.convert("RGB").save(root / "favicon.png", "PNG")

fg = make_square(content, 1024, (0, 0, 0, 0), 0.18)
fg.save(root / "android-icon-foreground.png", "PNG")

Image.new("RGB", (1024, 1024), (11, 31, 58)).save(root / "android-icon-background.png", "PNG")

mono_src = content.copy()
px = mono_src.load()
for y in range(mono_src.height):
    for x in range(mono_src.width):
        r, g, b, a = px[x, y]
        if a < 10 or (r > 245 and g > 245 and b > 245):
            px[x, y] = (0, 0, 0, 0)
        else:
            px[x, y] = (0, 0, 0, 255)
make_square(mono_src, 1024, (0, 0, 0, 0), 0.18).save(root / "android-icon-monochrome.png", "PNG")

# Splash image: logo on navy
splash = Image.new("RGBA", (1024, 1024), (11, 31, 58, 255))
fitted = ImageOps.contain(content, (820, 280))
splash.paste(fitted, ((1024 - fitted.width) // 2, (1024 - fitted.height) // 2), fitted)
splash.convert("RGB").save(root / "splash-icon.png", "PNG")

content.save(root / "vitrine" / "logo-union-cropped.png", "PNG")

public = Path(__file__).resolve().parents[1] / "public"
public.mkdir(exist_ok=True)
make_square(content, 192, (255, 255, 255, 255), 0.10).convert("RGB").save(public / "logo192.png", "PNG")
make_square(content, 512, (255, 255, 255, 255), 0.10).convert("RGB").save(public / "logo512.png", "PNG")
make_square(content, 180, (255, 255, 255, 255), 0.10).convert("RGB").save(public / "apple-touch-icon.png", "PNG")
print("icons written")
