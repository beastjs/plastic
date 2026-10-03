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
4. Choose **Copy as HTML or Code**, an HTML style (**CSS** or **Tailwind**), and a code format (**BTSX** or **TSRX**) before capturing. The popup and picker bar remember each choice separately. The selected HTML style also applies to the markup sent for code conversion.
5. Hover over a component. The outline shows its tag and dimensions.
6. Press **↑** to select its parent and **↓** to return to its child.
7. **Click** or press **Enter** to capture the selected element. Hold **Shift** to outline the entire page, then click or press **Enter** to copy it; release Shift to return to the hovered element. You can also click **Copy page** in the picker dock. A progress indicator appears while a large capture or conversion runs. Paste the result into your editor or canvas.
8. Press **Escape**, or click the toolbar icon again, to cancel.

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

CSS mode writes the differences as inline `style` attributes. Tailwind mode converts each inline style to utility classes instead — idiomatic utilities where they exist (`flex`, `font-bold`, `text-center`) and arbitrary values/properties elsewhere (`text-[24px]`, `bg-[rgb(180,20,60)]`, `[font-feature-settings:liga]`), so no `style` attributes remain. Tailwind output needs Tailwind in the destination to render as intended.

BTSX and TSRX code mode send the captured HTML in the selected CSS or Tailwind style to the [Beast converter](https://beast-converter.beastjs.workers.dev/api/converter) as JSON (`{ "code": "...", "outputs": ["btsx"] }` or `"tsrx"`). Requesting only the selected format reduces large responses. Its code is copied as plain text. Conversion requires network access; if the service fails, Plastic shows the error and leaves the clipboard unchanged.

A styled button with an SVG icon is covered by a size regression test (under 1,500 characters) and an exact screenshot comparison after pasting into a separate document. The current fixture produces 664 characters. Output size varies with the component's structure and styling.

Compact styles assume ordinary browser defaults. A destination with its own conflicting CSS reset or element rules can change the appearance; an isolated canvas document is the most predictable destination.

## Prototype limits

- Chrome internal pages, the Chrome Web Store, and other protected pages do not permit injection.
- Only the main document is copied; iframe contents and shadow DOM are not traversed.
- Computed styles are preserved, but external fonts, CSS image URLs, pseudo-elements, canvas/video pixels, and interactive application state are not embedded. This is HTML copying, not a screenshot.
- Rich-text destinations may remove unsupported styling. Large pages can take time and create large clipboard payloads.
- The Beast converter accepts at most 524,288 bytes (512 KiB) per JSON request. JSON escaping can make the request larger than the captured HTML. Plastic reports the encoded size before sending an oversized conversion; copy a smaller element or use HTML mode. Large pages can also exceed the converter compiler's capacity even below this request limit.
- Text selection in input/textarea controls is not supported by the document-selection mode.
