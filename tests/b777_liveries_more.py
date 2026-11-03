"""Remaining 777 livery definitions (see b777_liveries.py for the first three)."""
import numpy as np
from b777_livery_art import *

WHITE = '#ffffff'

def _stripe(body, lo, hi, color, x0=-23.5, x1=36.5):
    body.poly(band(x0, x1, lo, hi), color)

def _edge(xs, ys):
    return lambda x: float(np.interp(x, xs, ys))

def cca(body, fin):
    """Air China 777 (777-300ER family): white, red titles, navy/grey cheatline, red phoenix on a white fin."""
    RED, NAVY, GREY = '#d3202f', '#16337a', '#aeb7c4'
    body.rect_all(WHITE)
    _stripe(body, -.62, -.52, GREY); _stripe(body, -.5, -.46, NAVY); _stripe(body, -.78, -.72, NAVY)
    body.text(-12.0, .95, 'AIR CHINA', 1.25, RED, weight='bold', length=7.2)
    body.text(-2.2, .95, '中国国际航空公司', 1.0, RED, family='Microsoft YaHei', weight='bold')
    fin.rect_all(WHITE)
    fin.logo('air-china.png', 31.2, 6.6, 8.2)
    return dict(engine=dict(base='#ffffff'))

def cea(body, fin):
    """China Eastern 777-300ER family: white, blue Latin and red Chinese titles, swallow mark on a white fin."""
    BLUE, RED = '#1d3f95', '#d3202f'
    body.rect_all(WHITE)
    body.text(-12.4, .95, 'CHINA EASTERN', 1.15, BLUE, weight='bold', length=8.0)
    body.text(-4.9, .95, '中国东方航空', 1.0, RED, family='Microsoft YaHei', weight='bold')
    fin.rect_all(WHITE)
    fin.logo('china-eastern.png', 31.0, 6.4, 9.0)
    return dict(engine=dict(base='#ffffff'))

def csn(body, fin):
    """China Southern 777 (777-200 / -300ER family): white, blue cheatlines, sky-blue fin with red kapok."""
    BLUE, SKY = '#10408c', '#1aa0df'
    body.rect_all(WHITE)
    _stripe(body, -.2, -.14, BLUE); _stripe(body, -.1, -.04, SKY); _stripe(body, -.62, -.56, SKY); _stripe(body, -.54, -.5, BLUE)
    body.text(-13.0, .95, '中国南方航空', 1.0, BLUE, family='Microsoft YaHei', weight='bold')
    body.text(-6.4, .95, 'CHINA SOUTHERN', 1.0, BLUE, weight='bold', length=7.4)
    fin.rect_all(SKY)
    fin.logo('china-southern.png', 31.0, 6.7, 9.6)
    return dict(engine=dict(base='#ffffff'))

def chh(body, fin):
    """Hainan Airlines (no real 777): the airline's red/gold livery fitted to the 777 body."""
    RED, GOLD, ORANGE = '#c8102e', '#f6b60b', '#f08a00'
    body.rect_all(WHITE)
    edge = _edge([-25.4, -18, -8, 4, 16, 24, 30, 37.8], [-.1, -.45, -.62, -.7, -.62, -.35, .1, .5])
    body.poly(band(-25.4, 37.8, lambda x: edge(x)-.22, edge), GOLD)
    body.poly(band(-25.4, 37.8, lambda x: edge(x)-.46, lambda x: edge(x)-.2), ORANGE)
    body.poly(band(-25.4, 37.8, -1.2, lambda x: edge(x)-.44), RED)
    body.text(-12.0, 1.0, 'Hainan Airlines', 1.15, '#333b4a', weight='bold', length=7.6)
    body.text(-4.4, 1.0, '海南航空', 1.0, '#333b4a', family='Microsoft YaHei', weight='bold')
    fin.rect_all(RED)
    fin.logo('hainan.png', 31.2, 6.4, 8.4, tint='gold')
    return dict(engine=dict(base='#ffffff'))

def klm(body, fin):
    """KLM 777 (777-200ER / -300ER): sky-blue upper fuselage, white belly, white KLM crown on a blue fin."""
    BLUE = '#00a1de'
    body.rect_all(WHITE)
    body.poly(band(-25.4, 37.8, _edge([-25.4, -20, -8, 20, 30, 37.8], [-.2, -.15, -.12, -.1, .0, .3]), 1.2), BLUE)
    body.text(-9.4, 1.35, 'KLM Royal Dutch Airlines', .8, '#ffffff', weight='bold', length=9.5)
    fin.rect_all(BLUE)
    fin.logo('klm.png', 31.0, 6.8, 6.6, mirror=False, tint='white')
    return dict(engine=dict(base='#ffffff'))

def dlh(body, fin):
    """Lufthansa (no real 777 passenger aircraft): classic white/grey scheme, navy fin with yellow crane disc."""
    NAVY, YELLOW = '#05164d', '#f9ba00'
    body.rect_all(WHITE)
    body.poly(band(-25.4, 37.8, -1.2, _edge([-25.4, -20, -8, 20, 30, 37.8], [-.1, -.45, -.55, -.5, -.2, .3])), '#c3c8d0')
    _stripe(body, -.07, -.01, NAVY, -23, 36)
    body.text(-10.8, 1.0, 'Lufthansa', 1.9, NAVY, family='Arial', weight='bold', length=9.6)
    fin.rect_all(NAVY)
    cx = fin_pt(.45, 6.7)[0]
    fin.circle((cx, 6.7), 2.55, YELLOW)
    fin.logo('lufthansa.png', cx, 6.7, 5.0, mirror=False)
    return dict(engine=dict(base='#ffffff'))

