#!/usr/bin/env python3
"""Draw original, approximate A330-303 adaptations on GPL FlightGear UVs.

Uses only 323_blank.png, the generated windowless atlas, system fonts and
original vectors. No photographs, third-party logos, or claimed registrations.
The supplied SF reference is a 747, used only to inform broad styling. See
NOTICE for upstream attribution and for which liveries are approximations.
Requires Pillow and DejaVu Sans/Noto Sans CJK system fonts.
"""
from pathlib import Path
import json
import subprocess
from PIL import Image, ImageChops, ImageDraw, ImageFont, PngImagePlugin

HERE = Path(__file__).resolve().parent
SRC = HERE / 'Models' / '323_blank.png'
FREIGHT = HERE / 'derived' / '323_windowless.png'
OUT = HERE / 'derived' / 'liveries'
SCHEMES = {
 'BOE': ('AIRBUS HOUSE', '#164a83', 'AIRBUS', False),
 'CHH': ('HAINAN AIRLINES', '#a61c2c', 'HAINAN', False),
 'UAE': ('EMIRATES', '#ae252d', 'EMIRATES', False),
 'BAW': ('BRITISH AIRWAYS', '#172e56', 'BA', False),
 'DLH100': ('LUFTHANSA 100 YEARS', '#102958', '100', False),
 'AF1_CLASSIC': ('UNITED STATES OF AMERICA', '#377fa3', 'USA', False),
 'AF1_2026': ('UNITED STATES OF AMERICA', '#142a50', 'USA', False),
 'fedex': ('FedEx', '#4d148c', 'FedEx', True),
 'sf': ('SF AIRLINES', '#282a2d', 'SF', True),
}

def font(pattern, size):
    p = subprocess.check_output(['fc-match','-f','%{file}\n%{index}',pattern], text=True).splitlines()
    return ImageFont.truetype(p[0], size, index=int(p[1] or 0))

LATIN = font('DejaVu Sans:style=Bold', 30)
CJK = font('Noto Sans CJK SC:style=Bold', 26)

# UV rectangles (inclusive x0/y0, exclusive x1/y1). These were checked by
# ray-intersecting the unmodified a330-300-main.ac hull, not by screenshot
# measurement. The port cargo-door silhouette occupies approximately
# x=332.26..449.16, y=844.82..917.37. The front crew-entry doors occupy the
# atlas strips x≈162..208 and x≈1838..1885 respectively. Text is separately
# typeset, never mirrored; the two UV islands run in opposite directions.
SF_MARK_LAYOUT = {
 'port': {'circle': [218, 861, 248, 891], 'english': [251, 858, 326, 875], 'chinese': [251, 875, 326, 892]},
 'starboard': {'circle': [1798, 375, 1828, 405], 'english': [1720, 372, 1795, 389], 'chinese': [1720, 389, 1795, 406]},
}

