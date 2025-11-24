// src/background.js - основной service worker
// Перенесён из корня

const DEFAULT_INTERVAL_MINUTES = 9;
// Жёстко заданные данные репозитория для проверки обновлений
const UPDATE_REPO_OWNER = 'GrammerXVX2';
const UPDATE_REPO_NAME = 'chrome-extension';
const UPDATE_REPO_BRANCH = 'main';
const UPDATE_CHECK_PERIOD_HOURS = 6; // период фоновой проверки (можно изменить)

async function getSettings() {
	return new Promise(resolve => {
		chrome.storage.sync.get({
			authEndpoint: '',
			basicHeader: '',
			basicUser: '', // миграция
			basicPass: '', // миграция
			intervalMinutes: DEFAULT_INTERVAL_MINUTES,
			microservices: []
		}, resolve);
	});
}

async function saveToken(baseUrl, token) {
	return new Promise(resolve => {
		chrome.storage.local.get({ tokenData: {} }, data => {
			data.tokenData[baseUrl] = { token, fetchedAt: Date.now() };
			chrome.storage.local.set({ tokenData: data.tokenData }, resolve);
		});
	});
}

async function fetchToken(settings) {
	const { authEndpoint } = settings;
	if (!authEndpoint) return null;
	let header = settings.basicHeader;
	if ((!header || !header.trim()) && settings.basicUser && settings.basicPass) {
		header = 'Basic ' + btoa(`${settings.basicUser}:${settings.basicPass}`);
	}
	if (!header) return null;
	try {
		const resp = await fetch(authEndpoint, { method: 'GET', headers: { 'Authorization': header } });
		if (!resp.ok) return null;
		const json = await resp.json();
		const access = json.access_token || json.token || json.bearer || (json.data && (json.data.access_token || json.data.token)) || null;
		const refresh = json.refresh_token || (json.data && json.data.refresh_token) || null;
		return { access, refresh };
	} catch (_) {
		return null;
	}
}

async function refreshAll() {
	const settings = await getSettings();
	const activeServices = settings.microservices.filter(m => m.active);
	if (!activeServices.length) return;
	const tokenObj = await fetchToken(settings);
	if (!tokenObj || !tokenObj.access) return;
	for (const svc of activeServices) {
		await saveToken(svc.baseUrl, tokenObj.access);
		notifyTabs(svc.baseUrl, tokenObj.access);
	}
}

function notifyTabs(baseUrl, token) {
	chrome.tabs.query({}, tabs => {
		tabs.forEach(tab => {
			if (tab.url && tab.url.startsWith(baseUrl)) {
				safeSendMessageWithInjection(tab.id, { type: 'NEW_TOKEN', baseUrl, token });
			}
		});
	});
}

function safeSendMessageWithInjection(tabId, message) {
	try {
		chrome.tabs.sendMessage(tabId, message, () => {
			if (chrome.runtime.lastError) {
				chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/contentScript.js'] }, () => {
					chrome.tabs.sendMessage(tabId, message, () => {
						if (chrome.runtime.lastError) {
							console.warn('Retry sendMessage failed:', chrome.runtime.lastError.message);
						}
					});
				});
			}
		});
	} catch (e) {
		console.warn('safeSendMessage error', e);
	}
}

function schedule() {
	getSettings().then(settings => {
		const intervalMinutes = settings.intervalMinutes || DEFAULT_INTERVAL_MINUTES;
		chrome.alarms.clear('refreshToken', () => {
			chrome.alarms.create('refreshToken', { periodInMinutes: intervalMinutes });
			refreshAll();
		});
		chrome.alarms.clear('checkUpdate', () => {
			chrome.alarms.create('checkUpdate', { periodInMinutes: Math.max(1, UPDATE_CHECK_PERIOD_HOURS * 60) });
			checkForExtensionUpdate();
		});
	});
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'sync' && (changes.microservices || changes.intervalMinutes || changes.authEndpoint || changes.basicHeader)) {
		schedule();
	}
});
chrome.alarms.onAlarm.addListener(alarm => { 
	if (alarm.name === 'refreshToken') refreshAll();
	if (alarm.name === 'checkUpdate') checkForExtensionUpdate();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg && msg.type === 'GET_TOKEN_FOR_URL' && msg.url) {
		chrome.storage.local.get({ tokenData: {} }, data => {
			for (const [baseUrl, tokenObj] of Object.entries(data.tokenData)) {
				if (msg.url.startsWith(baseUrl)) { sendResponse({ token: tokenObj.token }); return; }
			}
			sendResponse({ token: null });
		});
		return true;
	}
	if (msg && msg.type === 'MANUAL_REFRESH') { refreshAll().then(() => sendResponse({ ok: true })); return true; }
	if (msg && msg.type === 'GET_UPDATE_STATUS') {
		chrome.storage.local.get({ updateInfo: {} }, data => {
			const localVersion = chrome.runtime.getManifest().version;
			const ui = data.updateInfo || {};
			sendResponse({ localVersion, remoteVersion: ui.remoteVersion || null, checkedAt: ui.checkedAt || null });
		});
		return true;
	}
	if (msg && msg.type === 'OPEN_UPDATE_PAGE') {
		const url = `https://github.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}`;
		chrome.tabs.create({ url });
		sendResponse({ ok:true });
		return true;
	}
	if (msg && msg.type === 'MANUAL_UPDATE_CHECK') {
		checkForExtensionUpdate().then(() => sendResponse({ ok:true }));
		return true;
	}
});

async function checkForExtensionUpdate() {
	const manifestUrl = `https://raw.githubusercontent.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/${UPDATE_REPO_BRANCH}/manifest.json`;
	try {
		const resp = await fetch(manifestUrl, { cache: 'no-cache' });
		if (!resp.ok) return;
		const remote = await resp.json();
		const remoteVersion = remote.version;
		const localVersion = chrome.runtime.getManifest().version;
		if (remoteVersion && remoteVersion !== localVersion) {
			chrome.storage.local.set({ updateInfo: { remoteVersion, checkedAt: Date.now() } });
			try {
				chrome.notifications.create('extUpdate', {
					iconUrl: 'assets/icon.png', // предполагаемый ресурс; можно заменить
					title: 'Доступно обновление',
					message: `Новая версия ${remoteVersion} (текущая ${localVersion})`,
					type: 'basic'
				});
			} catch(_){}
		} else {
			chrome.storage.local.set({ updateInfo: { remoteVersion: null, checkedAt: Date.now() } });
		}
	} catch(_){}
}