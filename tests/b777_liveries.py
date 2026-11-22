"""Livery definitions: draw(body, fin) for each catalog id. Coordinates are aircraft metres (see b777_livery_art)."""
import math
import numpy as np
from b777_livery_art import *
from b777_liveries_more import *

WHITE = '#ffffff'
CARGO_IDS = {'fedex', 'sf'}
FINX = np.arange(22.0, 40.01, .5)

def finrel(f):  # callable giving a y offset for a stripe family that rises toward the tail
    return f

# ---------------------------------------------------------------------------------------------
def uae(body, fin):
    """Interpretation of the earlier Emirates 200LR scheme, not a particular airframe."""
    GOLD, RED, GREEN, BLACK = '#a98a55', '#d6232b', '#00843d', '#101214'
    body.rect_all(WHITE)
    # Separate the titles from the actual window meshes. The Arabic is set
    # above the windows, not appended to the English title at window level.
    # Standard fonts are deliberately an approximation of the custom marks.
    # The 200LR mesh has door skins at x=-18.2 and -7.7 on both sides.
    body.text(-13.0, -1.02, 'Emirates', 1.65, GOLD, family='Georgia', weight='bold', length=8.8)
    body.text(-13.0, 1.05, 'الإمارات', 1.12, GOLD, family='DejaVu Sans', weight='bold')
    body.text(-23.6, 1.15, 'BOEING 777-200LR', .2, '#6b6b6b', weight='normal', anchor='start')
    # black strip along the upper rear fuselage (continuation of the fin's black stripe)
    body.poly([(27.6, 2.4), (30.6, 2.9), (34.2, 2.2), (37.4, 1.55), (37.5, 1.2), (33.5, 1.3), (29.4, 1.5)], BLACK)
    # Restrict the red sweep to the upper tail root; the old polygon painted
    # a large red slab over the rear windows and lower fuselage.
    body.poly([(31.8, 3.4), (28.6, 2.75), (25.4, 2.1), (21.0, 1.8), (25.2, 1.65), (29.8, 1.7), (31.7, 2.0)], RED)
    # ---- fin
    fin.rect_all(WHITE)
    slope = .40
    def stripe(y0, y1, color):   # heights given at the trailing edge (x=37); stripes rise toward the tail
        xs = np.arange(23.5, 39.0, .5)
        fin.poly([(x, y1+slope*(x-37)) for x in xs]+[(x, y0+slope*(x-37)) for x in xs[::-1]], color)
    stripe(3.9, 6.3, BLACK); stripe(8.4, 16.0, GREEN)
    # red leading-edge wedge, widening toward the root
    fin.poly([(29.7, 7.5), (24.2, 2.45), (24.2, 1.6), (31.9, 1.6), (31.9, 3.3), (31.0, 4.8)], RED)
    return dict(engine=dict(base='#ffffff'))

def boe(body, fin):
    """Approximate 777-200LR Worldliner house scheme, not a specific registration."""
    NAVY, BLUE, LIGHT = '#0a2a86', '#1766c9', '#4aa3ea'
    body.rect_all(WHITE)
    edge = lambda x: float(np.interp(x, [-25.4, -23, -19, -14, -8, -2, 5, 12, 20, 27, 33, 37.8], [.9, .55, .15, -.1, -.45, -.62, -.6, -.45, -.2, .15, .5, .7]))
    # lower fuselage: navy forward, brightening to light blue with fine stripes toward the tail
    body.poly(band(-25.4, 37.8, -1.2, lambda x: edge(x)), NAVY)
    grad_id = 'g1'
    body.raw(f'<linearGradient id="{grad_id}" gradientUnits="userSpaceOnUse" x1="{-6-body.U0 if body.side=="port" else 6-body.U0}" y1="0" x2="{30-body.U0 if body.side=="port" else -30-body.U0}" y2="0"><stop offset="0" stop-color="{NAVY}" stop-opacity="0"/><stop offset=".35" stop-color="{BLUE}" stop-opacity=".9"/><stop offset="1" stop-color="{LIGHT}"/></linearGradient>')
    body.poly(band(-8, 37.8, lambda x: edge(x)-1.5, lambda x: edge(x)), f'url(#{grad_id})')
    for k in range(7):
        body.poly(band(-6, 37.8, lambda x, k=k: edge(x)-.18*(k+1)-.06, lambda x, k=k: edge(x)-.18*(k+1)), '#ffffff', opacity=.16)
    # white swoosh edge line
    body.poly(band(-25.4, 37.8, lambda x: edge(x)-.06, lambda x: edge(x)+.04), '#e8f2ff')
    # Keep the wordmark clear of the wing/engine and the lower UV edge.
    body.logo('boeing.png', -15.0, -1.48, 7.3, mirror=False, tint='white')
    body.text(-14.3, -2.12, 'WORLDLINER', .32, '#dfeaff', weight='normal', style='italic', spacing=.05)
    # fin: bright blue with white 777
    fin.rect_all(BLUE)
    fin.poly([(24.0, 2.0), (38.5, 2.0), (38.5, 3.2), (24.0, 3.2)], NAVY, opacity=.0)
    fin.text(fin_pt(.56, 6.8)[0], 6.8, '777', 1.7, '#ffffff', family='Arial Black', weight='900', style='italic')
    return dict(engine=dict(base='#ffffff', lower=NAVY, split=-.15))

