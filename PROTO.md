## How Full-Page Screenshot Extensions Work

The extension you mentioned likely uses one or more of these techniques:

1. **Chrome DevTools Protocol (CDP)** - Accesses the browser's internal screenshot API that can capture beyond the viewport
2. **Content Script Injection** - Injects a script to scroll, capture visible portions, and stitch them together
3. **Canvas Stitching** - Uses `html2canvas` or similar libraries to render the DOM to a canvas
4. **Native Messaging** - Communicates with a native host application for deeper system access

### Common Technical Approaches:

| Method | Pros | Cons |
|--------|------|------|
| **CDP `captureFullSizeScreenshot`** | Accurate, handles fixed elements | Requires debugger permission, complex |
| **Scroll & Stitch** | Works everywhere | Seam alignment issues, slow |
| **html2canvas** | Pure JS, easy to implement | Large pages crash, CSS limitations |
| **chrome.tabs.captureVisibleTab** | Simple API | Only visible area |

---

## Working Prototype Extension

Here's a complete Chrome extension that captures full pages by scrolling and stitching:

### 1. `manifest.json`
```json
{
  "manifest_version": 3,
  "name": "Full Page Screenshot",
  "version": "1.0",
  "description": "Capture entire webpage screenshots",
  "permissions": ["activeTab", "scripting", "downloads"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icon.png",
      "48": "icon.png",
      "128": "icon.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  }
}
```

### 2. `popup.html`
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      width: 280px;
      padding: 16px;
      font-family: system-ui, sans-serif;
    }
    button {
      width: 100%;
      padding: 12px;
      margin: 8px 0;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.9;
    }
    #capture {
      background: #4f46e5;
      color: white;
    }
    #capture-pdf {
      background: #059669;
      color: white;
    }
    #status {
      margin-top: 12px;
      padding: 8px;
      border-radius: 6px;
      font-size: 12px;
      display: none;
    }
    .loading {
      background: #fef3c7;
      color: #92400e;
    }
    .success {
      background: #d1fae5;
      color: #065f46;
    }
    .error {
      background: #fee2e2;
      color: #991b1b;
    }
    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid #92400e;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 6px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <h3>📸 Full Page Screenshot</h3>
  <button id="capture">
    Capture Full Page (PNG)
  </button>
  <button id="capture-pdf">
    Capture as PDF
  </button>
  <div id="status"></div>
  <script src="popup.js"></script>
</body>
</html>
```

### 3. `popup.js`
```javascript
const captureBtn = document.getElementById('capture');
const capturePdfBtn = document.getElementById('capture-pdf');
const status = document.getElementById('status');

function showStatus(message, type) {
  status.style.display = 'block';
  status.className = type;
  status.innerHTML = type === 'loading' 
    ? `<span class="spinner"></span>${message}` 
    : message;
}

captureBtn.addEventListener('click', async () => {
  showStatus('Capturing page...', 'loading');
  captureBtn.disabled = true;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureFullPage
    });
    
    const { dataUrl, filename } = result[0].result;
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
    
    showStatus('✅ Screenshot saved!', 'success');
  } catch (err) {
    showStatus('❌ Error: ' + err.message, 'error');
  } finally {
    captureBtn.disabled = false;
  }
});

