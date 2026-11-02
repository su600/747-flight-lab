#!/usr/bin/env python3
"""Experimental 200LR text-cleaning research; NOT a complete neutral livery.

python3 tests/b777-passenger-neutral.py --write  # build experimental atlas
python3 tests/b777-passenger-neutral.py          # CPU pixel regression
Requires Pillow, numpy, opencv-python (CPU). No external imagery or network.
"""
from pathlib import Path
import hashlib, sys
import cv2
import numpy as np
from PIL import Image, PngImagePlugin

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets/accurate-b777/source-textures/passenger200lr/AFR1blanc.png'
OUTPUT=ROOT/'assets/b777-liveries/passenger/research-neutral/AFR1blanc.png'
SOURCE_SHA='33c3465b534b10a6d9dcd2f34b285e036c49ff23dfe34b01556f4a2892e7c569'
# Boxes from the 1024px production atlas, in x1,y1,x2,y2 (end exclusive).
# Each contains original blue 777 text, F-GSPF or the PF fleet suffix.
BOXES=[(20,79,220,100),(20,205,220,226),(120,426,151,466),
       (495,510,580,535),(495,638,580,665)]
SCALE=4

def blue(a):
    p=a.astype(np.int16)
    return (p[:,:,2]-p[:,:,0]>3)&(p[:,:,0]<250)&(p[:,:,1]<252)

def main():
    digest=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if digest!=SOURCE_SHA: raise SystemExit('200LR source atlas changed; re-audit before regenerating')
    image=Image.open(SOURCE)
    if image.size!=(4096,4096) or image.mode!='RGBA' or image.getchannel('A').getextrema()!=(255,255):
        raise SystemExit('Unexpected source size, mode or alpha')
    original=np.asarray(image.convert('RGB'))
    if sys.argv[1:]==['--write']:
        result=original.copy()
        for box in BOXES:
            x1,y1,x2,y2=[v*SCALE for v in box]
            patch=result[y1:y2,x1:x2].copy()
            mask=blue(patch).astype(np.uint8)*255
            if np.count_nonzero(mask)<50: raise SystemExit(f'Expected blue marking missing in {box}')
            mask=cv2.dilate(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
            # Inpaint only blue glyphs and the immediately adjacent antialias.
            result[y1:y2,x1:x2]=cv2.inpaint(patch,mask,5,cv2.INPAINT_TELEA)
        OUTPUT.parent.mkdir(parents=True,exist_ok=True)
        meta=PngImagePlugin.PngInfo()
        meta.add_text('Comment','Experimental partial text cleanup; FlightGear 777-VMD GPL-2.0; not a validated livery or complete neutral atlas.')
        Image.fromarray(result).save(OUTPUT,pnginfo=meta,optimize=True)
        print('Wrote',OUTPUT.relative_to(ROOT))
    elif sys.argv[1:]: raise SystemExit(__doc__)
    if not OUTPUT.is_file(): raise SystemExit('Experimental PNG missing; run with --write')
    painted=Image.open(OUTPUT)
    if painted.mode!='RGB' or painted.size!=image.size: raise SystemExit('Bad output format')
    out=np.asarray(painted)
    modified=np.any(original!=out,axis=2)
    allowed=np.zeros(original.shape[:2],dtype=bool)
    for box in BOXES:
        x1,y1,x2,y2=[v*SCALE for v in box]
        mask=blue(original[y1:y2,x1:x2]).astype(np.uint8)*255
        allowed[y1:y2,x1:x2]=cv2.dilate(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))>0
        before=int(np.count_nonzero(mask)); after=int(np.count_nonzero(blue(out[y1:y2,x1:x2])))
        if before<50 or after: raise SystemExit(f'{box}: before {before}, remaining blue detector hits {after}')
        print(f'{box}: {before} blue pixels removed')
    if np.any(modified & ~allowed): raise SystemExit('Unexpected change outside original glyph neighbourhoods')
    print(f'{np.count_nonzero(modified)} pixels changed; outside masked neighbourhoods identical. Only selected blue glyphs checked.')

if __name__=='__main__': main()
