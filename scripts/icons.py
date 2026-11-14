# Génère les icônes Android / iOS de Trame (Pillow). Relancer après modification du dessin.
from PIL import Image, ImageDraw, ImageFont
import os
NAVY=(31,78,121); TEAL=(94,234,212); WHITE=(255,255,255)
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
def mark(size, bg=True, pad=0.0, radius=0.22, circle=False):
    S=size*4; im=Image.new("RGBA",(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
    if bg:
        if circle: d.ellipse([0,0,S-1,S-1],fill=NAVY)
        else: d.rounded_rectangle([0,0,S-1,S-1],radius=int(S*radius),fill=NAVY)
    inner=S*(1-2*pad); o=S*pad
    # fils de trame : trois lignes horizontales fines
    for i,y in enumerate((0.70,0.78,0.86)):
        d.rounded_rectangle([o+inner*0.24,o+inner*y,o+inner*0.76,o+inner*y+inner*0.035],radius=int(inner*0.02),fill=TEAL if i==0 else (*WHITE,150))
    f=ImageFont.truetype(FONT,int(inner*0.58))
    d.text((o+inner/2,o+inner*0.40),"T",font=f,fill=WHITE,anchor="mm")
    return im.resize((size,size),Image.LANCZOS)
res="android/app/src/main/res"
for dens,px in {"mdpi":48,"hdpi":72,"xhdpi":96,"xxhdpi":144,"xxxhdpi":192}.items():
    p=f"{res}/mipmap-{dens}"
    mark(px).save(f"{p}/ic_launcher.png"); mark(px,circle=True).save(f"{p}/ic_launcher_round.png")
    fg=int(px*108/48); im=Image.new("RGBA",(fg,fg),(0,0,0,0)); m=mark(int(fg*0.62),bg=False)
    im.paste(m,((fg-m.width)//2,(fg-m.height)//2),m); im.save(f"{p}/ic_launcher_foreground.png")
mark(1024,radius=0).convert("RGB").save("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")
mark(512).save("public/icon.png")
open(f"{res}/values/ic_launcher_background.xml","w").write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1F4E79</color>\n</resources>\n')
open(f"{res}/drawable/ic_stat_trame.xml","w").write('''<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="M5,3h14v3.2h-5.4V15h-3.2V6.2H5z"/>
  <path android:fillColor="#FFFFFFFF" android:pathData="M6,17.5h12v1.6H6zM7.5,20.4h9V22h-9z"/>
</vector>
''')
print("ok")
