document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status') as HTMLDivElement
  const buttons = Array.from(document.querySelectorAll('button'))

  async function sendCommand(action: string) {
    buttons.forEach(button => { button.disabled = true })
    statusDiv.textContent = 'Working…'
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id === undefined) throw new Error('No active tab found.')
      // Inject on demand: activeTab grants access only after the user opens Plastic.
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      const response = await chrome.tabs.sendMessage(tab.id, { action })
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
})