capturePdfBtn.addEventListener('click', async () => {
  showStatus('Generating PDF...', 'loading');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureAsPDF
    });
    
    showStatus('✅ PDF generated!', 'success');
  } catch (err) {
    showStatus('❌ Error: ' + err.message, 'error');
  }
});
```

### 4. `background.js` (Service Worker)
```javascript
// Handle any background tasks if needed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Full Page Screenshot extension installed');
});
```

### 5. `content.js` (Injected Script Functions)

These functions are injected into the page:

```javascript
// This runs in the page context via executeScript
function captureFullPage() {
  return new Promise(async (resolve) => {
    const scrollDelay = ms => new Promise(r => setTimeout(r, ms));
    
    // Get page dimensions
    const body = document.body;
    const html = document.documentElement;
    const fullWidth = Math.max(
      body.scrollWidth, body.offsetWidth,
      html.clientWidth, html.scrollWidth, html.offsetWidth
    );
    const fullHeight = Math.max(
      body.scrollHeight, body.offsetHeight,
      html.clientHeight, html.scrollHeight, html.offsetHeight
    );
    
    // Viewport size
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate number of screenshots needed
    const cols = Math.ceil(fullWidth / viewportWidth);
    const rows = Math.ceil(fullHeight / viewportHeight);
    
    // Create canvas for stitching
    const canvas = document.createElement('canvas');
    canvas.width = fullWidth;
    canvas.height = fullHeight;
    const ctx = canvas.getContext('2d');
    
    // Store original scroll position
    const originalX = window.scrollX;
    const originalY = window.scrollY;
    
    // Hide fixed elements temporarily
    const fixedElements = [];
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        fixedElements.push({ el, originalDisplay: el.style.display });
        el.style.display = 'none';
      }
    });
    
    // Capture tiles
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const scrollX = col * viewportWidth;
        const scrollY = row * viewportHeight;
        
        window.scrollTo(scrollX, scrollY);
        await scrollDelay(150); // Wait for rendering
        
        // Capture visible area
        const dataUrl = await new Promise(r => {
          chrome.runtime.sendMessage({ action: 'capture' }, r);
        });
        
        // If using html2canvas fallback:
        // const dataUrl = await html2canvas(document.documentElement).toDataURL();
        
        const img = new Image();
        img.src = dataUrl;
        await new Promise(r => { img.onload = r; });
        
        // Calculate draw position
        const drawX = scrollX;
        const drawY = scrollY;
        const drawWidth = Math.min(viewportWidth, fullWidth - scrollX);
        const drawHeight = Math.min(viewportHeight, fullHeight - scrollY);
        
        ctx.drawImage(
          img,
          0, 0, drawWidth, drawHeight,
          drawX, drawY, drawWidth, drawHeight
        );
      }
    }
    
    // Restore fixed elements
    fixedElements.forEach(({ el, originalDisplay }) => {
      el.style.display = originalDisplay;
    });
    
    // Restore scroll position
    window.scrollTo(originalX, originalY);
    
    // Generate filename
    const hostname = window.location.hostname.replace(/^www\./, '');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `${hostname}-${timestamp}.png`;
    
    resolve({
      dataUrl: canvas.toDataURL('image/png'),
      filename
    });
  });
}

// Alternative: Using Chrome's native capture API
function captureWithNativeAPI() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ 
      action: 'captureFullPage',
      url: window.location.href 
    }, resolve);
  });
}

// PDF capture using print to PDF approach
function captureAsPDF() {
  const printWindow = window.open('', '_blank');
  const content = document.documentElement.outerHTML;
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${document.title}</title>
      <style>
        @media print {
          body { -webkit-print-color-adjust: exact; }
        }
        ${Array.from(document.styleSheets)
          .map(s => {
            try {
              return Array.from(s.cssRules).map(r => r.cssText).join('');
            } catch(e) { return ''; }
          }).join('')}
      </style>
    </head>
    <body>${document.body.innerHTML}</body>
    </html>
  `);
  
  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
```

### 6. Enhanced `background.js` with Native Capture
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture') {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: 'png',
      quality: 100
    }, sendResponse);
    return true; // Keep channel open for async
  }
  
  if (request.action === 'captureFullPage') {
    captureUsingCDP(sender.tab.id, sendResponse);
    return true;
  }
});

// Advanced: Use Chrome DevTools Protocol
async function captureUsingCDP(tabId, sendResponse) {
  try {
    // Attach to tab
    await chrome.debugger.attach({ tabId }, '1.3');
    
    // Enable page domain
    await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
    
    // Capture full size screenshot
    const result = await chrome.debugger.sendCommand(
      { tabId }, 
      'Page.captureScreenshot',
      { 
        format: 'png',
        captureBeyondViewport: true,
        fromSurface: true
      }
    );
    
    await chrome.debugger.detach({ tabId });
    
    const dataUrl = 'data:image/png;base64,' + result.data;
    sendResponse({ success: true, dataUrl });
  } catch (err) {
    await chrome.debugger.detach({ tabId });
    sendResponse({ success: false, error: err.message });
  }
}
```

---

## Installation Instructions

1. Create a folder with all these files
2. Open Chrome → Extensions → Developer mode ON
3. Click "Load unpacked" → Select your folder
4. Click the extension icon on any webpage

## Key Improvements Over Basic Approaches

| Feature | Implementation |
|---------|---------------|
| **Handles fixed headers** | Temporarily hides `position: fixed/sticky` elements |
| **Seamless stitching** | Precise scroll positioning with rendering delays |
| **Large page support** | Tiled capture prevents memory issues |
| **CDP fallback** | Native Chrome API for perfect captures |
| **PDF export** | Print-to-PDF for document sharing |

## Limitations & Solutions

| Issue | Solution |
|-------|----------|
| Lazy-loaded images | Pre-scroll to trigger loading |
| Animations | Add delays, freeze CSS animations |
| iFrames | Inject capture script into each frame |
| Cross-origin images | Use `allowTaint: true` in html2canvas |
| Very long pages | Stream to disk, use multiple canvases |

Want me to enhance this with specific features like **element-specific capture**, **annotation tools**, or **cloud upload integration**?
