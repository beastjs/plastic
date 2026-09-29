// Repeated popup visits must not register duplicate listeners in the isolated world.
(() => {
  const state = globalThis as typeof globalThis & { plasticInstalled?: boolean }
  if (state.plasticInstalled) return
  state.plasticInstalled = true

  type Result = { success: boolean; message: string }

  // Visual properties only. Animation, interaction and browser-internal state do not
  // belong in a static snapshot. Longhands let the browser compact matching values.
  const visualProperties = `
    display box-sizing position top right bottom left z-index float clear
    width height min-width min-height max-width max-height aspect-ratio
    margin-top margin-right margin-bottom margin-left
    padding-top padding-right padding-bottom padding-left
    overflow-x overflow-y
    flex-direction flex-wrap flex-grow flex-shrink flex-basis order
    justify-content align-items align-content align-self justify-items justify-self
    grid-template-columns grid-template-rows grid-auto-flow grid-auto-columns grid-auto-rows
    grid-column-start grid-column-end grid-row-start grid-row-end row-gap column-gap
    color font-family font-size font-weight font-style font-stretch line-height
    font-variant font-feature-settings font-variation-settings
    letter-spacing word-spacing text-align text-transform text-indent white-space
    word-break overflow-wrap text-overflow vertical-align direction writing-mode
    text-decoration-line text-decoration-style text-decoration-color text-decoration-thickness
    text-underline-offset text-shadow
    background-color background-image background-position background-size background-repeat
    background-origin background-clip background-attachment
    border-top-width border-right-width border-bottom-width border-left-width
    border-top-style border-right-style border-bottom-style border-left-style
    border-top-color border-right-color border-bottom-color border-left-color
    border-top-left-radius border-top-right-radius border-bottom-right-radius border-bottom-left-radius
    border-image-source border-image-slice border-image-width border-image-outset border-image-repeat
    outline-width outline-style outline-color outline-offset
    box-shadow opacity visibility transform transform-origin translate rotate scale
    filter backdrop-filter clip-path mask-image mask-size mask-position mask-repeat
    object-fit object-position appearance list-style-type list-style-position list-style-image
    border-collapse border-spacing table-layout caption-side empty-cells
    fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap
    stroke-linejoin stroke-dasharray stroke-dashoffset paint-order vector-effect
  `.trim().split(/\s+/)

  const htmlAttributes = new Set(`href src alt title role aria-label aria-hidden
    width height colspan rowspan scope type disabled checked selected multiple
    value placeholder min max step dir lang controls poster open datetime`.split(/\s+/))

  function cloneWithComputedStyles(element: Element): Element {
    const clone = element.cloneNode(true) as Element
    // An isolated document provides real tag defaults without the site's CSS.
    // Parents are styled first so descendants can reuse captured inheritance.
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-same-origin')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${innerWidth}px;height:${innerHeight}px;visibility:hidden;pointer-events:none;border:0`
    document.documentElement.appendChild(frame)
    try {
      const baselineDocument = frame.contentDocument!
      const baselineWindow = frame.contentWindow!
      baselineDocument.body.style.margin = '0'
      function applyStyles(original: Element, copy: Element, parent: Element) {
        const isSvg = original.namespaceURI === 'http://www.w3.org/2000/svg'
        // Keep semantic/media attributes and SVG geometry, not site-specific hooks.
        for (const attr of [...copy.attributes]) {
          if (attr.name === 'style' || attr.name === 'class' || /^on|^data-/i.test(attr.name) ||
            (!isSvg && !htmlAttributes.has(attr.name))) copy.removeAttribute(attr.name)
        }
        for (const attribute of ['href', 'src', 'poster']) {
          const value = original.getAttribute(attribute)
          if (value && !(isSvg && value.startsWith('#'))) {
            try { copy.setAttribute(attribute, new URL(value, document.baseURI).href) } catch { /* Preserve unresolvable values. */ }
          }
        }
        if (original instanceof HTMLImageElement && original.currentSrc) copy.setAttribute('src', original.currentSrc)
        if (original instanceof HTMLInputElement) {
          copy.setAttribute('value', original.value)
          copy.toggleAttribute('checked', original.checked)
        }
        if (original instanceof HTMLOptionElement) copy.toggleAttribute('selected', original.selected)
        const baseline = baselineDocument.createElementNS(original.namespaceURI, original.localName)
        for (const attr of [...copy.attributes]) {
          // Baselines need presentation attributes but must not load media or navigate.
          if (!['src', 'href', 'poster'].includes(attr.name)) baseline.setAttribute(attr.name, attr.value)
        }
        parent.appendChild(baseline)
        const computed = getComputedStyle(original)
        const defaults = baselineWindow.getComputedStyle(baseline)
        const values = visualProperties.map(property => [property, computed.getPropertyValue(property)])
        const style = (copy as HTMLElement | SVGElement).style
        const baselineStyle = (baseline as HTMLElement | SVGElement).style
        for (const [property, value] of values) {
          if (value && value !== defaults.getPropertyValue(property)) {
            style.setProperty(property, value)
            baselineStyle.setProperty(property, value)
          }
        }
        if (!style.cssText) copy.removeAttribute('style')
        const children = Array.from(original.children).filter(child => child !== frame)
        for (let i = 0; i < children.length; i++) applyStyles(children[i], copy.children[i], baseline)
      }
      applyStyles(element, clone, baselineDocument.body)
      return clone
    } finally { frame.remove() }
  }

  function copyHtml(element: Element): string {
    element.querySelectorAll('script, style, link, iframe, object, embed').forEach(node => node.remove())
    for (const node of [element, ...element.querySelectorAll('*')]) {
      for (const attr of [...node.attributes]) {
        if (/^on/i.test(attr.name) || attr.name === 'srcdoc') node.removeAttribute(attr.name)
      }
    }
    return element.outerHTML
  }

  async function writeToClipboard(html: string, text: string): Promise<boolean> {
    // The extension permission permits copy events even when its popup has focus.
    let copied = false
    const onCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData) return
      event.clipboardData.setData('text/html', html)
      event.clipboardData.setData('text/plain', text)
      event.preventDefault()
      event.stopImmediatePropagation()
      copied = true
    }
    document.addEventListener('copy', onCopy, true)
    try {
      if (document.execCommand('copy') && copied) return true
    } catch { /* Try the modern API below. */ }
    finally { document.removeEventListener('copy', onCopy, true) }
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })])
      return true
    } catch { return false }
  }

  async function copyElement(element: Element, asSource = false): Promise<Result> {
    const html = copyHtml(cloneWithComputedStyles(element))
    const success = await writeToClipboard(html, asSource ? html :
      element instanceof HTMLElement ? element.innerText : element.textContent ?? '')
    return { success, message: success ? 'Copied with styles!' : 'Clipboard access failed. Focus the page and try again.' }
  }

  async function copySelection(): Promise<Result> {
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount || !selection.toString().trim()) {
      return { success: false, message: 'Nothing selected! Select text on the page first.' }
    }
    const container = document.createElement('div')
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i)
      const ancestor = range.commonAncestorContainer
      const root = ancestor instanceof Element ? ancestor : ancestor.parentElement!
      const clone = cloneWithComputedStyles(root)
      function counterpart(node: Node): Node {
        const path: number[] = []
        while (node !== root) {
          const parent = node.parentNode!
          path.unshift(Array.prototype.indexOf.call(parent.childNodes, node))
          node = parent
        }
        return path.reduce<Node>((current, index) => current.childNodes[index], clone)
      }
      const clonedRange = document.createRange()
      clonedRange.setStart(counterpart(range.startContainer), range.startOffset)
      clonedRange.setEnd(counterpart(range.endContainer), range.endOffset)
      const wrapper = clone.cloneNode(false) as Element
      wrapper.appendChild(clonedRange.cloneContents())
      container.appendChild(wrapper)
    }
    const success = await writeToClipboard(copyHtml(container), selection.toString())
    return { success, message: success ? 'Selection copied!' : 'Clipboard access failed. Focus the page and try again.' }
  }

  let cancelPicker: (() => void) | undefined
  let notice: HTMLElement | undefined
  function showNotice(message: string) {
    notice?.remove()
    const host = document.createElement('div')
    notice = host
    host.setAttribute('data-plastic-notice', '')
    host.style.cssText = 'all:initial;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none'
    const root = host.attachShadow({ mode: 'open' })
    const text = document.createElement('div')
    text.setAttribute('role', 'status')
    text.style.cssText = 'background:#18181b;color:white;padding:14px 20px;border-radius:12px;font:13px system-ui;box-shadow:0 8px 30px #0003'
    text.textContent = message
    root.appendChild(text)
    document.documentElement.appendChild(host)
    setTimeout(() => { host.remove(); if (notice === host) notice = undefined }, 4000)
  }

  function startPicker() {
    cancelPicker?.()
    notice?.remove()
    notice = undefined
    const host = document.createElement('div')
    host.setAttribute('data-plastic-picker', '')
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `<style>
      * { box-sizing:border-box; }
      .outline { position:fixed; border:2px solid #7c3aed; background:#7c3aed0c; display:none; }
      .label { position:fixed; padding:5px 8px; border-radius:5px; background:#7c3aed; color:white; font:12px system-ui; display:none; }
      .bar { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:16px; white-space:nowrap; padding:14px 18px; border:1px solid #ffffff24; border-radius:14px; background:#18181b; color:#fafafa; font:13px system-ui; box-shadow:0 8px 30px #0003; }
      .brand { font-weight:700; } .hint { color:#d4d4d8; } kbd { font:12px system-ui; background:#ffffff18; padding:3px 5px; border-radius:4px; }
    </style><div class="outline"></div><div class="label"></div><div class="bar" role="status"><span class="brand">Plastic</span><span class="hint">Hover to select · <kbd>↑</kbd> parent <kbd>↓</kbd> child · Click or <kbd>↵</kbd> capture · <kbd>Esc</kbd> cancel</span></div>`
    document.documentElement.appendChild(host)
    const outline = shadow.querySelector<HTMLElement>('.outline')!
    const label = shadow.querySelector<HTMLElement>('.label')!
    let target: Element | null = null
    const children: Element[] = []
    function render() {
      if (!target?.isConnected) { outline.style.display = label.style.display = 'none'; return }
      const rect = target.getBoundingClientRect()
      Object.assign(outline.style, { display: 'block', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
      label.textContent = `${target.tagName.toLowerCase()}${target.id ? '#' + target.id : ''} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`
      Object.assign(label.style, { display:'block', left:`${Math.max(4, Math.min(rect.left, innerWidth - 220))}px`, top:`${Math.max(4, Math.min(rect.top - 30, innerHeight - 28))}px` })
    }
    function select(element: Element) {
      if (element === host || host.contains(element)) return
      target = element
      render()
    }
    const onMove = (event: MouseEvent) => {
      if (event.target instanceof Element) { children.length = 0; select(event.target) }
    }
    function capture() {
      if (!target?.isConnected) return
      const element = target
      cleanup()
      void copyElement(element, true).then(result => showNotice(result.success ? 'HTML captured. Paste into your editor.' : result.message))
        .catch(() => showNotice('Capture failed. Try a smaller element.'))
    }
    const onClick = (event: MouseEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!target && event.target instanceof Element) select(event.target)
      capture()
    }
    const onPointerDown = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation() }
    const onKey = (event: KeyboardEvent) => {
      if (!['Escape', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === 'Escape') { cleanup(); return }
      if (event.key === 'Enter') { capture(); return }
      if (!target) return
      if (event.key === 'ArrowUp' && target.parentElement && target !== document.body) {
        children.push(target)
        select(target.parentElement)
      } else if (event.key === 'ArrowDown') {
        const child = children.pop() ?? Array.from(target.children).find(element => element !== host && element.getBoundingClientRect().width > 0)
        if (child) select(child)
      }
    }
    function cleanup() {
      host.remove()
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', render, true)
      window.removeEventListener('resize', render)
      cancelPicker = undefined
    }
    cancelPicker = cleanup
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', render, true)
    window.addEventListener('resize', render)
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'START_PICKER' || message.action === 'TOGGLE_PICKER') {
      if (message.action === 'TOGGLE_PICKER' && cancelPicker) {
        cancelPicker()
        sendResponse({ success: true, message: 'Capture cancelled.' })
        return
      }
      startPicker()
      sendResponse({ success: true, message: 'Click an element. Press Escape to cancel.' })
      return
    }
    if (message.action !== 'COPY_PAGE' && message.action !== 'COPY_SELECTION') return
    cancelPicker?.()
    notice?.remove()
    const task = message.action === 'COPY_PAGE' ? copyElement(document.body) : copySelection()
    task.then(sendResponse).catch((error: unknown) => sendResponse({ success: false, message: error instanceof Error ? error.message : String(error) }))
    return true
  })
})()
