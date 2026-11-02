#!/usr/bin/env python3
"""Create approximate fictional/interpretive 777-200LR liveries; CPU only.

Uses the GPL FlightGear 200LR texture, our experimental cleaned body, and
self-drawn vector motifs; no external logos or aircraft photographs. The two
Chinese tail motifs reused from generate_china_liveries.py are original project
vector drawings. Requires Pillow, numpy, CPU OpenCV and DejaVu Sans fonts.
Run from project root: python3 tests/b777-passenger-generate.py
"""
from pathlib import Path
import hashlib, importlib.util, json, struct
import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageFilter, PngImagePlugin

ROOT=Path(__file__).resolve().parents[1]
GLB=ROOT/'assets/accurate-b777/777-200LR-2048.candidate.glb'
OUT=ROOT/'assets/b777-liveries/passenger'
BODY=OUT/'research-neutral/AFR1blanc.png'
TAIL=ROOT/'assets/accurate-b777/source-textures/passenger200lr/AFR5blanc.png'
EXPECTED_GLB='eddb2ea2e615931145b22838921bf12ac90f78b302a4d301f4d7e9439fa574e9'
EXPECTED_TAIL='68be9333f563e56c96fa1b9ab8f0448dda996149ef25673a6f4485eda19ac126'
FONTS=[Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),Path('/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf')]
FONT=next((x for x in FONTS if x.exists()),None)
if not FONT: raise SystemExit('DejaVu Sans Bold is required')
N=2048; Q=2  # artwork coordinates below are in 1024 reference pixels
SPEC={
 'BOE':('BOEING 777', '#173e84','#13376e','boe'),
 'CCA':('AIR CHINA', '#bd202f','#ffffff','cca'),
 'CEA':('CHINA EASTERN', '#243c82','#ffffff','cea'),
 'CSN':('CHINA SOUTHERN', '#0056a6','#0874b5','csn'),
 'CHH':('HAINAN AIRLINES', '#a81f2b','#a40f26','chh'),
 'UAE':('EMIRATES', '#a27a2d','#ffffff','uae'),
 'BAW':('BRITISH AIRWAYS', '#173457','#112c57','baw'),
 'KLM':('KLM ROYAL DUTCH AIRLINES', '#168cbf','#119ddd','klm'),
 'DLH':('LUFTHANSA', '#15345e','#f6ca24','dlh'),
 'DLH100':('LUFTHANSA 100 YEARS', '#15345e','#152d54','dlh100'),
 'AF1_CLASSIC':('UNITED STATES OF AMERICA', '#448db8','#ffffff','af1classic'),
 'AF1_2026':('UNITED STATES OF AMERICA', '#142d52','#142c52','af12026'),
}

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def uv_masks():
 data=GLB.read_bytes()
 if hashlib.sha256(data).hexdigest()!=EXPECTED_GLB: raise SystemExit('GLB changed; re-audit UV before generating')
 size=struct.unpack_from('<I',data,12)[0]; gltf=json.loads(data[20:20+size]); base=20+size+8
 types={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}; cols={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
 def access(i):
  a=gltf['accessors'][i]; v=gltf['bufferViews'][a['bufferView']]; dt=np.dtype(types[a['componentType']]); c=cols[a['type']]
  return np.ndarray((a['count'],c),dtype=dt,buffer=data,offset=base+v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*c),dt.itemsize))
 own=np.zeros((N,N),np.uint8); other=np.zeros_like(own); names=set()
 for node in gltf['nodes']:
  if 'mesh' not in node: continue
  name=node.get('extras',{}).get('fgName',node.get('name',''))
  for p in gltf['meshes'][node['mesh']]['primitives']:
   m=gltf['materials'][p['material']]
   if m.get('extras',{}).get('sourceTexture')!='Liveries-200LR/AFR5blanc.png':continue
   uv=access(p['attributes']['TEXCOORD_0']); indices=access(p['indices']).reshape(-1)
   pts=np.rint(uv[indices].reshape(-1,3,2)*(N-1)).astype(np.int32)
   if name in ('Tail','Rudder','LRudder'): target=own; names.add(name)
   else: target=other
   cv2.fillPoly(target,list(pts),255)
 if names!={'Tail','Rudder','LRudder'}: raise SystemExit('Tail nodes missing')
 if np.count_nonzero((own>0)&(other>0))>40: raise SystemExit('Tail UV now overlaps other parts; audit before painting')
 # Only the main two lateral fin islands; protect tiny leading-edge/other UV islands.
 own[:210*Q,:]=0;own[:,:440*Q]=0
 own=cv2.dilate(own,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))
 own[other>0]=0
 return Image.fromarray(own,'L')

