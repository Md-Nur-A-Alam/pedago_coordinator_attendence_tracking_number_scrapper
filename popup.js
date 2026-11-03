const statusEl = document.getElementById('status');
const say = (t, err) => { statusEl.textContent = t; statusEl.className = err ? 'err' : ''; };
const openDashboard = () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });

function send(tabId) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type: 'SCRAPE' }, resp => {
      resolve(chrome.runtime.lastError ? null : resp);
    });
  });
}

document.getElementById('scrape').addEventListener('click', async () => {
  say('Scraping…');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/student\.pedagoacademy\.com\/local\/zoomattendance\/report\.php/.test(tab.url || '')) {
    return say('Open the attendance report page first.', true);
  }
  let resp = await send(tab.id);
  if (!resp) {
    // page was open before the extension was installed/reloaded: inject manually
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      resp = await send(tab.id);
    } catch (e) { /* fall through */ }
  }
  if (!resp || !resp.ok) return say((resp && resp.error) || 'Could not scrape. Reload the page and try again.', true);
  await chrome.storage.local.set({ scrape: resp.data });
  say(`Got ${resp.data.rows.length} rows from ${resp.data.pages} page(s).`);
  openDashboard();
});

document.getElementById('open').addEventListener('click', openDashboard);
