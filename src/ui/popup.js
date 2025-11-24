function formatTime(ts) {
  if (!ts) return '—';
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'менее минуты назад';
  return diffMin + ' мин назад';
}
function loadData() {
  chrome.storage.sync.get({ microservices: [] }, syncData => {
    chrome.storage.local.get({ tokenData: {} }, localData => {
      const servicesDiv = document.getElementById('services');
      servicesDiv.innerHTML = '';
      const active = syncData.microservices.filter(m => m.active);
      if (!active.length) { servicesDiv.innerHTML = '<div class="small">Нет активных микросервисов</div>'; return; }
      active.forEach(ms => {
        const tokenInfo = localData.tokenData[ms.baseUrl];
        const el = document.createElement('div');
        el.className = 'service-item fade-in ' + (tokenInfo ? 'active' : '');
        el.innerHTML = `\n          <div>\n            <div class="service-name">${ms.name || ms.baseUrl}</div>\n            <div class="service-time">Обновлено: ${formatTime(tokenInfo && tokenInfo.fetchedAt)}</div>\n          </div>\n          <div class="badge ${tokenInfo ? '' : 'inactive'}">${tokenInfo ? 'TOKEN' : '—'}</div>\n        `;
        servicesDiv.appendChild(el);
      });
    });
  });
}
function manualRefresh() {
  const status = document.getElementById('status');
  const icon = document.getElementById('refreshIcon');
  const text = document.getElementById('refreshText');
  icon.style.display = 'inline-block'; text.textContent = '...'; status.className = 'status-bar'; status.innerHTML = '<span class="dot"></span> Обновление токена';
  chrome.runtime.sendMessage({ type: 'MANUAL_REFRESH' }, resp => {
    if (resp && resp.ok) { status.className = 'status-bar success'; status.innerHTML = '<span class="dot"></span> Токен обновлён'; setTimeout(() => { status.innerHTML=''; }, 1800); loadData(); }
    else { status.className = 'status-bar error'; status.innerHTML = '<span class="dot"></span> Ошибка обновления'; setTimeout(() => { status.innerHTML=''; }, 2500); }
    icon.style.display = 'none'; text.textContent = 'Обновить';
  });
}
function loadUpdateInfo() {
  chrome.runtime.sendMessage({ type: 'GET_UPDATE_STATUS' }, info => {
    const box = document.getElementById('updateInfo');
    const verBox = document.getElementById('versionInfo');
    if (!info) { box.innerHTML=''; return; }
    verBox.textContent = `Версия: ${info.localVersion}`;
    if (info.remoteVersion && info.remoteVersion !== info.localVersion) {
      box.innerHTML = `<span style="color:#34d399;">Новая версия ${info.remoteVersion} (текущая ${info.localVersion}) <button id="openUpdate" class="button secondary" style="padding:2px 8px; font-size:11px;">GitHub</button></span>`;
      const openBtn = document.getElementById('openUpdate');
      openBtn.addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'OPEN_UPDATE_PAGE' }); });
    } else {
      box.textContent = 'Обновлений нет';
    }
  });
}
window.addEventListener('DOMContentLoaded', () => {
  loadData();
  loadUpdateInfo();
  document.getElementById('refreshBtn').addEventListener('click', manualRefresh);
  document.getElementById('optionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  const checkBtn = document.getElementById('checkUpdateBtn');
  const originalHTML = checkBtn.innerHTML;
  checkBtn.addEventListener('click', () => {
    checkBtn.disabled = true;
    checkBtn.innerHTML = '<span class="spinner" style="width:14px; height:14px; border-width:2px;"></span>';
    chrome.runtime.sendMessage({ type: 'MANUAL_UPDATE_CHECK' }, () => {
      setTimeout(() => {
        loadUpdateInfo();
        checkBtn.disabled = false;
        checkBtn.innerHTML = originalHTML;
      }, 600);
    });
  });
});