def draw_sf_marks():
    # Draw a white-alpha mask in small supersampled patches, then store an
    # original dark RGBA overlay. No photographic or externally sourced logo.
    alpha=Image.new('L',(2048,1024),0)
    scale=4
    def text_mask(box, value, face):
        x0,y0,x1,y1=box;w,h=x1-x0,y1-y0
        patch=Image.new('L',(w*scale,h*scale),0);d=ImageDraw.Draw(patch)
        for size in range(face.size*scale,7*scale-1,-1):
            f=ImageFont.truetype(face.path,size,index=getattr(face,'index',0));b=d.textbbox((0,0),value,font=f)
            if b[2]-b[0]<=w*scale-4 and b[3]-b[1]<=h*scale-4:break
        b=d.textbbox((0,0),value,font=f)
        d.text(((w*scale-(b[2]-b[0]))/2-b[0],(h*scale-(b[3]-b[1]))/2-b[1]),value,font=f,fill=255)
        alpha.paste(patch.resize((w,h),Image.Resampling.LANCZOS),(x0,y0))
    def circle_mask(box):
        x0,y0,x1,y1=box;w,h=x1-x0,y1-y0
        patch=Image.new('L',(w*scale,h*scale),0);d=ImageDraw.Draw(patch)
        d.ellipse((4,4,w*scale-5,h*scale-5),outline=255,width=8)
        f=ImageFont.truetype(LATIN.path,14*scale,index=getattr(LATIN,'index',0));b=d.textbbox((0,0),'SF',font=f)
        d.text(((w*scale-(b[2]-b[0]))/2-b[0],(h*scale-(b[3]-b[1]))/2-b[1]),'SF',font=f,fill=255)
        alpha.paste(patch.resize((w,h),Image.Resampling.LANCZOS),(x0,y0))
    for side in SF_MARK_LAYOUT.values():
        circle_mask(side['circle']);text_mask(side['english'],'AIRLINES',LATIN);text_mask(side['chinese'],'顺丰航空',CJK)
    output=Image.new('RGBA',(2048,1024),(10,14,18,0));output.putalpha(alpha)
    versioned=OUT/'sf-v2';versioned.mkdir(parents=True,exist_ok=True)
    info=PngImagePlugin.PngInfo();info.add_text('Description','Original dark SF-style text/rings; approximate A330-300 freighter exterior. See assets/accurate-a330/NOTICE.')
    output.save(versioned/'sf-marks.png','PNG',pnginfo=info,optimize=True)
    (HERE/'sf-mark-layout.json').write_text(json.dumps(SF_MARK_LAYOUT,indent=2)+'\n',encoding='utf-8')

def tint_polygon(image, coords, color):
    mask = Image.new('L', image.size)
    ImageDraw.Draw(mask).polygon(coords, fill=255)
    mask = ImageChops.multiply(mask, image.getchannel('A'))
    rgb = image.convert('RGB')
    tinted = ImageChops.multiply(rgb, Image.new('RGB', image.size, color)).convert('RGBA')
    tinted.putalpha(image.getchannel('A'))
    return Image.composite(tinted, image, mask)

def rect_text(draw, box, text, base_font, color):
    x0,y0,x1,y1=box
    for size in range(base_font.size, 7, -1):
        f=ImageFont.truetype(base_font.path,size,index=getattr(base_font,'index',0))
        b=draw.textbbox((0,0),text,font=f)
        if b[2]-b[0]<=x1-x0 and b[3]-b[1]<=y1-y0: break
    b=draw.textbbox((0,0),text,font=f)
    draw.text((x0+(x1-x0-(b[2]-b[0]))/2-b[0],y0+(y1-y0-(b[3]-b[1]))/2-b[1]),text,font=f,fill=color)

def draw_fedex_mark(draw, box, light=False):
    """Draw original purple/white Fed plus orange Ex on the aircraft UVs."""
    x0,y0,x1,y1=box
    for size in range(64,8,-1):
        face=ImageFont.truetype(LATIN.path,size,index=getattr(LATIN,'index',0))
        width=draw.textlength('Fed',font=face)+draw.textlength('Ex',font=face)
        bounds=draw.textbbox((0,0),'FedEx',font=face)
        if width<=x1-x0 and bounds[3]-bounds[1]<=(y1-y0)*.7:break
    left=x0+(x1-x0-width)/2;top=y0-bounds[1]
    draw.text((left,top),'Fed',font=face,fill='white' if light else '#4d148c')
    draw.text((left+draw.textlength('Fed',font=face),top),'Ex',font=face,fill='#ff6600')
    small=ImageFont.truetype(LATIN.path,max(8,round(size*.27)),index=getattr(LATIN,'index',0))
    draw.text((left,y0+(y1-y0)*.72),'Express',font=small,fill='white' if light else '#4d148c')


