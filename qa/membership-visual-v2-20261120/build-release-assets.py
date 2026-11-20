from PIL import Image
from pathlib import Path
import base64, hashlib, io, json
p=Path('qa/membership-visual-v2-20261120')
raw=base64.b64decode(''.join(f.read_text() for f in sorted(p.glob('source-*.b64'))))
assert hashlib.sha256(raw).hexdigest()=='9d8d2fb96812a12584f5ec7efca28ba296981005166fc4862dc272bf47bc8e97'
im=Image.open(io.BytesIO(raw)).convert('RGB')
assert im.size==(2048,682)
assets={}
def clean_edges(source):
    # Replace only the perimeter pixels; preserve the entire interior and dimensions.
    w,h=source.size
    n=4
    out=source.copy()
    out.paste(source.crop((0,n,w,n+1)).resize((w,n)),(0,0))
    out.paste(source.crop((0,h-n-1,w,h-n)).resize((w,n)),(0,h-n))
    out.paste(out.crop((n,0,n+1,h)).resize((n,h)),(0,0))
    out.paste(out.crop((w-n-1,0,w-n,h)).resize((n,h)),(w-n,0))
    assert out.crop((n,n,w-n,h-n)).tobytes()==source.crop((n,n,w-n,h-n)).tobytes()
    assert out.size==source.size
    return out
def save(name,source):
    f=io.BytesIO();source.save(f,'WEBP',lossless=True,method=6)
    data=f.getvalue()
    assert Image.open(io.BytesIO(data)).convert('RGB').tobytes()==source.tobytes()
    assets[name]=base64.b64encode(data).decode()
def color_label(source,kind,theme):
    out=source.copy()
    x0,y0,x1,y1=(49,60,160,78) if kind=='mobile' else (84,94,224,115)
    dark_bg=kind!='light'
    target=(255,220,25) if theme=='dark' else ((255,154,35) if kind=='mobile' else (199,85,0))
    count=0
    for y in range(y0,y1):
        for x in range(x0,x1):
            old=source.getpixel((x,y))
            # Estimate the local canvas from the rows immediately outside the label.
            t=(y-y0+1)/(y1-y0+1)
            up=source.getpixel((x,y0-1)); down=source.getpixel((x,y1))
            bg=tuple(round(u*(1-t)+d*t) for u,d in zip(up,down))
            if dark_bg:
                alpha=max(0,min(1,(old[0]-bg[0]-10)/max(1,232-bg[0]-10)))
            else:
                alpha=max(0,min(1,(bg[1]-old[1]-10)/max(1,bg[1]-48-10)))
            if alpha>.025:
                fg=(232,231,151) if dark_bg else (18,48,32)
                new=tuple(max(0,min(255,round(v+alpha*(d-f)))) for v,d,f in zip(old,target,fg))
                out.putpixel((x,y),new)
                count+=new!=old
    assert count>300
    assert out.size==source.size
    assert out.crop((0,0,source.width,y0)).tobytes()==source.crop((0,0,source.width,y0)).tobytes()
    assert out.crop((0,y1,source.width,source.height)).tobytes()==source.crop((0,y1,source.width,source.height)).tobytes()
    assert out.crop((0,y0,x0,y1)).tobytes()==source.crop((0,y0,x0,y1)).tobytes()
    assert out.crop((x1,y0,source.width,y1)).tobytes()==source.crop((x1,y0,source.width,y1)).tobytes()
    print('LABEL_COLOR_VERIFIED',kind,theme,target,count)
    return out
for name,box in [('dark',(48,78,2000,223)),('light',(48,269,2000,419)),('mobile',(632,469,1417,654))]:
    source=im.crop(box)
    clean=clean_edges(source)
    if name=='mobile':
        for theme in ['dark','light']:
            save('label-mobile-'+theme+'-v12.webp',color_label(clean,'mobile',theme))
        continue
    clean=color_label(clean,name,name)
    save('label-'+name+'-v12.webp',clean)
    print('FLAT_EDGE_VERIFIED',name,clean.size)
    if name!='mobile':
        parts=[clean.crop((x0,0,x1,clean.height)) for x0,x1 in [(0,962),(962,1122),(1122,1952)]]
        assembled=Image.new('RGB',clean.size)
        x=0
        for label,crop in zip(['left','middle','right'],parts):
            save('label-'+name+'-'+label+'-v12.webp',crop)
            assembled.paste(crop,(x,0));x+=crop.width
        assert assembled.tobytes()==clean.tobytes()
        # Recolor only green button pixels, preserving text, texture and edge antialiasing.
        yellow=clean.copy()
        roi=(1679,38 if name=='dark' else 41,1915,102 if name=='dark' else 106)
        count=0
        for py in range(roi[1],roi[3]):
            for px in range(roi[0],roi[2]):
                red,green,blue=clean.getpixel((px,py))
                d=max(0,green-red)
                weight=min(1,max(0,(green-55)/65))*min(1,max(0,(d-20)/45))
                if weight>0:
                    new=(min(255,round(red+1.10*d*weight)),green,max(0,round(blue-.75*d*weight)))
                    yellow.putpixel((px,py),new)
                    count+=new!=(red,green,blue)
        assert count>8000
        assert yellow.crop((0,0,1679,clean.height)).tobytes()==clean.crop((0,0,1679,clean.height)).tobytes()
        assert yellow.crop((1915,0,1952,clean.height)).tobytes()==clean.crop((1915,0,1952,clean.height)).tobytes()
        assert yellow.crop((1679,0,1915,roi[1])).tobytes()==clean.crop((1679,0,1915,roi[1])).tobytes()
        assert yellow.crop((1679,roi[3],1915,clean.height)).tobytes()==clean.crop((1679,roi[3],1915,clean.height)).tobytes()
        save('label-hover-'+name+'-v12.webp',yellow)
        save('label-hover-'+name+'-right-v12.webp',yellow.crop((1122,0,1952,clean.height)))
        print('HOVER_PIXELS_VERIFIED',name,count)

(p/'assets.mjs').write_text('export default '+json.dumps(assets,separators=(',',':'))+';\n')
