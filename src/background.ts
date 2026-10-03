chrome.action.onClicked.addListener(async tab => {
  if (tab.id === undefined) return
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_PICKER' })
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' })
    await chrome.action.setTitle({ tabId: tab.id, title: 'Plastic — capture an element' })
  } catch {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' })
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#b42318' })
    await chrome.action.setTitle({ tabId: tab.id, title: 'Plastic cannot access this page. Open a regular webpage and try again.' })
  }
})

const CONVERTER_URL = 'https://beast-converter.beastjs.workers.dev/api/converter'
const MAX_CONVERTER_BODY_BYTES = 512 * 1024

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const request = message as { action?: unknown; html?: unknown; format?: unknown }
  if (request?.action !== 'CONVERT_ELEMENT') return
  const format = request.format
  if (typeof request.html !== 'string' || (format !== 'btsx' && format !== 'tsrx')) {
    sendResponse({ success: false, message: 'Invalid conversion request.' })
    return
  }
  void (async () => {
    try {
      const body = JSON.stringify({ code: request.html, outputs: [format] })
      const bodyBytes = new TextEncoder().encode(body).byteLength
      const sizeError = `Conversion request is ${bodyBytes.toLocaleString()} bytes; the Beast converter limit is 524,288 bytes (512 KiB). Select a smaller element or copy as HTML.`
      if (bodyBytes > MAX_CONVERTER_BODY_BYTES) throw new Error(sizeError)
      for (let attempt = 0; attempt < 2; attempt++) {
        let response: Response
        let responseText: string
        let phase = 'request'
        try {
          response = await fetch(CONVERTER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
          })
          phase = 'response'
          responseText = await response.text()
        } catch (error) {
          if (attempt === 0) continue
          const detail = error instanceof Error ? error.message : String(error)
          throw new Error(`Converter ${phase === 'request' ? 'connection failed' : 'response was interrupted'} twice (${bodyBytes.toLocaleString()} request bytes): ${detail}. Try a smaller element.`)
        }
        if (response.status === 413) throw new Error(sizeError)
        if (response.status === 404) throw new Error('Beast converter API not found (HTTP 404). Check the service URL.')
        let data: unknown
        try {
          data = JSON.parse(responseText)
        } catch {
          if (attempt === 0 && (response.ok || response.status >= 500 || response.status === 429)) continue
          const receivedBytes = new TextEncoder().encode(responseText).byteLength
          throw new Error(`Beast converter returned ${responseText ? 'incomplete or invalid JSON' : 'an empty response'} (HTTP ${response.status}, ${receivedBytes.toLocaleString()} bytes)${attempt ? ' after retry' : ''}. Try again or copy a smaller element.`)
        }
        if (!response.ok) {
          const error = data && typeof data === 'object' && 'error' in data ? String(data.error) : `HTTP ${response.status}`
          throw new Error(`Conversion failed: ${error}`)
        }
        if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
          const compilation = 'compilation' in data ? data.compilation : undefined
          const stages = compilation && typeof compilation === 'object' ? compilation as Record<string, unknown> : {}
          const failed = [stages.beast, stages.octane].find(stage => stage && typeof stage === 'object' && 'ok' in stage && stage.ok === false)
          const detail = failed && typeof failed === 'object' && 'error' in failed ? String(failed.error) : 'The service could not validate this code.'
          throw new Error(`Conversion failed: ${detail} Try a smaller element.`)
        }
        const outputs = data && typeof data === 'object' && 'outputs' in data ? data.outputs : undefined
        const selected = outputs && typeof outputs === 'object' && format in outputs
          ? (outputs as Record<string, unknown>)[format]
          : undefined
        const code = selected && typeof selected === 'object' && 'code' in selected ? selected.code : undefined
        if (typeof code !== 'string' || !code.trim()) throw new Error('Converter returned no code.')
        sendResponse({ success: true, code })
        return
      }
    } catch (error) {
      sendResponse({ success: false, message: error instanceof Error ? error.message : String(error) })
    }
  })()
  return true
})
