#!/usr/bin/env python3
"""Optional integration test: pip install playwright; run against a built static app.
Uses Chromium mobile emulation, not a physical iPhone/Android or native install UI.
Prompt text is only inspected/copied as inert data, never executed.
"""
import argparse
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3000')
parser.add_argument('--screenshots', default='screenshots')
args = parser.parse_args()
url = args.url.rstrip('/') + '/'
shots = Path(args.screenshots).resolve()
shots.mkdir(parents=True, exist_ok=True)
results = {}
errors = []


def no_overflow(page):
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), 'Horizontal overflow'


def browse_results(page, term):
    expect(page.get_by_role('heading', name='Browse prompts', exact=True)).to_be_attached()
    field = page.get_by_role('searchbox', name='Search prompts in Browse', exact=True)
    expect(field).to_have_value(term)
    heading = page.locator('h2[tabindex="-1"]')
    expect(heading).to_contain_text('matching')
    assert page.locator('.prompt-card').count() > 0
    expect(page.locator('.prompt-card').first).to_be_in_viewport()
    assert page.evaluate('document.activeElement.tagName') != 'INPUT'
    no_overflow(page)
    return heading.inner_text()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1, service_workers='allow')
    context.grant_permissions(['clipboard-read', 'clipboard-write'])
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url, wait_until='networkidle')
    field = page.get_by_role('searchbox', name='Search local prompts', exact=True)
    expect(field).to_be_visible(timeout=60000)
    expect(page.get_by_role('button', name='Save offline', exact=True)).to_be_enabled()
    assert field.get_attribute('enterkeyhint') == 'search'
    assert float(field.evaluate('(input) => parseFloat(getComputedStyle(input).fontSize)')) >= 16
    search_button = page.get_by_role('button', name='Search', exact=True)
    assert search_button.bounding_box()['height'] >= 44
    no_overflow(page)
    page.evaluate('window.__searchFlowMarker = "same-document"')
    field.tap()
    field.press_sequentially('email', delay=60)
    expect(page.get_by_role('heading', name='Top matches for “email”', exact=True)).to_be_attached()
    expect(page.locator('.prompt-card')).to_have_count(6)
    results['home_live_preview'] = 6
    page.get_by_role('button', name='Search', exact=True).tap()
    results['iphone_search_button'] = browse_results(page, 'email')
    assert page.evaluate('window.__searchFlowMarker') == 'same-document', 'Search reloaded the document'
    expect(page.locator('.prompt-card')).to_have_count(60)

    field = page.get_by_role('searchbox', name='Search prompts in Browse', exact=True)
    field.fill('research')
    field.press('Enter')
    results['keyboard_enter'] = browse_results(page, 'research')
    field.fill('')
    page.get_by_role('combobox', name='Format', exact=True).select_option('IMAGE')
    expect(page.locator('.prompt-card')).to_have_count(60)
    assert page.locator('.prompt-card').evaluate_all('(cards) => cards.every(card => card.dataset.modality === "IMAGE")')
    page.get_by_role('button', name='Load 60 more', exact=True).tap()
    expect(page.locator('.prompt-card')).to_have_count(120)
    results['filter_and_pagination'] = 'IMAGE only; 60 → 120 cards'

    field.fill('zxqnonexistent987654321')
    field.press('Enter')
    expect(page.get_by_role('heading', name='No prompts match these filters', exact=True)).to_be_visible()
    expect(page.locator('.prompt-card')).to_have_count(0)
    page.get_by_role('button', name='Clear filters', exact=True).tap()
    expect(page.locator('.prompt-card')).to_have_count(60)
    results['empty_state_and_clear'] = 'passed'

    first = page.locator('.prompt-card').first
    prompt_id = first.get_attribute('data-prompt-id')
    prompt_title = first.locator('h3').inner_text()
    first.tap()
    expect(page.get_by_role('heading', name=prompt_title, exact=True)).to_be_visible()
    text = page.locator('.prompt-content').first.inner_text()
    assert text
    assert page.locator('.prompt-content script').count() == 0
    page.get_by_role('button', name='Copy text', exact=True).tap()
    expect(page.get_by_role('button', name='Copied', exact=True)).to_be_visible()
    assert page.evaluate('navigator.clipboard.readText()') == text
    page.get_by_role('button', name='Back to browse', exact=True).tap()
    assert page.evaluate('JSON.parse(localStorage.getItem("prompt-shelf-recent-v2"))[0]') == prompt_id
    results['prompt_view_copy_and_recents'] = 'passed; text remained inert'

    page.get_by_role('button', name='Save offline', exact=True).tap()
    expect(page.get_by_role('status').filter(has_text=re.compile('^Ready offline$'))).to_be_visible(timeout=180000)
    # Inspect platform help without invoking an OS install dialog.
    page.get_by_role('button', name='Offline help', exact=True).tap()
    expect(page.locator('#install-help')).to_contain_text('iPhone / iPad')
    expect(page.locator('#install-help')).to_contain_text('Android')
    results['install_help'] = 'iOS and Android instructions visible'
    status = page.evaluate('''async () => {
      const registration = await navigator.serviceWorker.ready;
      return await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => reject(Error('Offline status timeout')), 5000);
        channel.port1.onmessage = event => { clearTimeout(timeout); resolve(event.data); channel.port1.close(); };
        registration.active.postMessage({type:'GET_OFFLINE_STATUS'}, [channel.port2]);
      });
    }''')
    assert status['ready'] and status['total'] >= 12 and status['bytes'] >= 35000000
    results['verified_offline_cache'] = status
    manifest = page.evaluate('fetch(document.querySelector("link[rel=manifest]").href).then(response => response.json())')
    assert manifest['name'] == 'MEH AI prompt digital library'
    assert manifest['display'] == 'standalone'
    assert {'192x192', '512x512'} <= {icon['sizes'] for icon in manifest['icons']}
    results['install_manifest'] = 'standalone; 192px and 512px icons; iOS touch icon metadata'
    assert page.locator('link[rel="apple-touch-icon"]').count() >= 1

    # A registered worker with one evicted file must not claim readiness; Save must repair it.
    evicted = page.evaluate('''async (version) => {
      const cache = await caches.open('meh-ai-precache-' + version);
      return await cache.delete('/data/library.json');
    }''', status['version'])
    assert evicted
    page.reload(wait_until='networkidle')
    expect(page.get_by_role('button', name='Save offline', exact=True)).to_be_enabled()
    assert page.get_by_role('status').filter(has_text=re.compile('^Ready offline$')).count() == 0
    page.get_by_role('button', name='Save offline', exact=True).tap()
    expect(page.get_by_role('status').filter(has_text=re.compile('^Ready offline$'))).to_be_visible(timeout=180000)
    results['partial_cache_detection_and_repair'] = 'missing manifest detected and re-saved without losing recents'

    # Cold tab, empty document memory, browser HTTP cache disabled, network offline.
    context.set_offline(True)
    page.close()
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    offline_responses = []
    page.on('response', lambda response: offline_responses.append({'url': response.url, 'sw': response.from_service_worker, 'status': response.status}))
    cdp = context.new_cdp_session(page)
    cdp.send('Network.enable')
    cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
    page.goto(url, wait_until='domcontentloaded')
    field = page.get_by_role('searchbox', name='Search local prompts', exact=True)
    expect(field).to_be_visible(timeout=60000)
    expect(page.get_by_role('status').filter(has_text=re.compile('Ready offline|library ready'))).to_be_visible()
    assert page.evaluate('''async () => {
      try { await fetch('/__uncached_offline_probe__', {cache:'no-store'}); return false; }
      catch { return true; }
    }'''), 'An uncached network request unexpectedly succeeded'
    assert page.evaluate('JSON.parse(localStorage.getItem("prompt-shelf-recent-v2"))[0]') == prompt_id
    field.fill('email')
    page.get_by_role('button', name='Search', exact=True).tap()
    results['offline_cold_start_search'] = browse_results(page, 'email')
    page.screenshot(path=str(shots / 'iphone-offline-search.png'), full_page=False)
    page.locator('.prompt-card').first.tap()
    expect(page.locator('.prompt-content').first).to_be_visible()
    page.get_by_role('button', name='Copy text', exact=True).tap()
    expect(page.get_by_role('button', name='Copied', exact=True)).to_be_visible()
    results['offline_prompt_view_and_copy'] = 'passed'
    page.get_by_role('button', name='Back to browse', exact=True).tap()

    # Android-sized touch viewport on the same offline saved copy.
    page.set_viewport_size({'width': 360, 'height': 800})
    field = page.get_by_role('searchbox', name='Search prompts in Browse', exact=True)
    field.fill('video')
    field.press('Enter')
    results['android_sized_offline_keyboard_search'] = browse_results(page, 'video')
    page.screenshot(path=str(shots / 'android-offline-search.png'), full_page=False)
    page.set_viewport_size({'width': 320, 'height': 740})
    no_overflow(page)
    results['narrow_320px_layout'] = 'no horizontal overflow'
    data_responses = [response for response in offline_responses if '/data/' in response['url']]
    assert len(data_responses) >= 11
    assert all(response['sw'] and response['status'] == 200 for response in data_responses)
    results['offline_data_files_from_service_worker'] = len(data_responses)
    assert not errors, errors
    results['javascript_errors'] = errors
    results['screenshots'] = [str(shots / 'iphone-offline-search.png'), str(shots / 'android-offline-search.png')]
    browser.close()

print(json.dumps(results, indent=2))
