// Browser-side proctoring engine (framework-free). A deterrent + audit trail, NOT a guarantee: the server is the authority
// (timer, violation count, auto-submit). Proctor.start({ onViolation(type, desc), onFullscreenLost(), onFullscreenBack(), onFocusLost(), onFocusBack() })
export const Proctor = (() => {
  let h = [], cb = {}, active = false, lastFire = 0;
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); h.push(() => t.removeEventListener(ev, fn, o)); };
  const isFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  // one physical action often fires several events (blur + visibilitychange + fullscreenchange): count it once
  const fire = (type, desc) => {
    const t = Date.now();
    if (!active || t - lastFire < 1500) return;
    lastFire = t; cb.onViolation && cb.onViolation(type, desc);
  };

  function enterFullscreen() {
    const el = document.documentElement;
    return (el.requestFullscreen || el.webkitRequestFullscreen || (() => Promise.resolve())).call(el);
  }

  function start(opts) {
    cb = opts; active = true; lastFire = 0;
    on(document, 'fullscreenchange', () => {
      if (!active) return;
      if (!isFS()) { cb.onFullscreenLost && cb.onFullscreenLost(); fire('fullscreen_exit', 'Exited fullscreen'); }
      else cb.onFullscreenBack && cb.onFullscreenBack();
    });
    on(document, 'visibilitychange', () => { if (document.hidden) fire('tab_switch', 'Switched tab or minimised window'); });
    on(window, 'blur', () => { cb.onFocusLost && cb.onFocusLost(); if (isFS()) fire('window_blur', 'Window lost focus'); });
    on(window, 'focus', () => cb.onFocusBack && cb.onFocusBack());
    // second monitor (Chrome/Edge): fire once per transition
    if (window.screen && 'isExtended' in window.screen) {
      let was = false;
      const chk = () => { const ext = !!window.screen.isExtended; if (ext && !was) fire('multi_monitor', 'Extra display detected'); was = ext; };
      on(window.screen, 'change', chk); const iv = setInterval(chk, 5000); h.push(() => clearInterval(iv)); chk();
    }
    // Keyboard Lock (Chromium, fullscreen, secure context): captures Esc/Alt/Win beyond what preventDefault can
    if (navigator.keyboard && navigator.keyboard.lock)
      navigator.keyboard.lock(['Escape', 'Tab', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight']).catch(() => {});
    ['contextmenu', 'dragstart', 'selectstart'].forEach((e) => on(document, e, (ev) => ev.preventDefault()));
    on(document, 'copy', (ev) => { ev.preventDefault(); fire('copy_attempt', 'Copy attempted'); });
    on(document, 'cut', (ev) => { ev.preventDefault(); fire('cut_attempt', 'Cut attempted'); });
    on(document, 'paste', (ev) => { ev.preventDefault(); fire('paste_attempt', 'Paste attempted'); });
    on(document, 'keydown', (e) => {
      const k = e.key, ctrl = e.ctrlKey || e.metaKey;
      if (k === 'PrintScreen') { e.preventDefault(); fire('screenshot_attempt', 'Print Screen pressed'); return; }
      if (e.altKey && k.toLowerCase() === 'g') { e.preventDefault(); fire('shortcut_blocked', 'Alt+G pressed'); return; }
      if (ctrl && k.toLowerCase() === 'c') { e.preventDefault(); fire('copy_attempt', 'Ctrl+C pressed'); return; }
      if (ctrl && k.toLowerCase() === 'v') { e.preventDefault(); fire('paste_attempt', 'Ctrl+V pressed'); return; }
      if (ctrl && k.toLowerCase() === 'x') { e.preventDefault(); fire('cut_attempt', 'Ctrl+X pressed'); return; }
      if (ctrl && 'uspawtn'.includes(k.toLowerCase()) && k.length === 1) e.preventDefault();
      if (ctrl && e.shiftKey && 'ijc'.includes(k.toLowerCase())) { e.preventDefault(); fire('devtools_attempt', 'DevTools shortcut'); }
      if (['F12', 'F5', 'F11', 'Escape', 'Meta'].includes(k) || (e.altKey && ['F4', 'Tab'].includes(k))) e.preventDefault();
    });
    on(window, 'beforeunload', (e) => { if (active) { e.preventDefault(); e.returnValue = ''; } });
    history.pushState(null, '', location.href);
    on(window, 'popstate', () => history.pushState(null, '', location.href));
  }

  // exitFs=false: only detach listeners (React cleanup); true: the exam is over, also leave fullscreen.
  function stop(exitFs = true) {
    active = false; h.forEach((f) => f()); h = [];
    if (!exitFs) return;
    if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    if (isFS()) { const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (p && p.catch) p.catch(() => {}); }
  }
  return { start, stop, enterFullscreen, isFullscreen: isFS };
})();
