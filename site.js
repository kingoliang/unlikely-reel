// The Unlikely Reel — page behaviour. No framework.
// 1) hero "projector" cycles a few films.  2) strip tiles play when on screen (desktop: all visible;
// phone: only the one nearest the middle).  3) lightbox with YouTube embed, prev/next, Esc.
(() => {
  const FILMS = window.FILMS || [];
  const byId = Object.fromEntries(FILMS.map((f) => [f.id, f]));
  const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);

  const load = (v) => { if (!v.src && v.dataset.src) v.src = v.dataset.src; };
  const play = (v) => { load(v); const p = v.play(); if (p) p.catch(() => {}); v.closest('.frame')?.classList.add('on'); };
  const stop = (v) => { if (!v.paused) v.pause(); v.closest('.frame')?.classList.remove('on'); };
  let paused = false; // while the lightbox is open

  // ---------- strip / exhibit tiles
  const tiles = [...document.querySelectorAll('.frame video')].filter(Boolean);
  const visible = new Set();
  const io = new IntersectionObserver((es) => {
    for (const e of es) { if (e.isIntersecting && e.intersectionRatio > 0.55) visible.add(e.target); else visible.delete(e.target); }
    schedule();
  }, { threshold: [0, 0.55, 1] });
  tiles.forEach((v) => io.observe(v));
  // stagger so neighbours don't cut in sync
  tiles.forEach((v, i) => v.addEventListener('loadedmetadata', () => { v.currentTime = (i * 1.37) % Math.max(1, v.duration - 0.5); }, { once: true }));

  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  function update() {
    if (paused || REDUCED) { tiles.forEach(stop); return; }
    if (!MOBILE) { tiles.forEach((v) => (visible.has(v) ? play(v) : stop(v))); return; }
    // phone: one film at a time — the visible tile closest to the screen centre
    const cx = innerWidth / 2, cy = innerHeight / 2;
    let best = null, bd = Infinity;
    for (const v of visible) { const r = v.getBoundingClientRect(); const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy); if (d < bd) { bd = d; best = v; } }
    // the 3D hero owns the single phone slot while it is on screen
    const heroOn = !!(window.__hero3d && window.__hero3d.active);
    tiles.forEach((v) => (v === best && !heroOn ? play(v) : stop(v)));
  }
  addEventListener('scroll', schedule, { passive: true });
  document.querySelectorAll('.strip').forEach((s) => s.addEventListener('scroll', schedule, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) tiles.forEach(stop); else schedule(); });

  // strip arrows
  document.querySelectorAll('.strip-wrap').forEach((w) => {
    const s = $('.strip', w), step = () => s.clientWidth * 0.8;
    $('.prev', w).addEventListener('click', () => s.scrollBy({ left: -step(), behavior: 'smooth' }));
    $('.next', w).addEventListener('click', () => s.scrollBy({ left: step(), behavior: 'smooth' }));
  });

  // ---------- lightbox
  const lb = $('#lb'), lbV = $('#lbV'), order = [...new Set([...document.querySelectorAll('main [data-id]')].map((a) => a.dataset.id))];
  let cur = -1, lastFocus = null;
  function open(id) {
    const f = byId[id]; if (!f) return;
    cur = order.indexOf(id);
    const wide = f.kind === 'long';
    lbV.className = 'lb-vid' + (wide ? ' wide' : '');
    lbV.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${f.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="${f.title.replace(/"/g, '&quot;')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    $('#lbS').textContent = f.series; $('#lbT').textContent = f.title; $('#lbN').textContent = f.note;
    $('#lbY').href = wide ? `https://www.youtube.com/watch?v=${f.id}` : `https://www.youtube.com/shorts/${f.id}`;
    lb.style.setProperty('--sig', `var(--${f.s})`);
    if (lb.hidden) { lastFocus = document.activeElement; lb.hidden = false; document.body.style.overflow = 'hidden'; }
    paused = true; tiles.forEach(stop);
    $('#lbX').focus();
  }
  function close() {
    lb.hidden = true; lbV.innerHTML = ''; document.body.style.overflow = ''; paused = false;
    schedule(); lastFocus && lastFocus.focus();
  }
  const step = (d) => open(order[(cur + d + order.length) % order.length]);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('main a[data-id]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); open(a.dataset.id);
  });
  $('#lbX').addEventListener('click', close);
  $('#lbP').addEventListener('click', () => step(-1));
  $('#lbNx').addEventListener('click', () => step(1));
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lb-body')) close(); });
  addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
  });

  window.__reel = { open, close, tiles, MOBILE, state: () => ({ playing: tiles.filter((v) => !v.paused).map((v) => v.dataset.src), hero3d: window.__hero3d ? window.__hero3d.playing() : null, lb: !lb.hidden }) };
})();
