// Repeated popup visits must not register duplicate listeners in the isolated world.
(() => {
  const state = globalThis as typeof globalThis & { plasticInstalled?: boolean }
  if (state.plasticInstalled) return
  state.plasticInstalled = true

  type Result = { success: boolean; message: string }
  type OutputFormat = 'css' | 'tailwind'

  const FORMAT_KEY = 'plastic-output-format'
  let outputFormat: OutputFormat = 'css'

  function isOutputFormat(value: unknown): value is OutputFormat {
    return value === 'css' || value === 'tailwind'
  }

  function persistFormat(format: OutputFormat): void {
    outputFormat = format
    try {
      void chrome.storage?.local.set({ [FORMAT_KEY]: format })
    } catch { /* Storage is optional; keep the in-memory format. */ }
  }

  try {
    void chrome.storage?.local.get([FORMAT_KEY]).then(items => {
      const saved = (items as Record<string, unknown>)[FORMAT_KEY]
      if (isOutputFormat(saved)) outputFormat = saved
    }).catch(() => { /* Keep the CSS default. */ })
  } catch { /* Keep the CSS default. */ }

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

  function sanitizeArbitrary(value: string): string {
    return value.trim().replace(/["'\\;]+/g, '').replace(/\s+/g, '_')
  }

  function arbitraryProperty(property: string, value: string): string {
    return `[${property}:${sanitizeArbitrary(value)}]`
  }

  function arbitraryValue(prefix: string, value: string): string {
    return `${prefix}-[${sanitizeArbitrary(value)}]`
  }

  function zeroClass(prefix: string, value: string, zeroClassName: string): string | null {
    if (value === '0' || value === '0px') return zeroClassName
    void prefix
    return null
  }

  // Map one computed longhand to Tailwind utilities. Common visual properties use
  // idiomatic utilities with arbitrary values; everything else falls back to a
  // Tailwind arbitrary property so Tailwind mode never emits inline styles.
  function tailwindClass(property: string, rawValue: string): string {
    const value = rawValue.trim()
    switch (property) {
      case 'display': {
        const known = new Set(['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'table',
          'inline-table', 'table-caption', 'table-cell', 'table-column', 'table-column-group',
          'table-footer-group', 'table-header-group', 'table-row-group', 'table-row',
          'flow-root', 'grid', 'inline-grid', 'contents', 'list-item'])
        if (value === 'none') return 'hidden'
        if (known.has(value)) return value
        return arbitraryProperty(property, value)
      }
      case 'box-sizing': return value === 'border-box' ? 'box-border' : value === 'content-box' ? 'box-content' : arbitraryProperty(property, value)
      case 'position': return ['static', 'fixed', 'absolute', 'relative', 'sticky'].includes(value) ? value : arbitraryProperty(property, value)
      case 'top': case 'right': case 'bottom': case 'left':
        if (value === 'auto') return `${property}-auto`
        return zeroClass(property, value, `${property}-0`) ?? arbitraryValue(property, value)
      case 'z-index':
        if (value === 'auto') return 'z-auto'
        if (['0', '10', '20', '30', '40', '50'].includes(value)) return `z-${value}`
        return arbitraryValue('z', value)
      case 'float':
        if (value === 'left') return 'float-left'
        if (value === 'right') return 'float-right'
        if (value === 'none') return 'float-none'
        if (value === 'inline-start') return 'float-start'
        if (value === 'inline-end') return 'float-end'
        return arbitraryProperty(property, value)
      case 'clear':
        if (['left', 'right', 'both', 'none'].includes(value)) return `clear-${value}`
        if (value === 'inline-start') return 'clear-start'
        if (value === 'inline-end') return 'clear-end'
        return arbitraryProperty(property, value)
      case 'width': case 'height': {
        const prefix = property === 'width' ? 'w' : 'h'
        if (value === 'auto') return `${prefix}-auto`
        if (value === '100%') return `${prefix}-full`
        if (value === '100vw' && prefix === 'w') return 'w-screen'
        if (value === '100vh' && prefix === 'h') return 'h-screen'
        if (value === 'min-content') return `${prefix}-min`
        if (value === 'max-content') return `${prefix}-max`
        if (value === 'fit-content') return `${prefix}-fit`
        return zeroClass(prefix, value, `${prefix}-0`) ?? arbitraryValue(prefix, value)
      }
      case 'min-width':
        if (value === '0' || value === '0px') return 'min-w-0'
        if (value === '100%') return 'min-w-full'
        if (value === 'min-content') return 'min-w-min'
        if (value === 'max-content') return 'min-w-max'
        if (value === 'fit-content') return 'min-w-fit'
        return arbitraryValue('min-w', value)
      case 'min-height':
        if (value === '0' || value === '0px') return 'min-h-0'
        if (value === '100%') return 'min-h-full'
        if (value === '100vh') return 'min-h-screen'
        if (value === 'min-content') return 'min-h-min'
        if (value === 'max-content') return 'min-h-max'
        if (value === 'fit-content') return 'min-h-fit'
        return arbitraryValue('min-h', value)
      case 'max-width':
        if (value === 'none') return 'max-w-none'
        if (value === '100%') return 'max-w-full'
        if (value === 'min-content') return 'max-w-min'
        if (value === 'max-content') return 'max-w-max'
        if (value === 'fit-content') return 'max-w-fit'
        return arbitraryValue('max-w', value)
      case 'max-height':
        if (value === 'none') return 'max-h-none'
        if (value === '100%') return 'max-h-full'
        if (value === '100vh') return 'max-h-screen'
        return arbitraryValue('max-h', value)
      case 'aspect-ratio':
        if (value === 'auto') return 'aspect-auto'
        if (value === '1 / 1' || value === '1/1') return 'aspect-square'
        if (value === '16 / 9' || value === '16/9') return 'aspect-video'
        return arbitraryValue('aspect', value)
      case 'margin-top': case 'margin-right': case 'margin-bottom': case 'margin-left': {
        const short = { 'margin-top': 'mt', 'margin-right': 'mr', 'margin-bottom': 'mb', 'margin-left': 'ml' }[property]!
        if (value === 'auto') return `${short}-auto`
        return zeroClass(short, value, `${short}-0`) ?? arbitraryValue(short, value)
      }
      case 'padding-top': case 'padding-right': case 'padding-bottom': case 'padding-left': {
        const short = { 'padding-top': 'pt', 'padding-right': 'pr', 'padding-bottom': 'pb', 'padding-left': 'pl' }[property]!
        return zeroClass(short, value, `${short}-0`) ?? arbitraryValue(short, value)
      }
      case 'overflow-x': case 'overflow-y': {
        const axis = property === 'overflow-x' ? 'overflow-x' : 'overflow-y'
        if (['auto', 'hidden', 'visible', 'scroll', 'clip'].includes(value)) return `${axis}-${value}`
        return arbitraryProperty(property, value)
      }
      case 'flex-direction':
        if (value === 'row') return 'flex-row'
        if (value === 'row-reverse') return 'flex-row-reverse'
        if (value === 'column') return 'flex-col'
        if (value === 'column-reverse') return 'flex-col-reverse'
        return arbitraryProperty(property, value)
      case 'flex-wrap':
        if (value === 'wrap') return 'flex-wrap'
        if (value === 'nowrap') return 'flex-nowrap'
        if (value === 'wrap-reverse') return 'flex-wrap-reverse'
        return arbitraryProperty(property, value)
      case 'flex-grow':
        if (value === '0') return 'grow-0'
        if (value === '1') return 'grow'
        return arbitraryValue('grow', value)
      case 'flex-shrink':
        if (value === '1') return 'shrink'
        if (value === '0') return 'shrink-0'
        return arbitraryValue('shrink', value)
      case 'flex-basis':
        if (value === 'auto') return 'basis-auto'
        if (value === '100%') return 'basis-full'
        return arbitraryValue('basis', value)
      case 'order': {
        if (value === '-9999') return 'order-first'
        if (value === '9999') return 'order-last'
        if (value === '0') return 'order-none'
        const numeric = Number(value)
        if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return `order-${numeric}`
        return arbitraryValue('order', value)
      }
      case 'justify-content': {
        const map: Record<string, string> = { 'flex-start': 'justify-start', start: 'justify-start', 'flex-end': 'justify-end', end: 'justify-end', center: 'justify-center', 'space-between': 'justify-between', 'space-around': 'justify-around', 'space-evenly': 'justify-evenly', stretch: 'justify-stretch', normal: 'justify-normal' }
        return map[value] ?? arbitraryProperty(property, value)
      }
      case 'align-items': {
        const map: Record<string, string> = { 'flex-start': 'items-start', start: 'items-start', 'flex-end': 'items-end', end: 'items-end', center: 'items-center', baseline: 'items-baseline', stretch: 'items-stretch' }
        return map[value] ?? arbitraryProperty(property, value)
      }
      case 'align-content': {
        const map: Record<string, string> = { 'flex-start': 'content-start', start: 'content-start', 'flex-end': 'content-end', end: 'content-end', center: 'content-center', 'space-between': 'content-between', 'space-around': 'content-around', 'space-evenly': 'content-evenly', stretch: 'content-stretch', normal: 'content-normal', baseline: 'content-baseline' }
        return map[value] ?? arbitraryProperty(property, value)
      }
      case 'align-self': {
        const map: Record<string, string> = { auto: 'self-auto', 'flex-start': 'self-start', start: 'self-start', 'flex-end': 'self-end', end: 'self-end', center: 'self-center', stretch: 'self-stretch', baseline: 'self-baseline' }
        return map[value] ?? arbitraryProperty(property, value)
      }
      case 'justify-items': {
        const map: Record<string, string> = { start: 'justify-items-start', end: 'justify-items-end', center: 'justify-items-center', stretch: 'justify-items-stretch' }
        return map[value] ?? arbitraryProperty(property, value)
      }
      case 'justify-self': {
        const map: Record<string, string> = { auto: 'justify-self-auto', start: 'justify-self-start', end: 'justify-self-end', center: 'justify-self-center', stretch: 'justify-self-stretch' }
        return map[value] ?? arbitraryProperty(property, value)
      }
      case 'grid-template-columns': return value === 'none' ? 'grid-cols-none' : arbitraryValue('grid-cols', value)
      case 'grid-template-rows': return value === 'none' ? 'grid-rows-none' : arbitraryValue('grid-rows', value)
      case 'grid-auto-flow': {
        if (value === 'row') return 'grid-flow-row'
        if (value === 'column') return 'grid-flow-col'
        if (value === 'dense') return 'grid-flow-dense'
        if (value === 'row dense') return 'grid-flow-row-dense'
        if (value === 'column dense') return 'grid-flow-col-dense'
        return arbitraryProperty(property, value)
      }
      case 'grid-auto-columns': return value === 'auto' ? 'auto-cols-auto' : arbitraryValue('auto-cols', value)
      case 'grid-auto-rows': return value === 'auto' ? 'auto-rows-auto' : arbitraryValue('auto-rows', value)
      case 'grid-column-start': return value === 'auto' ? 'col-start-auto' : arbitraryValue('col-start', value)
      case 'grid-column-end': return value === 'auto' ? 'col-end-auto' : arbitraryValue('col-end', value)
      case 'grid-row-start': return value === 'auto' ? 'row-start-auto' : arbitraryValue('row-start', value)
      case 'grid-row-end': return value === 'auto' ? 'row-end-auto' : arbitraryValue('row-end', value)
      case 'row-gap': return zeroClass('gap-y', value, 'gap-y-0') ?? arbitraryValue('gap-y', value)
      case 'column-gap': return zeroClass('gap-x', value, 'gap-x-0') ?? arbitraryValue('gap-x', value)
      case 'color': return arbitraryValue('text', value)
      case 'font-family': return arbitraryProperty(property, value)
      case 'font-size': return arbitraryValue('text', value)
      case 'font-weight': {
        const map: Record<string, string> = { '100': 'font-thin', '200': 'font-extralight', '300': 'font-light', '400': 'font-normal', normal: 'font-normal', '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold', bold: 'font-bold', '800': 'font-extrabold', '900': 'font-black' }
        return map[value] ?? arbitraryValue('font', value)
      }
      case 'font-style':
        if (value === 'italic') return 'italic'
        if (value === 'normal') return 'not-italic'
        return arbitraryProperty(property, value)
      case 'line-height':
        if (value === 'normal') return 'leading-normal'
        return arbitraryValue('leading', value)
      case 'letter-spacing':
        if (value === 'normal') return 'tracking-normal'
        return arbitraryValue('tracking', value)
      case 'word-spacing': return arbitraryProperty(property, value)
      case 'text-align':
        if (['left', 'center', 'right', 'justify', 'start', 'end'].includes(value)) return `text-${value}`
        return arbitraryProperty(property, value)
      case 'text-transform':
        if (value === 'none') return 'normal-case'
        if (['uppercase', 'lowercase', 'capitalize'].includes(value)) return value
        return arbitraryProperty(property, value)
      case 'text-indent': return arbitraryValue('indent', value)
      case 'white-space': {
        const map: Record<string, string> = { normal: 'whitespace-normal', nowrap: 'whitespace-nowrap', pre: 'whitespace-pre', 'pre-line': 'whitespace-pre-line', 'pre-wrap': 'whitespace-pre-wrap', 'break-spaces': 'whitespace-break-spaces' }
        return map[value] ?? arbitraryProperty(property, value)
      }
      case 'word-break':
        if (value === 'normal') return 'break-normal'
        if (value === 'break-all') return 'break-all'
        if (value === 'keep-all') return 'break-keep'
        return arbitraryProperty(property, value)
      case 'overflow-wrap':
        if (value === 'normal') return 'break-normal'
        if (value === 'break-word') return 'break-words'
        return arbitraryProperty(property, value)
      case 'text-overflow':
        if (value === 'ellipsis') return 'text-ellipsis'
        if (value === 'clip') return 'text-clip'
        return arbitraryProperty(property, value)
      case 'vertical-align': {
        const map: Record<string, string> = { baseline: 'align-baseline', top: 'align-top', middle: 'align-middle', bottom: 'align-bottom', 'text-top': 'align-text-top', 'text-bottom': 'align-text-bottom', sub: 'align-sub', super: 'align-super' }
        return map[value] ?? arbitraryValue('align', value)
      }
      case 'direction': case 'writing-mode': case 'font-stretch': case 'font-variant':
      case 'font-feature-settings': case 'font-variation-settings': case 'text-shadow':
        return arbitraryProperty(property, value)
      case 'text-decoration-line': {
        if (value === 'none') return 'no-underline'
        const parts = value.split(/\s+/).map(part => {
          if (part === 'underline') return 'underline'
          if (part === 'line-through') return 'line-through'
          if (part === 'overline') return 'overline'
          return arbitraryProperty('text-decoration-line', part)
        })
        return parts.join(' ')
      }
      case 'text-decoration-style':
        if (['solid', 'double', 'dotted', 'dashed', 'wavy'].includes(value)) return `decoration-${value}`
        return arbitraryProperty(property, value)
      case 'text-decoration-color': return arbitraryValue('decoration', value)
      case 'text-decoration-thickness':
        if (value === 'auto' || value === 'from-font') return arbitraryProperty(property, value)
        return arbitraryValue('decoration', value)
      case 'text-underline-offset':
        if (value === 'auto') return 'underline-offset-auto'
        return arbitraryValue('underline-offset', value)
      case 'background-color': return arbitraryValue('bg', value)
      case 'background-image':
        if (value === 'none') return 'bg-none'
        return arbitraryProperty(property, value)
      case 'background-position': {
        const map: Record<string, string> = { '0% 0%': 'bg-left-top', '100% 0%': 'bg-right-top', '0% 100%': 'bg-left-bottom', '100% 100%': 'bg-right-bottom', '50% 50%': 'bg-center', '0% 50%': 'bg-left', '100% 50%': 'bg-right', '50% 0%': 'bg-top', '50% 100%': 'bg-bottom' }
        const normalized = value.replace(/\s+/g, ' ')
        return map[normalized] ?? arbitraryProperty(property, value)
      }
      case 'background-size':
        if (value === 'auto') return 'bg-auto'
        if (value === 'cover') return 'bg-cover'
        if (value === 'contain') return 'bg-contain'
        return arbitraryProperty(property, value)
      case 'background-repeat': {
        const map: Record<string, string> = { repeat: 'bg-repeat', 'no-repeat': 'bg-no-repeat', 'repeat-x': 'bg-repeat-x', 'repeat-y': 'bg-repeat-y', round: 'bg-repeat-round', space: 'bg-repeat-space' }
        return map[value] ?? arbitraryProperty(property, value)
      }
      case 'background-origin': {
        if (value === 'border-box') return 'bg-origin-border'
        if (value === 'padding-box') return 'bg-origin-padding'
        if (value === 'content-box') return 'bg-origin-content'
        return arbitraryProperty(property, value)
      }
      case 'background-clip': {
        if (value === 'border-box') return 'bg-clip-border'
        if (value === 'padding-box') return 'bg-clip-padding'
        if (value === 'content-box') return 'bg-clip-content'
        if (value === 'text') return 'bg-clip-text'
        return arbitraryProperty(property, value)
      }
      case 'background-attachment':
        if (['fixed', 'local', 'scroll'].includes(value)) return `bg-${value}`
        return arbitraryProperty(property, value)
      case 'border-top-width': case 'border-right-width': case 'border-bottom-width': case 'border-left-width': {
        const short = { 'border-top-width': 'border-t', 'border-right-width': 'border-r', 'border-bottom-width': 'border-b', 'border-left-width': 'border-l' }[property]!
        return zeroClass(short, value, `${short}-0`) ?? arbitraryValue(short, value)
      }
      case 'border-top-style': case 'border-right-style': case 'border-bottom-style': case 'border-left-style':
      case 'border-top-color': case 'border-right-color': case 'border-bottom-color': case 'border-left-color':
        return arbitraryProperty(property, value)
      case 'border-top-left-radius': case 'border-top-right-radius': case 'border-bottom-right-radius': case 'border-bottom-left-radius': {
        const short = { 'border-top-left-radius': 'rounded-tl', 'border-top-right-radius': 'rounded-tr', 'border-bottom-right-radius': 'rounded-br', 'border-bottom-left-radius': 'rounded-bl' }[property]!
        return zeroClass(short, value, `${short}-none`) ?? arbitraryValue(short, value)
      }
      case 'outline-width': case 'outline-style': case 'outline-color': case 'outline-offset':
        return arbitraryProperty(property, value)
      case 'box-shadow':
        if (value === 'none') return 'shadow-none'
        return arbitraryValue('shadow', value)
      case 'opacity': return arbitraryValue('opacity', value)
      case 'visibility':
        if (value === 'hidden') return 'invisible'
        if (value === 'collapse') return 'collapse'
        return arbitraryProperty(property, value)
      case 'object-fit':
        if (['contain', 'cover', 'fill', 'none', 'scale-down'].includes(value)) return `object-${value}`
        return arbitraryProperty(property, value)
      case 'object-position': {
        const map: Record<string, string> = { '50% 50%': 'object-center', '50% 0%': 'object-top', '50% 100%': 'object-bottom', '0% 50%': 'object-left', '100% 50%': 'object-right', '0% 0%': 'object-left-top', '100% 0%': 'object-right-top', '0% 100%': 'object-left-bottom', '100% 100%': 'object-right-bottom' }
        return map[value.replace(/\s+/g, ' ')] ?? arbitraryValue('object', value)
      }
      case 'list-style-type':
        if (value === 'none') return 'list-none'
        if (value === 'disc') return 'list-disc'
        if (value === 'decimal') return 'list-decimal'
        return arbitraryProperty(property, value)
      case 'list-style-position':
        if (value === 'inside' || value === 'outside') return `list-${value}`
        return arbitraryProperty(property, value)
      case 'border-collapse':
        if (value === 'collapse') return 'border-collapse'
        if (value === 'separate') return 'border-separate'
        return arbitraryProperty(property, value)
      case 'table-layout':
        if (value === 'auto' || value === 'fixed') return `table-${value}`
        return arbitraryProperty(property, value)
      case 'caption-side':
        if (value === 'top' || value === 'bottom') return `caption-${value}`
        return arbitraryProperty(property, value)
      case 'empty-cells':
        if (value === 'show') return 'empty-cells-show'
        if (value === 'hide') return 'empty-cells-hide'
        return arbitraryProperty(property, value)
      case 'fill': return value === 'none' ? 'fill-none' : arbitraryValue('fill', value)
      case 'stroke': return value === 'none' ? 'stroke-none' : arbitraryValue('stroke', value)
      default: return arbitraryProperty(property, value)
    }
  }

  function convertInlineStylesToTailwind(root: Element): void {
    const elements = [root, ...Array.from(root.querySelectorAll('*'))]
    for (const element of elements) {
      const style = (element as HTMLElement).style
      if (!style || style.length === 0) continue
      const properties: string[] = []
      for (let i = 0; i < style.length; i++) {
        const property = style.item(i)
        if (property) properties.push(property)
      }
      const classes: string[] = []
      for (const property of properties) {
        const value = style.getPropertyValue(property)
        if (!value) continue
        classes.push(tailwindClass(property, value))
        style.removeProperty(property)
      }
      if (classes.length > 0) {
        const existing = element.getAttribute('class')
        element.setAttribute('class', existing ? `${existing} ${classes.join(' ')}` : classes.join(' '))
      }
      element.removeAttribute('style')
    }
  }

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

  function cloneWithFormat(element: Element, format: OutputFormat): Element {
    const clone = cloneWithComputedStyles(element)
    if (format === 'tailwind') convertInlineStylesToTailwind(clone)
    return clone
  }

  async function copyElement(element: Element, asSource = false, format: OutputFormat = outputFormat): Promise<Result> {
    const html = copyHtml(cloneWithFormat(element, format))
    const success = await writeToClipboard(html, asSource ? html :
      element instanceof HTMLElement ? element.innerText : element.textContent ?? '')
    const label = format === 'tailwind' ? 'Copied with Tailwind classes!' : 'Copied with styles!'
    return { success, message: success ? label : 'Clipboard access failed. Focus the page and try again.' }
  }

  async function copySelection(format: OutputFormat = outputFormat): Promise<Result> {
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount || !selection.toString().trim()) {
      return { success: false, message: 'Nothing selected! Select text on the page first.' }
    }
    const container = document.createElement('div')
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i)
      const ancestor = range.commonAncestorContainer
      const root = ancestor instanceof Element ? ancestor : ancestor.parentElement!
      const clone = cloneWithFormat(root, format)
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
      .bar { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:12px; white-space:nowrap; padding:12px 16px; border:1px solid #ffffff24; border-radius:14px; background:#18181b; color:#fafafa; font:13px system-ui; box-shadow:0 8px 30px #0003; pointer-events:none; }
      .toggle { pointer-events:auto; }
      .brand { font-weight:700; } .hint { color:#d4d4d8; } kbd { font:12px system-ui; background:#ffffff18; padding:3px 5px; border-radius:4px; }
      .toggle { display:flex; background:#ffffff18; border-radius:8px; padding:2px; gap:2px; }
      .toggle button { border:0; border-radius:6px; padding:5px 10px; font:12px system-ui; font-weight:600; cursor:pointer; background:transparent; color:#d4d4d8; }
      .toggle button[aria-pressed="true"] { background:#7c3aed; color:white; }
    </style><div class="outline"></div><div class="label"></div><div class="bar" role="status"><span class="brand">Plastic</span><span class="hint">Hover to select · <kbd>↑</kbd> parent <kbd>↓</kbd> child · Click or <kbd>↵</kbd> capture · <kbd>Esc</kbd> cancel</span><span class="toggle" role="group" aria-label="Output style"><button type="button" data-format="css">CSS</button><button type="button" data-format="tailwind">Tailwind</button></span></div>`
    document.documentElement.appendChild(host)
    const outline = shadow.querySelector<HTMLElement>('.outline')!
    const label = shadow.querySelector<HTMLElement>('.label')!
    const formatButtons = Array.from(shadow.querySelectorAll<HTMLButtonElement>('.toggle button'))
    function paintFormatButtons() {
      for (const button of formatButtons) {
        button.setAttribute('aria-pressed', String(button.dataset.format === outputFormat))
      }
    }
    paintFormatButtons()
    for (const button of formatButtons) {
      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        const next = button.dataset.format
        if (isOutputFormat(next)) {
          persistFormat(next)
          paintFormatButtons()
        }
      })
    }
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
      // Let Output-style toggle clicks reach the picker bar buttons.
      if (event.target === host) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!target && event.target instanceof Element) select(event.target)
      capture()
    }
    const onPointerDown = (event: Event) => {
      if (event.target === host) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
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
    if (isOutputFormat((message as { format?: unknown }).format)) {
      persistFormat((message as { format: OutputFormat }).format)
    }
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
    if (message.action === 'GET_FORMAT') {
      sendResponse({ success: true, format: outputFormat })
      return
    }
    if (message.action !== 'COPY_PAGE' && message.action !== 'COPY_SELECTION') return
    cancelPicker?.()
    notice?.remove()
    const format = isOutputFormat((message as { format?: unknown }).format)
      ? (message as { format: OutputFormat }).format
      : outputFormat
    persistFormat(format)
    const task = message.action === 'COPY_PAGE' ? copyElement(document.body, false, format) : copySelection(format)
    task.then(sendResponse).catch((error: unknown) => sendResponse({ success: false, message: error instanceof Error ? error.message : String(error) }))
    return true
  })
})()
