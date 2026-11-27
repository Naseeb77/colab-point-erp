"""After `npx cap add android`: camera permission + launcher icons from the brand logo."""
import re, os, glob
from PIL import Image
man = "android/app/src/main/AndroidManifest.xml"
s = open(man).read()
if "android.permission.CAMERA" not in s:
    s = s.replace("<application", '<uses-permission android:name="android.permission.CAMERA" />\n    <application', 1)
open(man, "w").write(s)
src = "www/icons/icon-512.png"
sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for d, px in sizes.items():
    folder = f"android/app/src/main/res/mipmap-{d}"
    os.makedirs(folder, exist_ok=True)
    im = Image.open(src).convert("RGBA").resize((px, px), Image.LANCZOS)
    for n in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
        im.save(f"{folder}/{n}")
for f in glob.glob("android/app/src/main/res/mipmap-anydpi-v26/*.xml"):
    os.remove(f)
print("android configured")
