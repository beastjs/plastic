document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status') as HTMLDivElement
  const buttons = Array.from(document.querySelectorAll('button'))
  const FORMAT_KEY = 'plastic-output-format'
  type OutputFormat = 'css' | 'tailwind'
  let outputFormat: OutputFormat = 'css'

  function isOutputFormat(value: unknown): value is OutputFormat {
    return value === 'css' || value === 'tailwind'
  }

  function paintFormat() {
    for (const input of document.querySelectorAll<HTMLInputElement>('input[name="plastic-format"]')) {
      input.checked = input.value === outputFormat
    }
  }

  async function loadFormat() {
    try {
      const items = await chrome.storage?.local.get([FORMAT_KEY])
      const saved = (items as Record<string, unknown> | undefined)?.[FORMAT_KEY]
      if (isOutputFormat(saved)) outputFormat = saved
    } catch { /* Keep the CSS default. */ }
    paintFormat()
  }

  async function saveFormat(format: OutputFormat) {
    outputFormat = format
    paintFormat()
    try {
      await chrome.storage?.local.set({ [FORMAT_KEY]: format })
    } catch { /* Selection still applies to this popup session. */ }
  }

  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="plastic-format"]')) {
    input.addEventListener('change', () => {
      if (input.checked && isOutputFormat(input.value)) void saveFormat(input.value)
    })
  }

  async function sendCommand(action: string) {
    buttons.forEach(button => { button.disabled = true })
    statusDiv.textContent = 'Working…'
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id === undefined) throw new Error('No active tab found.')
      // Inject on demand: activeTab grants access only after the user opens Plastic.
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      const response = await chrome.tabs.sendMessage(tab.id, { action, format: outputFormat })
      if (!response) throw new Error('The page did not respond. Reload it and try again.')
      statusDiv.textContent = response.message
      if (action === 'START_PICKER' && response.success) window.close()
    } catch (error) {
      statusDiv.textContent = `Cannot copy this page. Open a regular webpage and try again. ${error instanceof Error ? error.message : String(error)}`
    } finally {
      buttons.forEach(button => { button.disabled = false })
    }
  }

  document.getElementById('copy-page')?.addEventListener('click', () => void sendCommand('COPY_PAGE'))
  document.getElementById('copy-selection')?.addEventListener('click', () => void sendCommand('COPY_SELECTION'))
  document.getElementById('pick-element')?.addEventListener('click', () => void sendCommand('START_PICKER'))
  void loadFormat()
})
