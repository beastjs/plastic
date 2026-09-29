import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';

let context: BrowserContext;
let server: Server;
let profile: string;
let page: Page;
let control: Page;
let extensionId: string;
let origin: string;
const fixture = `<!doctype html><html><head><style>
body { color: rgb(20, 30, 40); } #sample {color: rgb(180, 20, 60);font-weight:700;font-size:24px}
</style></head><body><h1>Fixture page</h1><p id="sample">Before <span>styled selection</span> after</p>
<a id="link" href="/destination">Pick this link</a><img src="/image.svg"><div style="height:1600px">Long page</div></body></html>`;

test.beforeAll(async () => {
  server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fixture); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  profile = await mkdtemp(path.join(os.tmpdir(), 'plastic-test-'));
  const extensionPath = path.resolve('dist');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: ['--enable-unsafe-extension-debugging', `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  // Inspect the actual installed extension; no production background worker is needed.
  const extensions = await context.newPage();
  await extensions.goto('chrome://extensions');
  extensionId = await extensions.evaluate(async () => {
    const entries = await (globalThis as any).chrome.developerPrivate.getExtensionsInfo();
    const extension = entries.find((entry: any) => entry.name === 'Plastic');
    if (!extension) throw new Error('Plastic did not load');
    if (extension.manifestErrors?.length) throw new Error(JSON.stringify(extension.manifestErrors));
    return extension.id;
  });
  control = await context.newPage();
  await control.goto(`chrome-extension://${extensionId}/popup.html`);
  page = await context.newPage();
  await page.goto(origin);
  await context.grantPermissions(['clipboard-read'], { origin });
  const browserCdp = await context.browser()!.newBrowserCDPSession();
  const { targetInfos } = await browserCdp.send('Target.getTargets', {filter:[{type:'tab'}]});
  const target = targetInfos.find(target => target.url === `${origin}/`)!;
  await browserCdp.send('Extensions.triggerAction' as any, {id: extensionId, targetId: target.targetId});

});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve());
  if (profile) await rm(profile, { recursive: true, force: true });
});

async function command(action: string) {
  await page.bringToFront();
  return control.evaluate(async (action) => {
    const chrome = (globalThis as any).chrome;
    const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files:['content.js']});
    return chrome.tabs.sendMessage(tab.id, {action});
  }, action);
}
async function clipboard() {
  return page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return {html: await (await item.getType('text/html')).text(), text: await (await item.getType('text/plain')).text()};
  });
}

test('copies the entire page with computed styles and absolute URLs', async () => {
  expect((await command('COPY_PAGE')).success).toBe(true);
  const output = await clipboard();
  expect(output.text).toContain('Fixture page');
  expect(output.text).toContain('Long page');
  expect(output.html).toContain('rgb(180, 20, 60)');
  expect(output.html).toContain(`${origin}/destination`);
});

test('copies a partial text selection with inherited styles', async () => {
  await page.locator('#sample span').evaluate(element => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 2);
    range.setEnd(element.firstChild!, 9);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  expect((await command('COPY_SELECTION')).success).toBe(true);
  const output = await clipboard();
  expect(output.text).toBe('yled se');
  expect(output.html).toContain('rgb(180, 20, 60)');
  expect(await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('span')!.style.fontWeight, output.html)).toBe('700');
});

test('reports an empty selection', async () => {
  await page.evaluate(() => window.getSelection()!.removeAllRanges());
  expect(await command('COPY_SELECTION')).toMatchObject({success:false, message:expect.stringContaining('Nothing selected')});
});

test('picker can restart, copies the click target, and blocks link navigation', async () => {
  await command('START_PICKER');
  await command('START_PICKER');
  await page.locator('#link').click();
  await expect(page.locator('[data-plastic-notice]')).toContainText('HTML captured');
  expect(page.url()).toBe(`${origin}/`);
  expect((await clipboard()).text).toContain('Pick this link</a>');
  expect(await page.locator('[data-plastic-picker]').count()).toBe(0);
});

test('Escape cancels the picker and restores normal clicks', async () => {
  await command('START_PICKER');
  await page.keyboard.press('Escape');
  expect(await page.locator('[data-plastic-picker]').count()).toBe(0);
  await page.locator('#link').click();
  await expect(page).toHaveURL(`${origin}/destination`);
});


