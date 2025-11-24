// src/content/contentScript.js - основной контент-скрипт
// Перенесён из корня
(function() {
	let lastAppliedToken = null;
	function log(...args) { console.debug('[SwaggerToken]', ...args); }
	function isSwaggerPage() { return document.querySelector('.swagger-ui, #swagger-ui') !== null; }
	function injectBearer(rawToken) {
		if (!rawToken) return;
		const tokenNoPrefix = rawToken.trim().replace(/^Bearer\s+/i, '');
		// Выполним logout перед переавторизацией, если доступно
		const possibleSchemes = ['Authorization', 'bearerAuth', 'Bearer', 'BearerAuth'];
		try {
			if (window.ui && window.ui.authActions && typeof window.ui.authActions.logout === 'function') {
				possibleSchemes.forEach(scheme => { try { window.ui.authActions.logout(scheme); } catch(_){} });
			}
		} catch(_){}
		lastAppliedToken = tokenNoPrefix;
		// После logout авторизуем заново
		try {
			if (window.ui && window.ui.authActions && typeof window.ui.authActions.authorize === 'function') {
				possibleSchemes.forEach(scheme => {
					try { const o1 = {}; o1[scheme] = { token: tokenNoPrefix }; window.ui.authActions.authorize(o1); } catch(_){}
					try { const o2 = {}; o2[scheme] = tokenNoPrefix; window.ui.authActions.authorize(o2); } catch(_){}
				});
			}
		} catch(e){ log('authActions.authorize error', e); }
		try {
			if (window.ui && typeof window.ui.preauthorizeApiKey === 'function') {
				possibleSchemes.forEach(scheme => { try { window.ui.preauthorizeApiKey(scheme, tokenNoPrefix); } catch(_){} });
			}
		} catch(e){ log('preauthorizeApiKey error', e); }
		const inputs = document.querySelectorAll('input');
		inputs.forEach(inp => {
			const attrs = [inp.getAttribute('placeholder'), inp.getAttribute('aria-label'), inp.getAttribute('name')].map(a => (a||'').toLowerCase());
			if (attrs.some(v => v.includes('bearer') || v.includes('token') || v.includes('authorization'))) {
				inp.value = tokenNoPrefix; inp.dispatchEvent(new Event('input', { bubbles:true }));
			}
		});
		const modal = document.querySelector('.modal-ux, [role="dialog"], .swagger-ui .auth-container');
		if (modal) {
			const textInputs = Array.from(modal.querySelectorAll('input[type="text"], input:not([type])')).filter(el => el.offsetParent !== null);
			if (textInputs.length === 1 && !textInputs[0].value) {
				textInputs[0].value = tokenNoPrefix; textInputs[0].dispatchEvent(new Event('input', { bubbles:true }));
			}
		}
		openAuthorizeModal().then(modal => {
			if (!modal) return;
			modal.querySelectorAll('input').forEach(inp => {
				const attrs = [inp.getAttribute('placeholder'), inp.getAttribute('aria-label'), inp.getAttribute('name')].map(a => (a||'').toLowerCase());
				if (attrs.some(v => v.includes('bearer') || v.includes('token') || v.includes('authorization'))) {
					inp.value = tokenNoPrefix; inp.dispatchEvent(new Event('input', { bubbles:true }));
				}
			});
			clickButtons(modal, 'authorize');
			setTimeout(() => clickButtons(modal, 'close'), 500);
		});
		log('Token injected (bearer)');
	}
	function requestAndApply() { chrome.runtime.sendMessage({ type:'GET_TOKEN_FOR_URL', url:location.href }, resp => { if (resp && resp.token) injectBearer(resp.token); }); }
	function init(){ if (!isSwaggerPage()) return; requestAndApply(); }
	chrome.runtime.onMessage.addListener(msg => { if (msg && msg.type==='NEW_TOKEN' && location.href.startsWith(msg.baseUrl)) injectBearer(msg.token); });
	let attempts=0; const maxAttempts=10; const interval=setInterval(()=>{ attempts++; if(isSwaggerPage()){ init(); clearInterval(interval);} else if(attempts>=maxAttempts){ clearInterval(interval);} },1000);
	function waitForSelector(selector, timeout=4000){ return new Promise(res=>{ const start=Date.now(); const check=()=>{ const el=document.querySelector(selector); if(el) return res(el); if(Date.now()-start>timeout) return res(null); setTimeout(check,50); }; check(); }); }
	async function openAuthorizeModal(){ let modal=document.querySelector('.modal-ux, [role="dialog"], .swagger-ui .auth-container'); if(modal) return modal; const openers=['button[aria-label="Authorize"]','button[title="Authorize"]','.swagger-ui .authorize.unlocked','.swagger-ui .authorize']; for(const sel of openers){ const btn=document.querySelector(sel); if(btn){ btn.click(); break; } } modal=await waitForSelector('.modal-ux, [role="dialog"], .swagger-ui .auth-container'); return modal; }
	function clickButtons(container, textNeedle){ Array.from(container.querySelectorAll('button')).forEach(b=>{ const t=(b.textContent||'').trim().toLowerCase(); if(t.includes(textNeedle.toLowerCase())){ try{ b.click(); }catch(_){} } }); }
})();