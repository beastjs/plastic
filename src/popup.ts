document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status') as HTMLDivElement
  const buttons = Array.from(document.querySelectorAll('button'))
  const FORMAT_KEY = 'plastic-output-format'
  const MODE_KEY = 'plastic-copy-mode'
  const STYLE_KEY = 'plastic-style-format'
  const CODE_KEY = 'plastic-code-format'
  type CopyMode = 'html' | 'code'
  type StyleFormat = 'css' | 'tailwind'
  type CodeFormat = 'btsx' | 'tsrx'
  let copyMode: CopyMode = 'html'
  let styleFormat: StyleFormat = 'css'
  let codeFormat: CodeFormat = 'btsx'

  const isCopyMode = (value: unknown): value is CopyMode => value === 'html' || value === 'code'
  const isStyleFormat = (value: unknown): value is StyleFormat => value === 'css' || value === 'tailwind'
  const isCodeFormat = (value: unknown): value is CodeFormat => value === 'btsx' || value === 'tsrx'

  function paintPreferences() {
    for (const input of document.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
      input.checked = input.value === (input.name === 'plastic-mode' ? copyMode :
        input.name === 'plastic-style' ? styleFormat : codeFormat)
    }
  }

  async function loadPreferences() {
    try {
      const items = await chrome.storage.local.get([FORMAT_KEY, MODE_KEY, STYLE_KEY, CODE_KEY]) as Record<string, unknown>
      const legacy = items?.[FORMAT_KEY]
      if (isStyleFormat(legacy)) styleFormat = legacy
      if (isCodeFormat(legacy)) { codeFormat = legacy; copyMode = 'code' }
      if (isCopyMode(items?.[MODE_KEY])) copyMode = items[MODE_KEY]
      if (isStyleFormat(items?.[STYLE_KEY])) styleFormat = items[STYLE_KEY]
      if (isCodeFormat(items?.[CODE_KEY])) codeFormat = items[CODE_KEY]
    } catch { /* Keep the CSS default. */ }
    paintPreferences()
  }

  async function savePreference(key: string, value: CopyMode | StyleFormat | CodeFormat) {
    if (key === MODE_KEY && isCopyMode(value)) copyMode = value
    if (key === STYLE_KEY && isStyleFormat(value)) styleFormat = value
    if (key === CODE_KEY && isCodeFormat(value)) codeFormat = value
    paintPreferences()
    try {
      await chrome.storage?.local.set({ [key]: value })
    } catch { /* Selection still applies to this popup session. */ }
  }

  for (const input of document.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    input.addEventListener('change', () => {
      if (!input.checked) return
      if (input.name === 'plastic-mode' && isCopyMode(input.value)) void savePreference(MODE_KEY, input.value)
      if (input.name === 'plastic-style' && isStyleFormat(input.value)) void savePreference(STYLE_KEY, input.value)
      if (input.name === 'plastic-code' && isCodeFormat(input.value)) void savePreference(CODE_KEY, input.value)
    })
  }

  async function sendCommand(action: string) {
    buttons.forEach(button => { button.disabled = true })
    statusDiv.textContent = 'Working…'
    statusDiv.classList.add('working')
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id === undefined) throw new Error('No active tab found.')
      // Inject on demand: activeTab grants access only after the user opens Plastic.
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      const response = await chrome.tabs.sendMessage(tab.id, { action, copyMode, styleFormat, codeFormat })
      if (!response) throw new Error('The page did not respond. Reload it and try again.')
      statusDiv.textContent = response.message
      if (action === 'START_PICKER' && response.success) window.close()
    } catch (error) {
      statusDiv.textContent = `Cannot copy this page. Open a regular webpage and try again. ${error instanceof Error ? error.message : String(error)}`
    } finally {
      statusDiv.classList.remove('working')
      buttons.forEach(button => { button.disabled = false })
    }
  }

  document.getElementById('copy-page')?.addEventListener('click', () => void sendCommand('COPY_PAGE'))
  document.getElementById('copy-selection')?.addEventListener('click', () => void sendCommand('COPY_SELECTION'))
  document.getElementById('pick-element')?.addEventListener('click', () => void sendCommand('START_PICKER'))
  void loadPreferences()
})