def roundel(draw, x, y, radius, dark_background=False):
    # Original simple text-and-ring design, not an extracted corporate emblem.
    foreground='white' if dark_background else '#282a2d'
    draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill='#282a2d' if dark_background else 'white',outline=foreground,width=max(2,radius//12))
    rect_text(draw,(x-radius*.74,y-radius*.5,x+radius*.74,y+radius*.55),'SF',LATIN,foreground)

def stripe_polys():
    # Atlas upper island runs tail->nose; lower island runs nose->tail.
    # y+486 approximates the corresponding lower hull UV island.
    dark=[(140,442),(550,442),(1250,447),(1940,447),(1940,454),(1250,454),(550,450),(140,450)]
    gray=[(140,453),(600,453),(1250,458),(1940,458),(1940,462),(1250,462),(600,457),(140,457)]
    red=[(120,397),(390,411),(720,430),(1110,446),(1110,452),(710,439),(390,421),(120,410)]
    return dark,gray,red

def mirror(poly):
    return [(2047-x,y+486) for x,y in poly]

def draw_scheme(code):
    title,color,tail,cargo=SCHEMES[code]
    image=Image.open(FREIGHT if cargo else SRC).convert('RGBA')
    # Approximate fin paint while retaining source shading and panel lines.
    # The upper and lower fin UV islands mirror in X and differ by ~486 px.
    if code not in ('UAE',):
        fin=[(0,39),(90,39),(330,319),(425,327),(0,327)]
        image=tint_polygon(image,fin,color)
        image=tint_polygon(image,mirror(fin),color)
    if code=='sf':
        for poly,col in zip(stripe_polys(),('#282a2d','#73777a','#c8102e')):
            image=tint_polygon(image,poly,col);image=tint_polygon(image,mirror(poly),col)
    draw=ImageDraw.Draw(image)
    # These forward title boxes are between the source's forward doors on each
    # side. They are individually typeset (not mirrored), and the atlas skin
    # keeps source door/windshield detail. This is not a registration-specific
    # real-world airline paint kit.
    if code=='sf':
        # SF fuselage marks are emitted as a separate unlit overlay, so intense
        # PBR lighting cannot wash them out. No second mark is painted here.
        draw_sf_marks()
    elif code=='fedex':
        # Put each readable wordmark between the forward entry and cargo doors.
        # The white fuselage and purple tail follow the real 777F style; this
        # A330-300 cargo combination itself is an illustrative adaptation.
        draw_fedex_mark(draw,(1327,345,1587,413))
        draw_fedex_mark(draw,(460,831,720,899))
    else:
        rect_text(draw,(1508,351,1790,381),title,LATIN,color)
        rect_text(draw,(255,837,537,867),title,LATIN,color)
    # Twin independent fin islands. Original text/ring badges avoid requiring
    # externally sourced corporate logos; both sides remain upright.
    if code=='sf':
        roundel(draw,135,190,49,True);roundel(draw,1912,676,49,True)
    elif code=='fedex':
        draw_fedex_mark(draw,(65,165,190,210),True);draw_fedex_mark(draw,(1857,651,1982,696),True)
    else:
        tail_color='white' if code!='UAE' else color
        rect_text(draw,(65,165,190,210),tail,LATIN,tail_color)
        rect_text(draw,(1857,651,1982,696),tail,LATIN,tail_color)
    OUT.mkdir(parents=True,exist_ok=True)
    info=PngImagePlugin.PngInfo();info.add_text('Description',f'Unofficial approximate A330-303 {code} adaptation; GPL UV base, original vector/text. No endorsement. See assets/accurate-a330/NOTICE.')
    destination=OUT/'sf-v2'/'sf.png' if code=='sf' else OUT/('fedex-v2.png' if code=='fedex' else code+'.png')
    destination.parent.mkdir(parents=True,exist_ok=True);image.save(destination,pnginfo=info,optimize=True)
    if code=='sf':
        # Preserve the old URL for already-open sessions; its baked marks are
        # at the corrected UV positions. New code uses the versioned clean
        # atlas plus unlit overlay and cannot receive a stale cached old atlas.
        legacy=image.copy();legacy.alpha_composite(Image.open(OUT/'sf-v2'/'sf-marks.png').convert('RGBA'))
        legacy.save(OUT/'sf.png',pnginfo=info,optimize=True)
    print(code,destination)

if __name__=='__main__':
    for code in SCHEMES: draw_scheme(code)
