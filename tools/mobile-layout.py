#!/usr/bin/env python3
"""Run with the local server on port 8771 and Python Playwright/Chrome installed.

    flock /tmp/747-heavy.lock python3 tools/mobile-layout.py
"""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8771/?prefetch=0'
SHOTS = Path('/tmp/mobile-shots')
SHOTS.mkdir(parents=True, exist_ok=True)


def box(page, selector):
    result = page.locator(selector).first.bounding_box()
    assert result, f'{selector} is not visible'
    return result


def inside(page, selector, width, height):
    r = box(page, selector)
    assert r['x'] >= -0.5 and r['y'] >= -0.5 and r['x'] + r['width'] <= width + 0.5 and r['y'] + r['height'] <= height + 0.5, (selector, r, width, height)


def clear(page, a, b):
    x, y = box(page, a), box(page, b)
    overlap = min(x['x'] + x['width'], y['x'] + y['width']) - max(x['x'], y['x'])
    height = min(x['y'] + x['height'], y['y'] + y['height']) - max(x['y'], y['y'])
    assert overlap <= 0.5 or height <= 0.5, (a, b, x, y)


def target(page, selector):
    r = box(page, selector)
    assert r['width'] >= 39.5 and r['height'] >= 39.5, (selector, r)


def launch_page(browser, width, height, mobile):
    context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1, reduced_motion='reduce')
    page = context.new_page()
    page.goto(URL, wait_until='domcontentloaded', timeout=120000)
    page.locator('#loading').wait_for(state='detached', timeout=300000)
    page.wait_for_function('window.flightLab && document.body.classList.contains("ground-inspect")', timeout=120000)
    return context, page


def hud(page, width, height, mobile):
    for selector in ['.brand', '.compass', '.compass-box', '.header-actions', '.modes', '.rail', '.cam-dock', '.status', '.deck', '.cell-att', '#attitude', '.cell-thrust', '.cell-actions']:
        inside(page, selector, width, height)
    for a, b in [('.brand', '.compass'), ('.compass', '.header-actions'), ('.compass-box', '.modes'), ('.modes', '.cam-dock'), ('.cam-dock', '.rail'), ('.status', '.deck'), ('.cam-dock', '.deck')]:
        clear(page, a, b)
    for selector in ['#sound', '#help', '#fullscreen', '.modes-summary', '#throttle', '#brake', '#parkBrake', '#quickGear', '#quickFlaps', '#resetCamera']:
        target(page, selector)
    for selector in ['[data-panel]', '[data-camera]']:
        for item in page.locator(selector).all():
            r = item.bounding_box()
            assert r and r['width'] >= 39.5 and r['height'] >= 39.5, (selector, r)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.evaluate('''() => { const d = document.querySelector('.deck').getBoundingClientRect();
      return [...document.querySelectorAll('.deck .act, #attitude, #throttle')].every(e => {
        const r = e.getBoundingClientRect(); return r.left >= d.left && r.right <= d.right && r.top >= d.top && r.bottom <= d.bottom;
      }); }'''), 'deck controls must not be clipped'
    for mode in ['chase', 'cockpit', 'wing', 'tower', 'orbit']:
        page.locator(f'[data-camera="{mode}"]').click()
        assert page.evaluate('flightLab.cameraView().mode') == mode
    page.locator('#help').click()
    assert page.locator('#helpDialog').is_visible()
    target(page, '#helpDialog .dialog-close')
    page.locator('#helpDialog .dialog-close').click()
    if mobile:
        assert page.locator('#touchControls').is_hidden(), 'ground observation should hide the flight pad'
        page.evaluate("flightLab.go('takeoff')")
        page.locator('#takeControl').wait_for(state='visible', timeout=30000)
        page.locator('#touchControls').wait_for(state='visible', timeout=30000)
        for a, b in [('.status', '#touchControls'), ('.rail', '#touchControls'), ('.cam-dock', '#touchControls'), ('.deck', '#touchControls')]:
            clear(page, a, b)
        target(page, '#takeControl')
        for item in page.locator('#touchControls button').all():
            r = item.bounding_box()
            assert r and r['width'] >= 40 and r['height'] >= 40, r
        page.screenshot(path=str(SHOTS / f'after-{width}-flight.png'))
        page.locator('#takeControl').click()
        page.evaluate("flightLab.go('inspect')")
    else:
        page.screenshot(path=str(SHOTS / f'after-{width}-desktop.png'))