def load_project_vectors():
 spec=importlib.util.spec_from_file_location('original_china_art',ROOT/'tools/generate_china_liveries.py')
 mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

def text_center(draw, text, box, color, size):
 f=ImageFont.truetype(str(FONT),size)
 while size>7:
  b=draw.textbbox((0,0),text,font=f)
  if b[2]-b[0]<=box[2]-box[0] and b[3]-b[1]<=box[3]-box[1]: break
  size-=1;f=ImageFont.truetype(str(FONT),size)
 x=(box[0]+box[2]-(b[2]-b[0]))/2-b[0];y=(box[1]+box[3]-(b[3]-b[1]))/2-b[1]
 draw.text((round(x),round(y)),text,font=f,fill=color)

def icon(kind, art):
 im=Image.new('RGBA',(400,400));d=ImageDraw.Draw(im)
 if kind=='boe':
  d.ellipse((63,65,338,275),outline='white',width=10)
  d.arc((10,24,386,365),205,348,fill='white',width=12)
  d.polygon([(55,212),(351,83),(356,94),(76,236)],fill='white')
  text_center(d,'BOEING',(35,300,365,364),'white',48)
 elif kind=='cca':
  red='#c62135'
  # Original schematic phoenix silhouette, not an external logo.
  d.polygon([(55,102),(158,107),(250,160),(329,117),(278,192),(346,221),(230,228),(169,188),(90,177),(155,160)],fill=red)
  d.polygon([(72,249),(162,201),(226,241),(313,232),(254,266),(160,239),(83,280)],fill=red)
  d.line([(126,289),(186,250),(248,278),(295,270)],fill=red,width=13)
  text_center(d,'AIR CHINA',(46,318,354,364),red,38)
 elif kind=='cea':
  x=art.eastern().resize((360,360),Image.Resampling.LANCZOS);im.alpha_composite(x,(20,20))
 elif kind=='csn':
  x=art.southern().resize((345,345),Image.Resampling.LANCZOS);im.alpha_composite(x,(27,27))
 elif kind=='chh':
  x=art.hainan_mark().resize((340,340),Image.Resampling.LANCZOS)
  color=Image.new('RGBA',x.size,'#f5cb40');color.putalpha(x.getchannel('A'));im.alpha_composite(color,(30,30))
 elif kind=='uae':
  # Stylised red/green/black Emirati fin, drawn as independent geometry.
  d.polygon([(75,40),(145,40),(145,360),(75,360)],fill='#d52d36')
  d.polygon([(145,60),(325,35),(325,130),(145,155)],fill='#009a5d')
  d.polygon([(145,160),(325,135),(325,225),(145,250)],fill='#f8f8f8')
  d.polygon([(145,255),(325,230),(325,320),(145,345)],fill='#19252a')
 elif kind=='baw':
  d.line([(35,340),(350,30)],fill='white',width=68);d.line([(40,30),(345,340)],fill='white',width=60)
  d.line([(35,340),(350,30)],fill='#c92f43',width=26);d.line([(40,30),(345,340)],fill='#c92f43',width=23)
  d.line([(20,185),(380,185)],fill='white',width=50);d.line([(20,185),(380,185)],fill='#c92f43',width=20)
 elif kind=='klm':
  d.ellipse((168,60,205,97),fill='white');d.ellipse((105,76,138,109),fill='white');d.ellipse((250,76,283,109),fill='white')
  d.rectangle((95,125,295,142),fill='white');d.rectangle((181,22,193,113),fill='white');d.rectangle((163,39,212,51),fill='white')
  text_center(d,'KLM',(40,145,360,290),'white',125)
 elif kind in ('dlh','dlh100'):
  col='#163056' if kind=='dlh' else '#ffffff'
  if kind=='dlh':d.ellipse((40,40,360,360),outline=col,width=13)
  d.line([(65,238),(170,195),(300,150),(335,153)],fill=col,width=12)
  d.line([(164,195),(208,100),(247,82)],fill=col,width=12)
  d.line([(169,195),(219,238),(265,251)],fill=col,width=10)
  if kind=='dlh100':text_center(d,'100',(56,260,344,360),'#efc846',73)
 elif kind in ('af1classic','af12026'):
  # Original hand-drawn flag approximation, not an official seal.
  x,y,w,h=(48,92,304,200) if kind=='af12026' else (72,102,256,172)
  for i in range(13):d.rectangle((x,y+round(h*i/13),x+w,y+round(h*(i+1)/13)),fill='#bd3040' if i%2==0 else '#ffffff')
  d.rectangle((x,y,x+round(w*.40),y+round(h*7/13)),fill='#18345e')
  for row in range(5):
   for col in range(6):
    xx=x+10+col*w*.064; yy=y+9+row*h*.074; d.ellipse((xx-2,yy-2,xx+2,yy+2),fill='white')
 return im

