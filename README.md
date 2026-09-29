# Plastic

A Chrome extension prototype with a Paper Snapshot-style element picker. Capture a live webpage component and paste editable HTML with computed inline CSS into a code editor or an HTML canvas. Both clipboard representations (`text/html` and `text/plain`) contain the captured markup in picker mode. `PROTO.md` contains earlier screenshot research; the implemented product is the web copier.

## Build

Requires Node.js 22 or later and npm.

```sh
npm ci
npm run build
```

The complete unpacked extension is generated in `dist/`. Builds replace that generated folder; edit source files outside it.

## Install and try it

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select the `dist` folder in this project.
3. Open a regular webpage and click **Plastic** in the extensions toolbar. Selection starts immediately.
4. Hover over a component. The outline shows its tag and dimensions.
5. Press **↑** to select its parent and **↓** to return to its child.
6. **Click** or press **Enter** to capture the selected element. Paste into your HTML/CSS editor or an HTML-capable canvas.
7. Press **Escape**, or click the toolbar icon again, to cancel.

The default activation shortcut is **Command+Shift+P** on macOS and **Ctrl+Shift+P** elsewhere. Assign or change it in `chrome://extensions/shortcuts` if another extension already uses it.

This follows the interaction described in [Paper Snapshot’s guide](https://paper.design/snapshot-extension). It exports ordinary HTML/CSS for your own tools; it does not generate Paper's proprietary layer format.

After changing source files, run `npm run build` and click **Reload** on the extension card. Reload webpage tabs too, so previously injected code is replaced.

## Automated browser tests

```sh
npx playwright install chromium
npm test
```

Tests build and load the actual extension in an isolated Chromium profile, invoke its action to grant `activeTab`, and verify real clipboard HTML and text. They cover whole-page copying, partial text selection with inherited styles, empty selections, repeated picker activation, link-click interception, Escape cancellation, keyboard parent/child navigation, Enter capture, toolbar toggling, HTML pasted into a separate document, legacy popup feedback, and restricted-page errors. Chromium's unsafe extension debugging flag is used only in the disposable test browser to invoke the toolbar action; the shipped extension does not request debugger access.

`npm run typecheck` checks the TypeScript source separately.

## Compact capture output

Captures compare a focused set of visual CSS properties against a clean browser document. Only differences are written, with parents processed first so children reuse inherited styles. Site classes, HTML IDs, event handlers, and framework data attributes are omitted; semantic/media attributes and SVG geometry are retained.

A styled button with an SVG icon is covered by a size regression test (under 1,500 characters) and an exact screenshot comparison after pasting into a separate document. The current fixture produces 664 characters. Output size varies with the component's structure and styling.

Compact styles assume ordinary browser defaults. A destination with its own conflicting CSS reset or element rules can change the appearance; an isolated canvas document is the most predictable destination.

## Prototype limits

- Chrome internal pages, the Chrome Web Store, and other protected pages do not permit injection.
- Only the main document is copied; iframe contents and shadow DOM are not traversed.
- Computed styles are preserved, but external fonts, CSS image URLs, pseudo-elements, canvas/video pixels, and interactive application state are not embedded. This is HTML copying, not a screenshot.
- Rich-text destinations may remove unsupported styling. Large pages can take time and create large clipboard payloads.
- Text selection in input/textarea controls is not supported by the document-selection mode.