def panels(page, width, height):
    for panel in ['aircraft', 'parts', 'livery', 'world', 'about']:
        page.locator(f'[data-panel="{panel}"]').click()
        page.locator(f'#{panel}Panel').wait_for(state='visible')
        inside(page, '#drawer', width, height)
        clear(page, '#drawer', '.rail')
        clear(page, '#drawer', '.deck')
        target(page, '#closeDrawer')
        if panel == 'world':
            for choice in ['dusk', 'night', 'day']:
                page.locator(f'button[data-time="{choice}"]').click()
                assert page.locator(f'button[data-time="{choice}"]').evaluate('(e) => e.classList.contains("active")')
                target(page, f'button[data-time="{choice}"]')
            for selector, value in [('#weatherCloud', 'partly'), ('#weatherRain', 'light'), ('#weatherVisibility', 'moderate')]:
                page.locator(selector).select_option(value)
                target(page, selector)
            page.locator('#windDirection').fill('120')
            target(page, '#windDirection')
            page.locator('#windSpeed').fill('20')
            target(page, '#windSpeed')
            assert '20 kt' in page.locator('#windSpeedValue').inner_text()
            if width == 360:
                page.locator('#worldPanel').evaluate('(e) => e.scrollTop = 0')
                page.screenshot(path=str(SHOTS / 'after-360-world.png'))
        page.locator('#closeDrawer').click()
    page.locator('#windHud').wait_for(state='visible', timeout=30000)
    inside(page, '#windHud', width, height)
    for other in ['.modes', '.cam-dock', '.rail', '.deck']:
        clear(page, '#windHud', other)
    page.evaluate("document.querySelector('#loadBar').hidden=false;document.querySelector('#loadProgress').textContent='AIRBUS A380–800 · 已下载 100.0 / 150.0 MB · 67% · 正在构建模型…'")
    inside(page, '#loadProgress', width, height)
    for other in ['.cam-dock', '.rail', '#windHud', '.modes']:
        clear(page, '#loadProgress', other)
    page.evaluate("document.querySelector('#loadBar').hidden=true")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--portrait-only', action='store_true', help='skip landscape and desktop sanity checks')
    args = parser.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for width, height in [(390, 844), (360, 740)]:
            context, page = launch_page(browser, width, height, True)
            assert not page.locator('.modes').evaluate('(e) => e.open'), 'portrait missions should start collapsed'
            hud(page, width, height, True)
            page.locator('.modes-summary').click()
            assert page.locator('.modes').evaluate('(e) => e.open')
            inside(page, '.modes', width, height)
            clear(page, '.modes', '.cam-dock')
            page.locator('.modes-summary').click()
            panels(page, width, height)
            print(f'PASS {width}x{height} portrait', flush=True)
            if width == 360 and not args.portrait_only:
                page.set_viewport_size({'width': 844, 'height': 390})
                page.reload(wait_until='domcontentloaded', timeout=120000)
                page.locator('#loading').wait_for(state='detached', timeout=300000)
                page.wait_for_function('window.flightLab && document.body.classList.contains("ground-inspect")', timeout=120000)
                hud(page, 844, 390, True)
                panels(page, 844, 390)
                print('PASS 844x390 landscape', flush=True)
            context.close()
        if not args.portrait_only:
            context, page = launch_page(browser, 1100, 700, False)
            assert page.locator('.modes').evaluate('(e) => e.open'), 'desktop missions should remain expanded'
            hud(page, 1100, 700, False)
            panels(page, 1100, 700)
            print('PASS 1100x700 desktop', flush=True)
            context.close()
        browser.close()


if __name__ == '__main__':
    main()