def body_image(base, title, ink, kind):
 im=base.copy()
 # Fine lower-body accent lines: original detail is multiplied back over paint.
 for y,x0,x1 in ((111,20,740),(239,20,740),(624,0,655),(750,0,655)):
  for dy,c in [(0,ink),(3,('#ba2837' if kind=='af12026' else ink))]:
   box=(x0*Q,(y+dy)*Q,x1*Q,(y+dy+2)*Q)
   detail=base.crop(box); colour=Image.new('RGB',detail.size,c)
   im.paste(ImageChops.multiply(colour,detail),box[:2])
 # The negative-Z island is horizontally mirrored; independently mirror the
 # artwork, not the entire atlas. The positive-Z island is normal.
 for y,mirror in ((79,True),(205,False)):
  # The negative-side skin has a door cutout at x≈273..321: keep
  # all text below x=265 on both UV islands so no glyph is lost.
  layer=Image.new('RGBA',(240*Q,23*Q));d=ImageDraw.Draw(layer)
  text_center(d,title,(0,0,240*Q,23*Q),ink,37)
  if mirror:layer=layer.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
  im.paste(layer,(25*Q,y*Q),layer)
 return im

def tail_image(base, mask, tailcolor, glyph):
 im=base.copy(); colored=ImageChops.multiply(Image.new('RGB',(N,N),tailcolor),base)
 im.paste(colored,(0,0),mask)
 # Two fin islands have a vertical offset of .36914, approximately 378/1024.
 for y,mirror in ((409,False),(787,True)):
  pic=glyph.resize((114*Q,114*Q),Image.Resampling.LANCZOS)
  if mirror:pic=pic.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
  x=758*Q; yy=y*Q
  # Do not let an emblem spill into a nearby atlas island.
  alpha=ImageChops.multiply(pic.getchannel('A'),mask.crop((x,yy,x+pic.width,yy+pic.height)))
  full=np.asarray(pic.getchannel('A')); clipped=np.asarray(alpha)
  if np.count_nonzero(full)>0 and np.count_nonzero(clipped)<np.count_nonzero(full)*.95:
   raise SystemExit('Tail emblem clipped excessively; recheck UV')
  pic.putalpha(alpha); im.paste(pic,(x,yy),pic)
 return im

def main():
 if sha(TAIL)!=EXPECTED_TAIL: raise SystemExit('Tail source changed; re-audit')
 if not BODY.exists():raise SystemExit('Generate research-neutral body first')
 # Fail closed if known registrations have returned; verify pixel isolation too.
 import subprocess,sys
 subprocess.run([sys.executable,str(ROOT/'tests/b777-passenger-neutral.py')],check=True)
 mask=uv_masks(); art=load_project_vectors()
 body=Image.open(BODY).convert('RGB').resize((N,N),Image.Resampling.LANCZOS)
 tail=Image.open(TAIL).convert('RGB').resize((N,N),Image.Resampling.LANCZOS)
 for ident,(title,ink,tailcolor,kind) in SPEC.items():
  info=PngImagePlugin.PngInfo(); info.add_text('Comment','Approximate or fictional 777-200LR interpretation; FlightGear 777-VMD GPL-2.0; original schematic artwork; no registration.')
  body_image(body,title,ink,kind).save(OUT/f'{ident}-body.png',pnginfo=info,optimize=True)
  tail_image(tail,mask,tailcolor,icon(kind,art)).save(OUT/f'{ident}-fin.png',pnginfo=info,optimize=True)
  print('generated',ident)

if __name__=='__main__':main()