test('popup buttons show success and empty-selection feedback', async () => {
  await page.bringToFront();
  await control.evaluate(() => document.getElementById('copy-page')!.click());
  await expect(control.locator('#status')).toHaveText('Copied with styles!');
  expect((await clipboard()).text).toContain('Fixture page');
  await page.evaluate(() => window.getSelection()!.removeAllRanges());
  await control.evaluate(() => document.getElementById('copy-selection')!.click());
  await expect(control.locator('#status')).toContainText('Nothing selected');
  await expect(control.locator('#copy-selection')).toBeEnabled();
});

test('arrow keys refine the target and Enter copies editable HTML with matching styles', async () => {
  await command('START_PICKER');
  await page.locator('#sample span').hover();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-plastic-picker] .label')).toContainText('p#sample');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-plastic-picker] .label')).toContainText('span');
  await page.keyboard.press('ArrowUp');
  await page.screenshot({path:'test-results/picker-preview.png'});
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-plastic-notice]')).toContainText('HTML captured');
  const output = await clipboard();
  expect(output.text).toMatch(/^<p /);
  expect(output.text).toContain('Before');
  expect(output.text).not.toContain('data-plastic');
  const result = await page.evaluate(async html => {
    const frame = document.createElement('iframe');
    frame.style.width = '1000px';
    document.body.append(frame);
    frame.contentDocument!.body.innerHTML = html;
    const copied = frame.contentDocument!.querySelector('p')!;
    const style = frame.contentWindow!.getComputedStyle(copied);
    const result = {color:style.color, fontSize:style.fontSize, fontWeight:style.fontWeight, text:copied.textContent};
    frame.remove();
    return result;
  }, output.text);
  expect(result).toEqual({color:'rgb(180, 20, 60)', fontSize:'24px', fontWeight:'700', text:'Before styled selection after'});
});

test('toolbar action toggles the picker directly without a popup', async () => {
  await page.bringToFront();
  const cdp = await context.browser()!.newBrowserCDPSession();
  const {targetInfos} = await cdp.send('Target.getTargets', {filter:[{type:'tab'}]});
  const target = targetInfos.find(target => target.url === page.url())!;
  await cdp.send('Extensions.triggerAction' as any, {id:extensionId, targetId:target.targetId});
  await expect(page.locator('[data-plastic-picker]')).toHaveCount(1);
  await cdp.send('Extensions.triggerAction' as any, {id:extensionId, targetId:target.targetId});
  await expect(page.locator('[data-plastic-picker]')).toHaveCount(0);
});

test('a styled button stays compact and renders identically when pasted', async () => {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = `.cta {display:inline-flex;align-items:center;gap:8px;background:#7c3aed;color:white;border:0;border-radius:9px;padding:12px 20px;font:600 14px/20px Arial;box-shadow:0 2px 4px #0002}`;
    document.head.append(style);
    const button = document.createElement('button');
    button.id = 'compact-button';
    button.className = 'cta';
    button.setAttribute('data-framework-state', 'x'.repeat(5000));
    button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg><span>Continue</span>';
    document.body.prepend(button);
  });
  await command('START_PICKER');
  await page.locator('#compact-button').hover({position:{x:5,y:5}});
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-plastic-notice]')).toContainText('HTML captured');
  const {text:html} = await clipboard();
  expect(html.length).toBeLessThan(1500);
  expect(html).not.toContain('data-framework');
  expect(html).not.toContain('class=');
  expect(html).not.toContain('animation');
  console.log(`Styled button with SVG: ${html.length} characters`);
  await page.evaluate(html => {
    const frame = document.createElement('iframe');
    frame.id = 'paste-test';
    frame.style.cssText = 'width:1000px;height:200px';
    document.body.prepend(frame);
    frame.contentDocument!.body.innerHTML = html;
  }, html);
  const original = page.locator('#compact-button');
  const pasted = page.frameLocator('#paste-test').locator('button');
  await expect(pasted).toHaveText('Continue');
  expect(await pasted.screenshot()).toEqual(await original.screenshot());
  await page.locator('#paste-test').evaluate(frame => frame.remove());
});

test('popup reports restricted pages and re-enables its buttons', async () => {
  await page.goto('chrome://version');
  await page.bringToFront();
  await control.evaluate(() => document.getElementById('copy-page')!.click());
  await expect(control.locator('#status')).toContainText('Cannot copy this page');
  await expect(control.locator('#copy-page')).toBeEnabled();
});
