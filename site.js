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

  // ---------- hero projector
  const heroV = $('#heroVid'), heroA = heroV.closest('a'), heroT = $('#heroT'), heroNo = $('#heroNo'), heroBar = $('#heroBar');
  const HERO = window.HERO || [];
  let hi = 0;
  function showHero(i) {
    hi = (i + HERO.length) % HERO.length;
    const f = byId[HERO[hi]];
    heroV.poster = `media/${f.id}.jpg`; heroV.src = `media/${f.id}.mp4`; heroV.dataset.src = heroV.src;
    heroA.href = `https://www.youtube.com/shorts/${f.id}`; heroA.dataset.id = f.id;
    heroT.textContent = f.title; heroNo.textContent = `${String(hi + 1).padStart(2, '0')} / ${String(HERO.length).padStart(2, '0')}`;
    if (!paused && !REDUCED) play(heroV);
  }
  heroV.addEventListener('ended', () => showHero(hi + 1));
  heroV.addEventListener('timeupdate', () => { if (heroV.duration) heroBar.style.width = (100 * heroV.currentTime / heroV.duration).toFixed(1) + '%'; });
  if (REDUCED) heroV.loop = true;
  showHero(0);

  // ---------- strip / exhibit tiles
  const tiles = [...document.querySelectorAll('.frame video')].filter((v) => v !== heroV);
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
    // hero counts as the candidate when it's on screen
    const hr = heroV.getBoundingClientRect(), heroOn = hr.bottom > innerHeight * 0.35 && hr.top < innerHeight * 0.65;
    tiles.forEach((v) => (v === best && !heroOn ? play(v) : stop(v)));
    heroOn ? play(heroV) : stop(heroV);
  }
  addEventListener('scroll', schedule, { passive: true });
  document.querySelectorAll('.strip').forEach((s) => s.addEventListener('scroll', schedule, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { tiles.forEach(stop); stop(heroV); } else { if (!paused) play(heroV); schedule(); } });

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
    paused = true; tiles.forEach(stop); stop(heroV);
    $('#lbX').focus();
  }
  function close() {
    lb.hidden = true; lbV.innerHTML = ''; document.body.style.overflow = ''; paused = false;
    play(heroV); schedule(); lastFocus && lastFocus.focus();
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

  window.__reel = { open, close, tiles, heroV, MOBILE, state: () => ({ playing: tiles.filter((v) => !v.paused).map((v) => v.dataset.src), hero: !heroV.paused, lb: !lb.hidden }) };
})();
