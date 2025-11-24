// src/content/contentScript.js - основной контент-скрипт
// Перенесён из корня

(function() {
	let lastAppliedToken = null;
	let lastAppliedAt = 0;
	function log(...args) { console.debug('[SwaggerToken]', ...args); }
	function isSwaggerPage() { return document.querySelector('.swagger-ui, #swagger-ui') !== null; }

	function performLogout(schemes, tokenShort) {
		if (!(window.ui && window.ui.authActions)) return;
		const act = window.ui.authActions;
		if (typeof act.logout !== 'function') return;
		schemes.forEach(s => { try { act.logout(s); log('logout scheme', s); } catch(e){ log('logout fail', s, e.message); } });
		// Дополнительно чистим потенциальные поля в DOM модалке
		const authInputs = document.querySelectorAll('.modal-ux input, [role="dialog"] input');
		authInputs.forEach(inp => { const v=(inp.getAttribute('name')||'').toLowerCase(); if(v.includes('token')||v.includes('auth')||v.includes('bearer')) inp.value=''; });
		log('Logout complete for token', tokenShort.slice(0,12)+'…');
	}

	function performAuthorize(schemes, tokenShort) {
		if (!(window.ui)) return;
		const act = window.ui.authActions;
		if (act && typeof act.authorize === 'function') {
			schemes.forEach(s => {
				try { const obj={}; obj[s]={ token: tokenShort }; act.authorize(obj); log('authorize object', s); } catch(e){ }
				try { const obj2={}; obj2[s]=tokenShort; act.authorize(obj2); log('authorize raw', s); } catch(e){ }
			});
		}
		if (typeof window.ui.preauthorizeApiKey === 'function') {
			schemes.forEach(s => { try { window.ui.preauthorizeApiKey(s, tokenShort); log('preauthorize', s); } catch(e){} });
		}
	}

	async function injectBearer(rawToken) {
		if (!rawToken) return;
		const tokenNoPrefix = rawToken.trim().replace(/^Bearer\s+/i, '');
		const now = Date.now();
		// Разрешаем повторную авторизацию, если прошло >30 сек или токен другой.
		const allowReapply = (tokenNoPrefix !== lastAppliedToken) || (now - lastAppliedAt > 30000);
		if (!allowReapply) { log('Skip reapply (cached recent)'); return; }
		const schemes = ['bearerAuth','Bearer','BearerAuth','Authorization'];
		log('Start reauth sequence');
		try { performLogout(schemes, tokenNoPrefix); } catch(e){ log('performLogout error', e); }
		// Небольшая задержка, чтобы UI освободил состояния
		await new Promise(r => setTimeout(r, 200));
		try { performAuthorize(schemes, tokenNoPrefix); } catch(e){ log('performAuthorize error', e); }
		// Прямая замена в авторизационной модалке (если открыта)
		const modal = document.querySelector('.modal-ux, [role="dialog"], .swagger-ui .auth-container');
		if (modal) {
			modal.querySelectorAll('input').forEach(inp => {
				const attrs = [inp.getAttribute('placeholder'), inp.getAttribute('aria-label'), inp.getAttribute('name')].map(a => (a||'').toLowerCase());
				if (attrs.some(v => v.includes('bearer') || v.includes('token') || v.includes('authorization'))) {
					inp.value = tokenNoPrefix; inp.dispatchEvent(new Event('input', { bubbles:true }));
				}
			});
			clickButtons(modal, 'authorize');
			setTimeout(() => clickButtons(modal, 'close'), 500);
		}
		// Фолбэк: ищем одиночный текстовый input
		const plainInputs = document.querySelectorAll('input');
		plainInputs.forEach(inp => {
			if (!inp || !inp.isConnected) return;
			const attrs = [inp.getAttribute('placeholder'), inp.getAttribute('aria-label'), inp.getAttribute('name')].map(a => (a||'').toLowerCase());
			if (attrs.some(v => v.includes('bearer') || v.includes('token') || v.includes('authorization'))) {
				try {
					inp.value = tokenNoPrefix;
					inp.dispatchEvent(new Event('input', { bubbles:true, cancelable:true }));
					inp.dispatchEvent(new Event('change', { bubbles:true }));
					log('Applied token to input');
				} catch(e) {
					log('Input dispatch fail', e.message);
				}
			}
		});
		lastAppliedToken = tokenNoPrefix;
		lastAppliedAt = now;
		log('Token injected sequence done');
	}
	function requestAndApply() { chrome.runtime.sendMessage({ type:'GET_TOKEN_FOR_URL', url:location.href }, resp => { if (resp && resp.token) injectBearer(resp.token); }); }
	function init(){ if (!isSwaggerPage()) return; requestAndApply(); }
	chrome.runtime.onMessage.addListener(msg => { if (msg && msg.type==='NEW_TOKEN' && location.href.startsWith(msg.baseUrl)) injectBearer(msg.token); });
	let attempts=0; const maxAttempts=10; const interval=setInterval(()=>{ attempts++; if(isSwaggerPage()){ init(); clearInterval(interval);} else if(attempts>=maxAttempts){ clearInterval(interval);} },1000);
	function waitForSelector(selector, timeout=4000){ return new Promise(res=>{ const start=Date.now(); const check=()=>{ const el=document.querySelector(selector); if(el) return res(el); if(Date.now()-start>timeout) return res(null); setTimeout(check,50); }; check(); }); }
	async function openAuthorizeModal(){ let modal=document.querySelector('.modal-ux, [role="dialog"], .swagger-ui .auth-container'); if(modal) return modal; const openers=['button[aria-label="Authorize"]','button[title="Authorize"]','.swagger-ui .authorize.unlocked','.swagger-ui .authorize']; for(const sel of openers){ const btn=document.querySelector(sel); if(btn){ btn.click(); break; } } modal=await waitForSelector('.modal-ux, [role="dialog"], .swagger-ui .auth-container'); return modal; }
	function clickButtons(container, textNeedle){ Array.from(container.querySelectorAll('button')).forEach(b=>{ const t=(b.textContent||'').trim().toLowerCase(); if(t.includes(textNeedle.toLowerCase())){ try{ b.click(); }catch(_){} } }); }
})();