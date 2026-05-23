const btn        = document.getElementById('toggleBtn');
const dot        = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const logoIcon   = document.getElementById('logoIcon');

let isActive = false;

function setUI(active) {
  isActive = active;
  dot.classList.toggle('active', active);
  logoIcon.classList.toggle('active', active);
  statusText.textContent = active ? 'Active' : 'Inactive';
  btn.textContent = active ? 'Deactivate PixelPull' : 'Activate PixelPull';
  btn.classList.toggle('active', active);
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  chrome.tabs.sendMessage(tabs[0].id, { action: 'getState' }, (res) => {
    if (chrome.runtime.lastError || !res) return; 
    setUI(res.active);
  });
});

btn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle' }, (res) => {
      if (chrome.runtime.lastError) {
        
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content.js']
        }, () => {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'activate' });
          setUI(true);
        });
        return;
      }
      
      setUI(res?.active ?? !isActive);
    });
  });
});