def baw(body, fin):
    """British Airways 777-200ER (2000s 'Chatham Dockyard' / current union-flag fin)."""
    NAVY, RED, BLUEW = '#0f2864', '#d4202d', '#243f9a'
    body.rect_all(WHITE)
    edge = lambda x: float(np.interp(x, [-25.4, -23, -19, -12, 0, 12, 22, 28, 33, 37.8], [.35, -.1, -.4, -.62, -.66, -.66, -.55, -.25, .1, .6]))
    body.poly(band(-25.4, 37.8, -1.2, lambda x: edge(x)), NAVY)
    body.text(-10.7, -1.02, 'BRITISH AIRWAYS', 1.75, NAVY, family='Arial', weight='bold', length=11.6)
    # speedmark on the forward fuselage
    body.poly([(-20.8, .75), (-18.5, 1.7), (-15.6, 1.9), (-13.4, 1.55), (-15.0, 1.12), (-18.0, 1.0)], RED)
    body.poly([(-14.6, 1.45), (-13.4, 1.55), (-14.3, .85), (-15.4, .95)], '#2a4aa5')
    # tail cone red
    body.poly(band(31.0, 37.8, lambda x: edge(x), 1.0), RED, opacity=.0)
    # fin: union flag, swept and fitted to the fin
    fin.rect_all(NAVY)
    cx, cy = 31.4, 7.0; ang = math.radians(-34); sc = .58
    def P(u, v):  # flag coordinates (flag is 30 x 15) -> world
        u = (u-15)*sc; v = (v-7.5)*sc
        x = cx+u*math.cos(ang)-v*math.sin(ang); y = cy+u*math.sin(ang)+v*math.cos(ang)
        return (x, y)
    big = [P(-5, -5), P(35, -5), P(35, 20), P(-5, 20)]
    fin.poly(big, NAVY)
    for sw, col in ((4.2, '#ffffff'), (2.0, RED)):
        for a, b in (((-5, -5), (35, 20)), ((-5, 20), (35, -5))):
            fin.poly(_thick(P, a, b, sw), col)
    for sw, col in ((5.4, '#ffffff'), (3.2, RED)):
        fin.poly(_thick(P, (-5, 7.5), (35, 7.5), sw), col); fin.poly(_thick(P, (15, -5), (15, 20), sw*1.0), col)
    return dict(engine=dict(base='#1d3b8e', rear='#cfd3dc', rear_x=1.0))

def _thick(P, a, b, w):
    ax, ay = a; bx, by = b; dx, dy = bx-ax, by-ay; n = math.hypot(dx, dy); nx, ny = -dy/n*w/2, dx/n*w/2
    return [P(ax+nx, ay+ny), P(bx+nx, by+ny), P(bx-nx, by-ny), P(ax-nx, ay-ny)]

LIVERIES = {'UAE': uae, 'BOE': boe, 'BAW': baw}

LIVERIES = {'BOE': boe, 'ANA': ana, 'CCA': cca, 'CEA': cea, 'CSN': csn, 'CHH': chh, 'UAE': uae, 'BAW': baw, 'KLM': klm, 'DLH': dlh,
            'DLH100': dlh100, 'AF1_CLASSIC': af1c, 'AF1_2026': af1n, 'fedex': fedex, 'sf': sf}
