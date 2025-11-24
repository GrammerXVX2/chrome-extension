function load() {
  chrome.storage.sync.get({
    authEndpoint: '',
    basicHeader: '',
    basicUser: '',
    basicPass: '',
    intervalMinutes: 9,
    microservices: []
  }, data => {
    if (!data.basicHeader && data.basicUser && data.basicPass) {
      data.basicHeader = 'Basic ' + btoa(`${data.basicUser}:${data.basicPass}`);
    }
    document.getElementById('authEndpoint').value = data.authEndpoint;
    document.getElementById('basicHeader').value = data.basicHeader;
    document.getElementById('intervalMinutes').value = data.intervalMinutes;
    renderMicroservices(data.microservices);
  });
}
function renderMicroservices(list) {
  const container = document.getElementById('microservices');
  container.innerHTML = '';
  list.forEach(ms => {
    const row = document.createElement('div');
    row.className = 'microservice-row fade-in';
    const toggleWrap = document.createElement('label');
    toggleWrap.className = 'toggle';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!ms.active;
    const span = document.createElement('span');
    toggleWrap.appendChild(chk); toggleWrap.appendChild(span);
    const nameInput = document.createElement('input');
    nameInput.type = 'text'; nameInput.value = ms.name || ''; nameInput.placeholder = 'Имя';
    const txt = document.createElement('input');
    txt.type = 'text'; txt.value = ms.baseUrl || ''; txt.placeholder = 'https://service.example.com/swagger';
    const delBtn = document.createElement('button');
    delBtn.className = 'button icon flat';
    delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    delBtn.addEventListener('click', () => { row.remove(); });
    let pingTimer = null;
    function scheduleDiscover() {
      clearTimeout(pingTimer);
      pingTimer = setTimeout(() => {
        if (!txt.value.trim()) return;
        if (nameInput.value.trim()) return;
        discoverServiceName(txt.value.trim()).then(found => { if (found && !nameInput.value.trim()) nameInput.value = found; });
      }, 600);
    }
    txt.addEventListener('input', scheduleDiscover);
    txt.addEventListener('blur', scheduleDiscover);
    if (txt.value && !nameInput.value) scheduleDiscover();
    row.appendChild(toggleWrap); row.appendChild(nameInput); row.appendChild(txt); row.appendChild(delBtn);
    container.appendChild(row);
  });
}
function collectMicroservices() {
  const rows = document.querySelectorAll('.microservice-row');
  const arr = [];
  rows.forEach((row, idx) => {
    const chk = row.querySelector('input[type=checkbox]');
    const nameInput = row.querySelector('input[type=text]:nth-of-type(1)');
    const urlInput = row.querySelector('input[type=text]:nth-of-type(2)');
    const active = chk && chk.checked;
    const name = nameInput ? (nameInput.value.trim() || `svc${idx+1}`) : `svc${idx+1}`;
    const baseUrl = urlInput ? urlInput.value.trim() : '';
    if (baseUrl) arr.push({ id: idx + 1, name, baseUrl, active });
  });
  return arr;
}
function save() {
  const authEndpoint = document.getElementById('authEndpoint').value.trim();
  let basicHeader = document.getElementById('basicHeader').value.trim();
  if (basicHeader && !basicHeader.toLowerCase().startsWith('basic ')) basicHeader = 'Basic ' + basicHeader;
  const intervalMinutes = parseInt(document.getElementById('intervalMinutes').value, 10) || 9;
  const microservices = collectMicroservices();
  chrome.storage.sync.set({ authEndpoint, basicHeader, intervalMinutes, microservices }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Сохранено';
    setTimeout(() => status.textContent = '', 1500);
  });
}
function addServiceRow() {
  const existing = document.querySelectorAll('.microservice-row').length;
  const ms = [{ id: existing + 1, name: '', baseUrl: '', active: true }];
  renderMicroservices([...collectMicroservices(), ...ms]);
}
window.addEventListener('DOMContentLoaded', () => {
  load();
  document.getElementById('saveBtn').addEventListener('click', save);
  document.getElementById('addService').addEventListener('click', addServiceRow);
});
async function discoverServiceName(baseUrl) {
  try {
    let url = baseUrl.trim();
    if (!/^https?:\/\//i.test(url)) return null;
    url = url.replace(/swagger-ui[#/]*$/i, '');
    if (!url.endsWith('/')) url += '/';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json,text/plain' } });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await resp.json();
      return data.name || data.service || data.title || data.app || null;
    } else {
      const text = (await resp.text()).trim();
      const firstLine = text.split(/\r?\n/)[0];
      return firstLine.slice(0, 40) || null;
    }
  } catch (_) { return null; }
}