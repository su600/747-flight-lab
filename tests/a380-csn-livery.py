"""China Southern A380 atlas matches photos of B-6136/B-6137: navy nose and band under the main-deck windows,
sky-blue window stripe, gold hairline and sky-blue stripe below the band, white belly, sky-blue fin with the red kapok.
Run: python3 tests/a380-csn-livery.py (after node assets/a380-liveries/generate.mjs CSN)."""
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]/'assets/a380-liveries'
X0,X1,Y0,Y1=-37.5,37.0,-9.8,12.6
def px(im,side,x,y):
    w,h=im.size;s=w/(X1-X0)
    u=(x-X0)*s if side=='port' else (X1-x)*s
    return im.getpixel((int(u),int((Y1-y)*s)))[:3]
def close(c,ref,tol=40):return all(abs(a-b)<=tol for a,b in zip(c,ref))
NAVY=(13,47,110);SKY=(42,139,208);WHITE=(243,245,247)
for side in ['port','starboard']:
    im=Image.open(ROOT/f'CSN-{side}.webp').convert('RGB')
    assert close(px(im,side,35.5,-5.0),NAVY),f'{side}: navy wraps the nose below the cockpit'
    for x in [25,10,-5]:
        assert close(px(im,side,x,-6.5),NAVY),f'{side}: navy band under the main-deck windows at x={x}'
        assert close(px(im,side,x,-5.5),SKY),f'{side}: sky-blue stripe through the main-deck windows at x={x}'
        assert close(px(im,side,x,-8.9),WHITE),f'{side}: white belly at x={x}'
    assert close(px(im,side,-32,10),SKY),f'{side}: sky-blue fin'
    flower=[px(im,side,-28.75+dx*.4,5.2+dy*.4) for dx in range(-5,6) for dy in range(-5,6)]
    assert sum(1 for r,g,b in flower if r>180 and g<80 and b<80)>15,f'{side}: red kapok on the fin'
print('China Southern A380 livery passed: navy nose and band, sky window stripe, white belly, sky fin with kapok on both sides.')