def dlh100(body, fin):
    """Lufthansa 100-year special (no real 777): navy lower fuselage and fin, white top."""
    NAVY, GOLD = '#0b1d4f', '#d4af37'
    body.rect_all(WHITE)
    body.poly(band(-25.4, 37.8, -1.2, _edge([-25.4, -18, -8, 4, 16, 24, 30, 37.8], [.1, -.05, -.1, -.1, -.1, 0, .2, .6])), NAVY)
    body.text(-10.6, -.9, 'Lufthansa', 1.9, '#ffffff', weight='bold', length=9.6)
    body.text(6.0, -.8, '1926 – 2026', 1.0, GOLD, weight='bold')
    fin.rect_all(NAVY)
    cx = fin_pt(.45, 6.3)[0]
    fin.logo('lufthansa.png', cx, 6.3, 5.4, mirror=False, tint='white')
    fin.text(fin_pt(.5, 9.4)[0], 9.4, '100', 1.5, GOLD, weight='bold')
    return dict(engine=dict(base='#ffffff', lower=NAVY, split=-.2))

def af1c(body, fin):
    """US presidential 'Air Force One' classic scheme (no real 777): white over pale blue with a navy line."""
    NAVY, SKY = '#1b3a73', '#79b4de'
    body.rect_all(WHITE)
    body.poly(band(-25.4, 37.8, -1.2, _edge([-25.4, -20, -8, 20, 30, 37.8], [-.05, -.1, -.12, -.1, 0, .4])), SKY)
    _stripe(body, -.19, -.14, NAVY, -24, 36)
    body.text(-8.0, 1.0, 'UNITED STATES OF AMERICA', 1.0, NAVY, family='Georgia', weight='bold', length=14.5)
    fin.rect_all(WHITE)
    # VC-25A style: a large flag across most of the upper fin chord, tail number below.
    # The flag is mirrored on the starboard side so the union always leads (US aircraft convention).
    fin.logo('us-flag.png', fin_pt(.58, 9.6)[0], 9.6, 4.2)
    fin.text(fin_pt(.55, 7.3)[0], 7.3, '28000', .9, NAVY, weight='bold')
    return dict(engine=dict(base='#79b4de'))

def af1n(body, fin):
    """2026 presidential scheme (no real 777): navy lower fuselage, thin red line, navy fin."""
    NAVY, RED = '#142a50', '#c8102e'
    body.rect_all(WHITE)
    edge = _edge([-25.4, -18, -8, 20, 30, 37.8], [.2, -.2, -.3, -.3, -.05, .5])
    body.poly(band(-25.4, 37.8, -1.2, edge), NAVY)
    body.poly(band(-25.4, 37.8, edge, lambda x: edge(x)+.07), RED)
    body.text(-8.0, 1.0, 'UNITED STATES OF AMERICA', 1.0, NAVY, family='Georgia', weight='bold', length=14.5)
    fin.rect_all(NAVY)
    fin.logo('us-flag.png', fin_pt(.5, 8.0)[0], 8.0, 6.0)
    return dict(engine=dict(base='#ffffff', lower=NAVY, split=-.1))

def fedex(body, fin):
    """FedEx Express 777F: white fuselage, purple rear belly sweeping into a purple fin, FedEx wordmark."""
    PURPLE, ORANGE = '#4d148c', '#ff6600'
    body.rect_all(WHITE)
    body.poly([(21.0, -3.3), (25.0, -3.0), (29.5, -1.7), (31.5, -.6), (34.8, .7), (37.6, 1.6), (38.0, 1.6), (38.0, -3.3)], PURPLE)
    body.text(-11.2, .05, 'Fed', 2.5, PURPLE, family='Arial', weight='bold', anchor='end', spacing=-.08)
    body.text(-11.2, .05, 'Ex', 2.5, ORANGE, family='Arial', weight='bold', anchor='start', spacing=-.08)
    body.text(-11.2, -.62, 'Express', .78, '#666a70', weight='bold')
    fin.rect_all(PURPLE)
    fin.text(31.2, 7.7, 'Fed', 1.5, '#ffffff', weight='bold', anchor='end', spacing=-.05)
    fin.text(31.2, 7.7, 'Ex', 1.5, ORANGE, weight='bold', anchor='start', spacing=-.05)
    fin.text(31.4, 6.7, 'Express', .45, '#ffffff', weight='bold')
    return dict(engine=dict(base='#ffffff'))

def sf(body, fin):
    """SF Airlines (no real 777; SF flies 747-400F/767/757/737): its black/grey/red scheme on the 777F."""
    BLACK, GREY, RED = '#27292c', '#8a8e92', '#c8102e'
    body.rect_all(WHITE)
    _stripe(body, -.55, -.46, BLACK, -22, 36); _stripe(body, -.66, -.6, GREY, -22, 36); _stripe(body, -.8, -.7, BLACK, -22, 36)
    body.poly([(7, -1.5), (27, .3), (36, 1.5), (36, .6), (27, -.3)], RED)
    body.text(-11.4, .5, 'AIRLINES', 1.3, BLACK, weight='bold', length=6.2)
    body.text(-11.4, -.85, '顺丰航空', 1.05, BLACK, family='Microsoft YaHei', weight='bold')
    body.logo('sf-express.png', -4.4, -.1, 3.2, mirror=False)
    fin.rect_all(BLACK)
    fin.logo('sf-express.png', 31.2, 7.0, 6.2, mirror=False)
    return dict(engine=dict(base='#2a2c30'))
