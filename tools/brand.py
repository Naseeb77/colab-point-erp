"""Fetch CoLab Point's logo + colours from colabpoint.com and build app icons.
Runs on GitHub Actions (needs internet). Writes into web/brand/ and web/icons/."""
import json, re, io, urllib.request, collections, os
from PIL import Image

SITE = "https://colabpoint.com/"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept": "image/png,image/*;q=0.8,*/*;q=0.5"}
OUT = "web/brand"; ICONS = "web/icons"
os.makedirs(OUT, exist_ok=True); os.makedirs(ICONS, exist_ok=True)

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()

html = get(SITE).decode("utf-8", "ignore")
css_links = re.findall(r'href=["\']([^"\']+\.css[^"\']*)["\']', html)
css = ""
for u in css_links[:25]:
    if "elementor" in u or "post-" in u or "kit" in u or "style" in u:
        try: css += get(u if u.startswith("http") else SITE.rstrip("/") + u).decode("utf-8", "ignore")
        except Exception: pass
text = html + css
glob = dict(re.findall(r'--e-global-color-([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})', text))
hexes = collections.Counter(h.lower() for h in re.findall(r'#[0-9a-fA-F]{6}\b', text))

logos = []
for m in re.finditer(r'<img[^>]+src=["\']([^"\']+)["\'][^>]*>', html):
    tag, src = m.group(0), m.group(1)
    if "logo" in tag.lower() or "logo" in src.lower():
        logos.append(src)
logos += ["https://colabpoint.com/wp-content/uploads/2025/03/cropped-logoicon.png", "https://colabpoint.com/wp-content/uploads/2025/03/cropped-logoicon-270x270.png", "https://colabpoint.com/wp-content/uploads/2025/03/cropped-logoicon-192x192.png"]
icon = re.search(r'<link[^>]+rel=["\'](?:apple-touch-icon|icon)["\'][^>]+href=["\']([^"\']+)', html)
if icon: logos.append(icon.group(1))
logos = list(dict.fromkeys(logos))

saved = []
for i, u in enumerate(logos[:8]):
    try:
        data = get(u if u.startswith("http") else SITE.rstrip("/") + u)
        ext = ".svg" if u.lower().endswith(".svg") else ".png"
        name = f"logo-{i}{ext}"
        open(f"{OUT}/raw-{i}.bin", "wb").write(data[:200000])
        if ext == ".png":
            Image.open(io.BytesIO(data)).convert("RGBA").save(f"{OUT}/{name}")
        else:
            open(f"{OUT}/{name}", "wb").write(data)
        saved.append({"url": u, "file": name})
    except Exception as e:
        saved.append({"url": u, "error": str(e)})

def dominant(path, n=6):
    im = Image.open(path).convert("RGBA"); im.thumbnail((300, 300))
    px = [p for p in im.getdata() if p[3] > 200 and not (p[0] > 235 and p[1] > 235 and p[2] > 235)]
    if not px: return []
    small = Image.new("RGB", (len(px), 1)); small.putdata([p[:3] for p in px])
    q = small.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n * 3]; counts = sorted(q.getcolors(), reverse=True)
    return [{"hex": "#%02x%02x%02x" % tuple(pal[i*3:i*3+3]), "share": round(c/len(px), 3)} for c, i in counts]

report = {"elementor_globals": glob, "top_hex_in_css": hexes.most_common(20), "logos": saved, "logo_colors": {}}
main = None
for s in saved:
    if s.get("file", "").endswith(".png"):
        report["logo_colors"][s["file"]] = dominant(f"{OUT}/{s['file']}")
        if main is None: main = f"{OUT}/{s['file']}"

squares = []
for sv in saved:
    f = sv.get("file", "")
    if f.endswith(".png"):
        im = Image.open(f"{OUT}/{f}")
        if abs(im.width - im.height) <= 2: squares.append((im.width, f))
if squares:
    main = f"{OUT}/{max(squares)[1]}"
report["icon_source"] = main
if main:
    logo = Image.open(main).convert("RGBA")
    bbox = logo.getbbox()
    if bbox: logo = logo.crop(bbox)
    logo.save(f"{OUT}/logo.png")
    def square(size, pad, bg):
        canvas = Image.new("RGBA", (size, size), bg)
        inner = int(size * (1 - 2 * pad)); l = logo.copy(); l.thumbnail((inner, inner), Image.LANCZOS)
        canvas.alpha_composite(l, ((size - l.width) // 2, (size - l.height) // 2))
        return canvas
    for s in (192, 512):
        square(s, 0.12, (255, 255, 255, 255)).save(f"{ICONS}/icon-{s}.png")
        square(s, 0.22, (255, 255, 255, 255)).save(f"{ICONS}/maskable-{s}.png")
    square(180, 0.10, (255, 255, 255, 255)).convert("RGB").save(f"{ICONS}/icon-180.png")
    square(64, 0.04, (255, 255, 255, 0)).save(f"{ICONS}/favicon.png")
    square(1024, 0.18, (255, 255, 255, 255)).save(f"{OUT}/app-icon-1024.png")
json.dump(report, open(f"{OUT}/brand.json", "w"), indent=2)
print(json.dumps(report, indent=2))
