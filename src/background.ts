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
