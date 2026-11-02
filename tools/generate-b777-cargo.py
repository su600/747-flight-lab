#!/usr/bin/env python3
"""Generate 200F cargo atlas derivatives by projecting original vector artwork
onto the ACTUAL 200F candidate triangles and their UVs. No reference photos
are read. Run one process at a time; the base PNGs are GPL-2.0 derivatives.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')
import hashlib, json, math, mmap, struct, time
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT/'assets/accurate-b777/777-200F-refined.candidate.glb'
SOURCE = ROOT/'assets/accurate-b777/production-textures/cargo'
OUT = ROOT/'assets/b777-liveries/cargo'
N = 2048
SCALE = 40
X0, YTOP, W, H = -25, 13, 2600, 680
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
if not Path(FONT).exists(): FONT = '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'
CJK = '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc'
PURPLE, ORANGE = (77,20,140,255), (255,102,0,255)
BLACK, GREY, RED, WHITE = (39,41,44,255), (123,126,129,255), (196,16,46,255), (255,255,255,255)
cv2.setNumThreads(1)

def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
 return h.hexdigest()

def xy(x,y): return (round((x-X0)*SCALE), round((YTOP-y)*SCALE))
def poly(draw, points, fill): draw.polygon([xy(x,y) for x,y in points], fill=fill)

def wordmark(id, tail=False):
 # Original typeset approximation, not a tracing or copied brand artwork.
 im=Image.new('RGBA',(1400,380),(0,0,0,0));d=ImageDraw.Draw(im)
 if id=='fedex':
  font=ImageFont.truetype(FONT,245)
  text='Fed';x=40;y=0
  col=WHITE if tail else PURPLE
  d.text((x,y),text,font=font,fill=col,stroke_width=0)
  x+=d.textlength(text,font=font)-8
  d.text((x,y),'Ex',font=font,fill=ORANGE)
  small=ImageFont.truetype(FONT,62)
  d.text((65,263),'Express',font=small,fill=col)
 else:
  latin=ImageFont.truetype(FONT,137);chinese=ImageFont.truetype(CJK,108)
  d.text((25,8),'AIRLINES',font=latin,fill=BLACK)
  d.text((25,164),'顺丰航空',font=chinese,fill=BLACK)
  d.ellipse((1015,30,1325,340),outline=BLACK,width=22)
  d.ellipse((1044,59,1296,311),outline=BLACK,width=8)
  sf=ImageFont.truetype(FONT,140);d.text((1072,87),'SF',font=sf,fill=BLACK)
 box=im.getbbox(); return im.crop(box)

def aft_text():
 im=Image.new('RGBA',(1200,180),(0,0,0,0));d=ImageDraw.Draw(im)
 d.text((10,-4),'fedex.com',font=ImageFont.truetype(FONT,150),fill=WHITE)
 return im.crop(im.getbbox())

def sf_tail_mark():
 im=Image.new('RGBA',(600,600),(0,0,0,0));d=ImageDraw.Draw(im)
 d.ellipse((20,20,580,580),outline=WHITE,width=33)
 d.ellipse((55,55,545,545),outline=WHITE,width=8)
 f=ImageFont.truetype(FONT,244);bb=d.textbbox((0,0),'SF',font=f)
 d.text(((600-(bb[2]-bb[0]))/2,135),'SF',font=f,fill=WHITE)
 return im

def decal(canvas, image, x0, x1, ybottom, ytop, sign):
 # UV sampling sees the -Z side from the other direction, so the *artwork*,
 # not the geometry, must be mirrored to read left-to-right on both sides.
 p0=xy(x0,ytop);p1=xy(x1,ybottom)
 im=image.resize((max(1,p1[0]-p0[0]),max(1,p1[1]-p0[1])),Image.Resampling.LANCZOS)
 if sign<0: im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
 canvas.alpha_composite(im,p0)

def artwork(id,sign,region):
 im=Image.new('RGBA',(W,H),(0,0,0,0));d=ImageDraw.Draw(im)
 if region=='body':
  if id=='fedex':
   # White fuselage; only the 777F aft root is purple, not a 747 belly.
   poly(d,[(23.2,3.8),(39.5,3.8),(39.5,-2.0),(32.4,-2.0),(29.7,-1.15)],PURPLE)
   # Keep the entire word aft of the front crew-door opening (x≈−18 m).
   decal(im,wordmark(id),-16.9,-6.2,-.25,1.70,sign)
   decal(im,aft_text(),29.8,32.2,.25,.58,sign)
  else:
   # Imaginary 777F interpretation of the supplied SF 747 style.
   poly(d,[(-22,-1.30),(32,-1.30),(34,-1.54),(-22,-1.54)],BLACK)
   poly(d,[(-22,-1.65),(33,-1.65),(34,-1.78),(-22,-1.78)],GREY)
   poly(d,[(-22,-1.91),(34,-1.91),(34,-2.05),(-22,-2.05)],BLACK)
   poly(d,[(7,-1.23),(27,.30),(34,1.55),(34,.61),(27,-.32)],RED)
   decal(im,wordmark(id),-16.9,-6.0,-.12,1.71,sign)
 elif region=='fin':
  poly(d,[(22,2.1),(40,2.1),(40,13),(22,13)],PURPLE if id=='fedex' else BLACK)
  if id=='fedex': decal(im,wordmark(id,True),32.4,35.2,8.0,8.95,sign)
  else: decal(im,sf_tail_mark(),32.1,35.2,7.5,9.7,sign)
 return np.asarray(im)

class GLB:
 def __init__(self,path):
  self.fd=open(path,'rb');self.mm=mmap.mmap(self.fd.fileno(),0,access=mmap.ACCESS_READ)
  if self.mm[:4]!=b'glTF': raise ValueError('Not glTF')
  n=struct.unpack_from('<I',self.mm,12)[0];self.json=json.loads(self.mm[20:20+n]);self.start=20+n+8
  if self.json['asset']['extras']['sourceIdentity']!='FlightGear Boeing 777-200F':raise ValueError('Wrong source variant')
  self.nodes={o.get('extras',{}).get('fgName'):o for o in self.json['nodes']}
 def attr(self,i):
  a=self.json['accessors'][i];v=self.json['bufferViews'][a['bufferView']]
  if v.get('byteStride'): raise ValueError('Unsupported interleaved buffer')
  typ={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']];dim={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
  return np.frombuffer(self.mm,dtype=typ,count=a['count']*dim,offset=self.start+v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],dim)
 def faces(self,name,source):
  node=self.nodes[name]
  if any(k in node for k in ('matrix','translation','rotation','scale')): raise ValueError('Unexpected mesh transform')
  for p in self.json['meshes'][node['mesh']]['primitives']:
   m=self.json['materials'][p['material']]
   if m['extras'].get('sourceTexture')!=source: continue
   pos=self.attr(p['attributes']['POSITION']); uv=self.attr(p['attributes']['TEXCOORD_0']); indices=self.attr(p['indices']).reshape(-1,3)
   yield pos,uv,indices

def blank_body():
 im=np.asarray(Image.open(SOURCE/'AFR1blanc.png').convert('RGB')).copy()
 r,g,b=[im[:,:,i].astype(np.int16) for i in range(3)]
 blue=(b-r>4)&(b-g>2)&(b<245)&(r<200)
 mask=np.zeros(im.shape[:2],dtype=np.uint8)
 for x0,y0,x1,y1 in [(15,70,235,100),(15,198,235,228),(115,425,155,470),(490,508,585,535),(490,636,585,665)]:
  mask[y0:y1,x0:x1]=blue[y0:y1,x0:x1].astype(np.uint8)*255
 mask=cv2.dilate(mask,np.ones((3,3),np.uint8),iterations=1)
 # Only local blue Boeing / F-GSPF / PF pixels; retain other stencils, panel
 # lines, gear details and the cockpit glass in this multi-use atlas.
 out=cv2.inpaint(im,mask,3,cv2.INPAINT_TELEA)
 return Image.fromarray(out).resize((N,N),Image.Resampling.LANCZOS),int(np.count_nonzero(mask))

def generate_atlas(glb,id,region,base):
 texture='Liveries-F/'+('AFR1blanc.png' if region=='body' else 'AFR5blanc.png')
 names=['Fuselage','Fuselage.004','entry11l','hublot'] if region=='body' else ['Tail','Rudder','LRudder']
 canvas=np.asarray(base.convert('RGBA')).copy()
 artwork_by_side={s:artwork(id,s,region) for s in (-1,1)}
 # All artwork must land on UV faces; no planar floating decals or invented UV.
 count=0; painted=0
 for name in names:
  for pos,uv,idx in glb.faces(name,texture):
   for tri in idx:
    p=pos[tri];t=uv[tri]
    mean=p.mean(axis=0);sign=1 if mean[2]>=0 else -1
    uvmean=t.mean(axis=0)
    if region=='body':
     if abs(mean[2])<1.25 or mean[1]>3.6 or mean[1]<-2.4: continue
     # These are the four surveyed exterior side islands. The remaining
     # atlas also contains cockpit/avionics and mechanical imagery.
     if uvmean[0]>.78 or not (uvmean[1]<.115 or .14<uvmean[1]<.24 or .49<uvmean[1]<.61 or .615<uvmean[1]<.74): continue
    else:
     # Only the two large outside fin/rudder islands. Tail contains auxiliary
     # faces in cockpit/structure charts which must remain unpainted.
     if mean[1]<2.1 or uvmean[0]<.42: continue
    # Paint only triangles whose actual plane bounds intersect artwork.
    src=np.array([xy(v[0],v[1]) for v in p],dtype=np.float32)
    xmin=max(0,int(np.floor(src[:,0].min()))-2);xmax=min(W,int(np.ceil(src[:,0].max()))+3)
    ymin=max(0,int(np.floor(src[:,1].min()))-2);ymax=min(H,int(np.ceil(src[:,1].max()))+3)
    if xmin>=xmax or ymin>=ymax or not np.any(artwork_by_side[sign][ymin:ymax,xmin:xmax,3]): continue
    dst=t.astype(np.float32)*N
    def area(a):
     q=a[1]-a[0];r=a[2]-a[0];return q[0]*r[1]-q[1]*r[0]
    if abs(area(src))<0.005 or abs(area(dst))<0.005: continue
    lx=max(0,int(np.floor(dst[:,0].min()))-1);rx=min(N,int(np.ceil(dst[:,0].max()))+2)
    ly=max(0,int(np.floor(dst[:,1].min()))-1);ry=min(N,int(np.ceil(dst[:,1].max()))+2)
    if lx>=rx or ly>=ry: continue
    local=dst-np.array([lx,ly],np.float32)
    transform=cv2.getAffineTransform(src,local)
    patch=cv2.warpAffine(artwork_by_side[sign],transform,(rx-lx,ry-ly),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    mask=np.zeros((ry-ly,rx-lx),np.uint8)
    # Tiny triangles need overlap to avoid UV seam pinholes; neighboring faces
    # sample the same world-space design. Dilation is limited to one pixel.
    cv2.fillConvexPoly(mask,np.rint(local).astype(np.int32),255)
    mask=cv2.dilate(mask,np.ones((3,3),np.uint8))
    alpha=(patch[:,:,3].astype(np.float32)/255)*(mask/255)
    if not np.any(alpha):continue
    target=canvas[ly:ry,lx:rx,:3];a=alpha[:,:,None]
    target[:]=np.clip(target*(1-a)+patch[:,:,:3]*a,0,255).astype(np.uint8)
    count+=1;painted+=int(np.count_nonzero(alpha))
 return Image.fromarray(canvas,'RGBA').convert('RGB'), {'paintedTriangles':count,'paintedPixelWrites':painted,'sourceTexture':texture,'meshes':names}

def main():
 available=int(next(line.split()[1] for line in open('/proc/meminfo') if line.startswith('MemAvailable:')))
 if available<260*1024: raise SystemExit('Less than 260 MiB available; retry after other model conversions finish')
 OUT.mkdir(parents=True,exist_ok=True);glb=GLB(CANDIDATE);print('candidate',sha(CANDIDATE),flush=True)
 body,removed=blank_body();tail=Image.open(SOURCE/'AFR5blanc.png').convert('RGB').resize((N,N),Image.Resampling.LANCZOS)
 report={'model':'FlightGear Boeing 777-200F','candidateSHA256':sha(CANDIDATE),'resolution':N,
  'sourceTextures':{name:sha(SOURCE/name) for name in ('AFR1blanc.png','AFR5blanc.png')},
  'removedBrandMaskPixelsAt1024':removed,
  'disclosure':{'fedex':'Original typeset approximation of real FedEx 777F; not visually certified.',
                'sf':'Fictional 777F adapting 747 references; service not established.'},'designs':{}}
 for id in ('fedex','sf'):
  report['designs'][id]={}
  for region,base in [('body',body),('fin',tail)]:
   start=time.monotonic();img,stats=generate_atlas(glb,id,region,base)
   path=OUT/f'{id}-{region}.png';img.save(path,optimize=True)
   report['designs'][id][region]={**stats,'path':path.name,'sha256':sha(path)}
   print(id,region,stats,'seconds',round(time.monotonic()-start,1),flush=True)
 (OUT/'manifest.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')

if __name__=='__main__':main()
