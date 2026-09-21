/* ============================================================
   바이브 벤처 웹 전시관 — app.js (v4)
   스크린샷 카드 · 3D 틸트 · 박수 · 방명록 · 슬라이드쇼 · 랜덤 관람
   ============================================================ */
(function () {
  'use strict';

  const C = Object.assign({
    API_URL: '', TITLE: '바이브 벤처 학생 작품 전시관', SUBTITLE: 'INNODG / VIBE-VENTURE', TAGLINE: '', NOTICE: '',
    SHOW_DEVELOPER: true, THUMB_DIR: 'thumbs', LIVE_SHOT: 'mshots', MAX_CLAPS_PER_PROJECT: 5,
    SLIDESHOW_INTERVAL: 7000, BLOCKED_IFRAME_HOSTS: []
  }, window.GALLERY_CONFIG || {});
  const API = (C.API_URL || '').trim();
  const DEMO = !API;

  /* ---------- 유틸 ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = s => esc(s).replace(/\n/g, '<br>');
  const truncate = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const MONTH_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad2 = n => String(n).padStart(2, '0');
  const nowStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const hue = s => { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h % 360; };
  const who = p => [C.SHOW_DEVELOPER && p.developer, p.school, p.grade && `${p.grade}학년`, p.classNo && `${p.classNo}반`].filter(Boolean).join(' · ');
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem('vv:' + k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('vv:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  const state = {
    rooms: [], key: null, sort: 'no', q: '', order: [], comments: {}, recent: [],
    manifest: {}, manifestMissing: false, view: null, slide: null, shuffle: Math.random()
  };
  const roomByKey = k => state.rooms.find(r => r.key === k);
  const currentRoom = () => roomByKey(state.key);

  /* ---------- API ---------- */
  async function apiGet(action, params = {}) {
    const u = new URL(API);
    u.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
    const r = await fetch(u, { redirect: 'follow' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'API 오류');
    return j;
  }
  async function apiPost(body) {
    const r = await fetch(API, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'API 오류');
    return j;
  }

  /* ---------- 스크린샷 후보 ---------- */
  const slugOf = (p, i) => { const n = String(p.no || '').replace(/\D/g, ''); return (n || String(i + 1)).padStart(2, '0'); };
  function liveShot(link, w = 800) {
    if (!/^https?:/i.test(link || '')) return null;
    if (C.LIVE_SHOT === 'thumio') return `https://image.thum.io/get/width/${w}/crop/${Math.round(w * 0.625)}/noanimate/${link}`;
    if (C.LIVE_SHOT === 'mshots') return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(link)}?w=${w}`;
    return null;
  }
  function thumbCandidates(room, p, i) {
    const list = [];
    if (p.thumb) list.push(p.thumb);
    const rel = `${room.key}/${slugOf(p, i)}.jpg`;
    if (state.manifest[rel] || state.manifestMissing) list.push(`${C.THUMB_DIR}/${rel}`);
    const live = liveShot(p.link);
    if (live) list.push(live);
    return list;
  }
  function mountImg(img, srcs, done) {
    img.classList.remove('ready', 'dead');
    img.removeAttribute('src');
    let i = 0;
    img.onload = () => { img.classList.add('ready'); done && done(true); };
    img.onerror = () => { i++; if (i < srcs.length) img.src = srcs[i]; else { img.classList.add('dead'); done && done(false); } };
    if (!srcs.length) { img.classList.add('dead'); done && done(false); return; }
    img.src = srcs[0];
  }

  /* ---------- 데이터 ---------- */
  async function loadAll() {
    if (DEMO) return demoRooms();
    const j = await apiGet('all');
    return j.rooms || [];
  }
  async function loadManifest() {
    try {
      const r = await fetch(`${C.THUMB_DIR}/manifest.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error('no manifest');
      state.manifest = await r.json();
    } catch (e) { state.manifest = {}; state.manifestMissing = true; }
  }
  async function loadComments(room, force) {
    if (!force && state.comments[room.key]) return state.comments[room.key];
    const list = DEMO ? demoComments(room.key) : ((await apiGet('comments', { month: room.key })).comments || []);
    state.comments[room.key] = list;
    return list;
  }

  /* ---------- 초기화 ---------- */
  async function init() {
    document.title = C.TITLE;
    $('#hero-title').textContent = C.TITLE;
    $('#hero-sub').textContent = C.SUBTITLE;
    $('#hero-tag').textContent = C.TAGLINE;
    $('#v-notice').textContent = C.NOTICE;
    $('#v-notice').hidden = !C.NOTICE;
    $('#foot-text').textContent = C.TITLE;
    if (DEMO) $('#demo-badge').hidden = false;
    const me = store.get('me', {});
    if (me.name) $('#g-name').value = me.name;
    if (me.school) $('#g-school').value = me.school;
    bind();

    try {
      const [rooms] = await Promise.all([loadAll(), loadManifest()]);
      state.rooms = rooms;
    } catch (e) {
      const el = $('#loading');
      el.classList.add('err');
      el.textContent = `전시 데이터를 불러오지 못했습니다.\n${e.message}\n\njs/config.js 의 API_URL 과 Apps Script 배포(액세스: 모든 사용자)를 확인해 주세요.`;
      return;
    }
    $('#loading').hidden = true;
    const open = state.rooms.filter(r => r.open);
    state.key = (open[open.length - 1] || state.rooms[state.rooms.length - 1] || {}).key || null;

    const h = parseHash();
    if (h.key && roomByKey(h.key) && roomByKey(h.key).open) state.key = h.key;
    renderRooms(); renderGrid(); updateStats(); loadTicker();
    if (h.name) { const i = findByName(state.key, h.name); if (i >= 0) openViewer(i, false); }
  }

  /* ---------- 렌더: 전시실 탭 ---------- */
  function renderRooms() {
    $('#rooms').innerHTML = state.rooms.map(r => `
      <button class="room ${r.key === state.key ? 'on' : ''} ${r.open ? '' : 'locked'}" data-key="${esc(r.key)}" ${r.open ? '' : 'disabled'}>
        <span class="room-en">${MONTH_EN[r.month - 1] || ''} · ${r.year}</span>
        <span class="room-ko">${esc(r.label)} 전시실</span>
        <span class="room-cnt">${r.open ? r.projects.length + ' 작품' : '🔒 준비 중'}</span>
      </button>`).join('');
  }
  function selectRoom(key, push = true) {
    if (!roomByKey(key) || key === state.key) return;
    state.key = key; state.shuffle = Math.random();
    renderRooms(); renderGrid();
    if (push) history.replaceState(null, '', '#/' + key);
    const top = $('#room-head').getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > top) window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /* ---------- 렌더: 카드 그리드 ---------- */
  function seededShuffle(arr, seed) {
    let s = Math.floor(seed * 2147483646) + 1;
    const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  function sortedIdx(room) {
    const P = room.projects, q = state.q.trim().toLowerCase();
    let idx = P.map((p, i) => i).filter(i => !q || [P[i].name, P[i].description, P[i].developer, P[i].school].join(' ').toLowerCase().includes(q));
    const num = p => { const n = parseInt(String(p.no).replace(/\D/g, ''), 10); return isNaN(n) ? 1e9 : n; };
    switch (state.sort) {
      case 'comments': idx.sort((a, b) => (P[b].comments || 0) - (P[a].comments || 0) || num(P[a]) - num(P[b])); break;
      case 'claps': idx.sort((a, b) => (P[b].claps || 0) - (P[a].claps || 0) || num(P[a]) - num(P[b])); break;
      case 'name': idx.sort((a, b) => P[a].name.localeCompare(P[b].name, 'ko')); break;
      case 'random': idx = seededShuffle(idx, state.shuffle); break;
      default: idx.sort((a, b) => num(P[a]) - num(P[b]));
    }
    return idx;
  }
  const revealer = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });

  function cardHTML(room, p, i, pos) {
    const mineClaps = (store.get('claps', {})[room.key + '|' + p.name]) || 0;
    return `
      <article class="card" data-idx="${i}" style="--h:${hue(p.name)};--d:${Math.min(pos, 10) * 55}ms" tabindex="0" aria-label="${esc(p.name)}">
        <div class="frame">
          <div class="frame-ph"><span>${esc((p.name || '?').trim().slice(0, 1))}</span></div>
          <img class="shot" alt="${esc(p.name)} 화면">
          ${p.no ? `<span class="frame-no">No. ${esc(p.no)}</span>` : ''}
          <span class="frame-badge">💬 ${p.comments || 0}</span>
          <div class="frame-hover">관람하기 →</div>
        </div>
        <div class="plate">
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description || '소개가 아직 없습니다.')}</p>
          <div class="plate-foot">
            <span class="who">${esc(who(p)) || '&nbsp;'}</span>
            <button class="clap ${mineClaps ? 'mine' : ''}" data-clap="${i}" aria-label="박수 보내기">👏 <b>${p.claps || 0}</b></button>
          </div>
        </div>
      </article>`;
  }
  function renderGrid() {
    const room = currentRoom(), grid = $('#grid'), head = $('#room-head'), empty = $('#empty');
    if (!room) { grid.innerHTML = ''; head.innerHTML = ''; empty.hidden = false; empty.textContent = '표시할 전시실이 없습니다. 시트에 "6월"처럼 월 탭을 만들어 주세요.'; return; }
    state.order = sortedIdx(room);
    const totC = room.projects.reduce((s, p) => s + (p.comments || 0), 0);
    const totK = room.projects.reduce((s, p) => s + (p.claps || 0), 0);
    head.innerHTML = `<div><span class="rh-en">${MONTH_EN[room.month - 1] || ''} · ${room.year}</span><h2>${esc(room.label)} 전시실</h2></div>
      <p class="rh-meta">작품 ${room.projects.length} · 방명록 ${totC} · 박수 ${totK}${state.q ? ` · "${esc(state.q)}" 검색 결과 ${state.order.length}` : ''}</p>`;
    empty.hidden = state.order.length > 0;
    empty.textContent = room.open ? '검색 결과가 없습니다.' : '이 전시실은 준비 중입니다.';
    grid.innerHTML = state.order.map((i, pos) => cardHTML(room, room.projects[i], i, pos)).join('');
    $$('.card', grid).forEach(card => {
      const i = +card.dataset.idx;
      mountImg($('.shot', card), thumbCandidates(room, room.projects[i], i));
      revealer.observe(card);
    });
  }
  function syncCard(i) {
    const room = currentRoom(); if (!room) return;
    const p = room.projects[i], card = $(`.card[data-idx="${i}"]`);
    if (card) { $('.frame-badge', card).textContent = `💬 ${p.comments || 0}`; $('.clap b', card).textContent = p.claps || 0; }
    if (state.view && state.view.key === room.key && state.view.idx === i) { $('#v-clapcount').textContent = p.claps || 0; $('#v-gcount').textContent = p.comments || 0; }
  }

  /* ---------- 통계 ---------- */
  function countUp(el, to) {
    const from = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
    if (reduceMotion || from === to) { el.textContent = to.toLocaleString(); return; }
    const t0 = performance.now(), dur = 700;
    const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e).toLocaleString(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function updateStats() {
    const open = state.rooms.filter(r => r.open);
    const all = open.flatMap(r => r.projects);
    const s = { rooms: open.length, projects: all.length, comments: all.reduce((a, p) => a + (p.comments || 0), 0), claps: all.reduce((a, p) => a + (p.claps || 0), 0) };
    $$('[data-stat]').forEach(el => countUp(el, s[el.dataset.stat] || 0));
  }

  /* ---------- 최근 방명록 흐름 ---------- */
  async function loadTicker() {
    try { state.recent = DEMO ? demoRecent() : ((await apiGet('recent', { limit: 12 })).comments || []); } catch (e) { state.recent = []; }
    renderTicker();
  }
  function renderTicker() {
    const track = $('#ticker-track'), list = state.recent;
    if (!list.length) { track.style.animation = 'none'; track.innerHTML = '<span class="tk">아직 방명록이 없습니다 — 첫 응원을 남겨 주세요 ✍️</span>'; return; }
    const html = list.map(c => `<span class="tk"><b>${esc(c.name)}</b><i>→ ${esc(c.project)}</i>${esc(truncate(c.content, 60))}</span>`).join('');
    track.style.animation = '';
    track.innerHTML = html + html;
    track.style.animationDuration = Math.max(28, list.length * 6) + 's';
  }

  /* ---------- 박수 ---------- */
  const pendingClaps = {}, clapTimers = {};
  function clap(room, i, el) {
    const p = room.projects[i], k = room.key + '|' + p.name;
    const mine = store.get('claps', {}), used = mine[k] || 0;
    if (used >= C.MAX_CLAPS_PER_PROJECT) { toast(`이 작품에는 이미 박수 ${used}번을 보냈어요 👏`); return; }
    mine[k] = used + 1; store.set('claps', mine);
    p.claps = (p.claps || 0) + 1;
    syncCard(i); updateStats();
    if (el) { el.classList.add('mine'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); confetti(el); }
    if (DEMO) return;
    pendingClaps[k] = (pendingClaps[k] || 0) + 1;
    clearTimeout(clapTimers[k]);
    clapTimers[k] = setTimeout(async () => {
      const n = pendingClaps[k]; pendingClaps[k] = 0;
      try {
        const j = await apiPost({ action: 'clap', month: room.key, project: p.name, n });
        if (typeof j.claps === 'number') { p.claps = j.claps; syncCard(i); updateStats(); }
      } catch (e) { console.warn('박수 저장 실패', e); }
    }, 700);
  }
  function confetti(el) {
    if (reduceMotion) return;
    const r = el.getBoundingClientRect(), layer = $('#confetti-layer');
    const colors = ['#f3d98a', '#d4af37', '#fff', '#60a5fa', '#f472b6'];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'cf';
      s.style.left = r.left + r.width / 2 + 'px'; s.style.top = r.top + r.height / 2 + 'px';
      s.style.background = colors[i % colors.length];
      s.style.setProperty('--dx', (Math.random() - 0.5) * 160 + 'px');
      s.style.setProperty('--dy', -40 - Math.random() * 120 + 'px');
      s.style.setProperty('--rot', Math.random() * 720 - 360 + 'deg');
      layer.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }
  }

  /* ---------- 관람 화면 ---------- */
  function findByName(key, name) { const r = roomByKey(key); return r ? r.projects.findIndex(p => p.name === name) : -1; }
  function openViewer(i, push = true) {
    const room = currentRoom(); if (!room || !room.projects[i]) return;
    if (!state.order.includes(i)) { state.q = ''; $('#search').value = ''; renderGrid(); }
    state.view = { key: room.key, idx: i };
    $('#viewer').hidden = false; document.body.classList.add('lock');
    fillViewer();
    if (push) location.hash = `#/${room.key}/${encodeURIComponent(room.projects[i].name)}`;
  }
  function closeViewer(push = true) {
    if (!state.view) return;
    state.view = null;
    $('#viewer').hidden = true; document.body.classList.remove('lock');
    $('#v-iframe').src = 'about:blank';
    if (push) history.replaceState(null, '', '#/' + state.key);
  }
  function stepViewer(d) {
    if (!state.view) return;
    const pos = state.order.indexOf(state.view.idx);
    const next = state.order[(pos + d + state.order.length) % state.order.length];
    openViewer(next);
  }
  function fillViewer() {
    const room = roomByKey(state.view.key), i = state.view.idx, p = room.projects[i];
    const pos = state.order.indexOf(i);
    $('#v-pos').textContent = `${pos + 1} / ${state.order.length}`;
    $('#v-room').textContent = `${room.label} 전시실`;
    $('#v-no').textContent = p.no ? `No. ${p.no}` : '';
    $('#v-title').textContent = p.name;
    $('#v-desc').innerHTML = nl2br(p.description || '소개가 아직 없습니다.');
    const meta = [];
    if (C.SHOW_DEVELOPER && p.developer) meta.push(['개발자', esc(p.developer)]);
    const sch = [p.school, p.grade && `${p.grade}학년`, p.classNo && `${p.classNo}반`].filter(Boolean).join(' ');
    if (sch) meta.push(['소속', esc(sch)]);
    if (p.link) meta.push(['주소', `<a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${esc(p.link)}</a>`]);
    $('#v-meta').innerHTML = meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('#v-clapcount').textContent = p.claps || 0;
    $('#v-clap').classList.toggle('mine', !!(store.get('claps', {})[room.key + '|' + p.name]));
    $('#v-open').href = p.link || '#'; $('#v-fallback-link').href = p.link || '#';

    const frame = $('#v-iframe'), fb = $('#v-fallback'), sp = $('#v-spinner');
    const blocked = !/^https?:/i.test(p.link || '') || C.BLOCKED_IFRAME_HOSTS.some(h => p.link.includes(h));
    if (blocked) {
      frame.src = 'about:blank'; sp.hidden = true; fb.hidden = false;
      mountImg($('#v-fallback-img'), thumbCandidates(room, p, i));
    } else {
      fb.hidden = true; sp.hidden = false;
      frame.onload = () => { sp.hidden = true; };
      frame.src = p.link;
      setTimeout(() => { sp.hidden = true; }, 8000);
    }

    switchTab('about');
    $('#g-list').innerHTML = '<li class="g-loading">방명록을 불러오는 중…</li>';
    $('#v-gcount').textContent = p.comments || 0;
    loadComments(room).then(() => { if (state.view && state.view.key === room.key && state.view.idx === i) renderGuest(); })
      .catch(() => { $('#g-list').innerHTML = '<li class="g-loading">방명록을 불러오지 못했습니다.</li>'; });
  }
  function switchTab(t) {
    $$('.v-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $$('.v-tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + t));
  }
  function renderGuest() {
    const room = roomByKey(state.view.key), i = state.view.idx, p = room.projects[i];
    const list = (state.comments[room.key] || []).filter(c => c.project === p.name);
    p.comments = list.length; syncCard(i);
    $('#g-list').innerHTML = list.length ? list.map(c => `
      <li class="g-item ${c.fresh ? 'fresh' : ''}">
        <span class="g-avatar" style="--h:${hue(c.name)}">${esc((c.name || '?').trim().slice(0, 1))}</span>
        <div style="flex:1;min-width:0">
          <div class="g-head"><b>${esc(c.name)}</b>${c.school ? `<span>${esc(c.school)}</span>` : ''}<time>${esc(c.date || '')}</time></div>
          <p>${nl2br(c.content)}</p>
        </div>
      </li>`).join('') : '<li class="g-loading">아직 방명록이 없어요. 첫 응원을 남겨 보세요 ✍️</li>';
  }
  async function submitGuest(e) {
    e.preventDefault();
    if (!state.view) return;
    const room = roomByKey(state.view.key), i = state.view.idx, p = room.projects[i];
    const name = $('#g-name').value.trim(), school = $('#g-school').value.trim(), content = $('#g-content').value.trim(), hp = $('#g-website').value;
    if (!name || !content) return toast('이름과 내용을 입력해 주세요.');
    const btn = $('#g-submit'); btn.disabled = true; btn.textContent = '남기는 중…';
    try {
      let c;
      if (DEMO) c = { project: p.name, name, school, content, date: nowStr() };
      else { const j = await apiPost({ action: 'comment', month: room.key, project: p.name, name, school, content, website: hp }); c = j.comment || { project: p.name, name, school, content, date: nowStr() }; }
      c.fresh = true;
      (state.comments[room.key] = state.comments[room.key] || []).unshift(c);
      state.recent.unshift({ name, project: p.name, content }); state.recent = state.recent.slice(0, 12); renderTicker();
      store.set('me', { name, school });
      $('#g-content').value = '';
      renderGuest(); updateStats();
      toast('방명록을 남겼습니다. 감사합니다! 💛');
    } catch (err) { toast('등록 실패: ' + err.message); }
    finally { btn.disabled = false; btn.textContent = '방명록 남기기'; }
  }

  /* ---------- 슬라이드쇼 ---------- */
  function startSlideshow() {
    const room = currentRoom();
    if (!room || !state.order.length) return toast('보여줄 작품이 없습니다.');
    state.slide = { key: room.key, pos: -1, timer: null, paused: false };
    $('#slideshow').hidden = false; document.body.classList.add('lock');
    $('#ss-bar').style.setProperty('--dur', C.SLIDESHOW_INTERVAL + 'ms');
    $('#ss-pause').textContent = '❚❚';
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    showSlide(0);
  }
  function stopSlideshow() {
    if (!state.slide) return;
    clearTimeout(state.slide.timer); state.slide = null;
    $('#slideshow').hidden = true; document.body.classList.remove('lock');
    $$('#ss-stage img').forEach(im => im.remove());
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  function showSlide(pos) {
    const s = state.slide; if (!s) return;
    const room = roomByKey(s.key), n = state.order.length;
    s.pos = (pos + n) % n;
    const i = state.order[s.pos], p = room.projects[i];
    $('#ss-room').textContent = `${room.label} 전시실 · ${s.pos + 1} / ${n}`;
    $('#ss-title').textContent = p.name;
    $('#ss-desc').textContent = truncate(p.description, 170);
    $('#ss-who').textContent = who(p);
    $('#ss-initial').textContent = (p.name || '?').trim().slice(0, 1);
    const stage = $('#ss-stage'); stage.style.setProperty('--h', hue(p.name));
    const olds = $$('img', stage);
    const im = document.createElement('img'); im.alt = ''; stage.appendChild(im);
    mountImg(im, thumbCandidates(room, p, i), ok => {
      stage.classList.toggle('noimg', !ok);
      if (ok) requestAnimationFrame(() => im.classList.add('show'));
      setTimeout(() => olds.forEach(o => o.remove()), 900);
    });
    schedule();
  }
  function schedule() {
    const s = state.slide; if (!s) return;
    clearTimeout(s.timer);
    const bar = $('#ss-bar'); bar.classList.remove('run', 'paused'); void bar.offsetWidth;
    if (s.paused) return;
    bar.classList.add('run');
    s.timer = setTimeout(() => showSlide(s.pos + 1), C.SLIDESHOW_INTERVAL);
  }
  function togglePause() {
    const s = state.slide; if (!s) return;
    s.paused = !s.paused;
    $('#ss-pause').textContent = s.paused ? '▶' : '❚❚';
    if (s.paused) { clearTimeout(s.timer); $('#ss-bar').classList.add('paused'); } else schedule();
  }

  /* ---------- 기타 ---------- */
  function randomVisit() {
    const pool = [];
    state.rooms.forEach(r => r.open && r.projects.forEach((p, i) => pool.push({ key: r.key, i })));
    if (!pool.length) return toast('아직 전시된 작품이 없습니다.');
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick.key !== state.key) selectRoom(pick.key, false);
    openViewer(pick.i);
  }
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400); }
  function parseHash() {
    const m = location.hash.match(/^#\/([^/]+)(?:\/(.+))?$/);
    if (!m) return {};
    let name = ''; try { name = m[2] ? decodeURIComponent(m[2]) : ''; } catch (e) { /* ignore */ }
    return { key: m[1], name };
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    const hero = $('#hero');
    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      hero.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
    $('#btn-random').addEventListener('click', randomVisit);
    $('#btn-slideshow').addEventListener('click', startSlideshow);

    $('#rooms').addEventListener('click', e => { const b = e.target.closest('.room'); if (b && !b.disabled) selectRoom(b.dataset.key); });
    let searchTimer;
    $('#search').addEventListener('input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = e.target.value; renderGrid(); }, 160); });
    $('#sort').addEventListener('change', e => { state.sort = e.target.value; state.shuffle = Math.random(); renderGrid(); });

    const grid = $('#grid');
    grid.addEventListener('click', e => {
      const clapBtn = e.target.closest('.clap');
      if (clapBtn) { e.stopPropagation(); clap(currentRoom(), +clapBtn.dataset.clap, clapBtn); return; }
      const card = e.target.closest('.card'); if (card) openViewer(+card.dataset.idx);
    });
    grid.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('card')) openViewer(+e.target.dataset.idx); });
    grid.addEventListener('pointermove', e => {
      if (reduceMotion || e.pointerType === 'touch') return;
      const card = e.target.closest('.card'); if (!card) return;
      const r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--rx', ((0.5 - py) * 8).toFixed(2) + 'deg');
      card.style.setProperty('--ry', ((px - 0.5) * 10).toFixed(2) + 'deg');
      card.style.setProperty('--px', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--py', (py * 100).toFixed(1) + '%');
    });
    grid.addEventListener('pointerout', e => {
      const card = e.target.closest('.card');
      if (card && !card.contains(e.relatedTarget)) { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); }
    });

    $('#v-close').addEventListener('click', () => closeViewer());
    $('#v-prev').addEventListener('click', () => stepViewer(-1));
    $('#v-next').addEventListener('click', () => stepViewer(1));
    $('#v-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); toast('이 작품의 링크를 복사했습니다 🔗'); } catch (e) { prompt('아래 주소를 복사하세요', location.href); }
    });
    $('#v-clap').addEventListener('click', e => { if (state.view) clap(roomByKey(state.view.key), state.view.idx, e.currentTarget); });
    $$('.v-tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('#g-form').addEventListener('submit', submitGuest);

    $('#ss-close').addEventListener('click', stopSlideshow);
    $('#ss-prev').addEventListener('click', () => state.slide && showSlide(state.slide.pos - 1));
    $('#ss-next').addEventListener('click', () => state.slide && showSlide(state.slide.pos + 1));
    $('#ss-pause').addEventListener('click', togglePause);
    $('#ss-stage').addEventListener('click', () => { if (state.slide) { const i = state.order[state.slide.pos]; stopSlideshow(); openViewer(i); } });

    document.addEventListener('keydown', e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (state.slide) {
        if (e.key === 'Escape') stopSlideshow();
        else if (e.key === 'ArrowRight') showSlide(state.slide.pos + 1);
        else if (e.key === 'ArrowLeft') showSlide(state.slide.pos - 1);
        else if (e.key === ' ') { e.preventDefault(); togglePause(); }
        else if (e.key === 'Enter') { const i = state.order[state.slide.pos]; stopSlideshow(); openViewer(i); }
        return;
      }
      if (state.view) {
        if (e.key === 'Escape') closeViewer();
        else if (e.key === 'ArrowRight') stepViewer(1);
        else if (e.key === 'ArrowLeft') stepViewer(-1);
      }
    });
    window.addEventListener('hashchange', () => {
      const h = parseHash();
      if (h.name) {
        if (h.key !== state.key && roomByKey(h.key) && roomByKey(h.key).open) selectRoom(h.key, false);
        const i = findByName(state.key, h.name); if (i >= 0 && !(state.view && state.view.idx === i)) openViewer(i, false);
      } else if (state.view) closeViewer(false);
      else if (h.key && h.key !== state.key) selectRoom(h.key, false);
    });
  }

  /* ---------- DEMO 데이터 (API_URL 이 비어 있을 때) ---------- */
  function demoRooms() {
    const mk = (no, name, link, description, developer, school) => ({ no: String(no), name, link, description, developer, school, grade: '', classNo: '', thumb: '', comments: Math.floor(Math.random() * 6), claps: Math.floor(Math.random() * 40) });
    const sep = [
      mk(1, '미션 파서블', 'https://yellow-bay-074680900.2.azurestaticapps.net', '할 일을 미루는 사람들을 위해 시간을 정해 그 안에 마무리하도록 돕는 타이머 앱. 완료하면 포인트를 얻고 포기하면 잃습니다.', '김학생', '대구OO중'),
      mk(2, 'Science Studio', 'https://example.com/science', '선생님들이 수업 중 시뮬레이션을 자유롭게 만들어 쓰거나 다른 사람이 만든 시뮬레이션을 쓸 수 있는 사이트.', '이학생', '대구OO고'),
      mk(3, 'SAYSO', 'https://orange-wave-06876f900.2.azurestaticapps.net', '상대방과 상황에 맞는 메시지를 AI가 작성해 주는 커뮤니케이션 서비스.', '박학생', '대구OO중'),
      mk(4, '매듭', 'https://knotwebh8pfmn.z12.web.core.windows.net/', 'Knot — 매일 다섯 개의 작은 루틴을 완료하며 일주일 동안 서른다섯 개의 점을 이어 나만의 형상을 완성하는 미니멀 루틴 앱.', '최학생', '대구OO고'),
      mk(5, '스쿨스페이스', 'https://mango-pebble-0d76ff000.7.azurestaticapps.net/', '학교 공간 예약과 AI 에이전트 답변을 매끄럽게 다듬어 주는 서비스.', '정학생', '대구OO중'),
      mk(6, 'FindIt AI', 'https://app-web-ovkh3zqwz76uy.azurewebsites.net/', '사용자가 애매하게 상품을 설명해도 AI가 의도를 분석해 실제 쇼핑 상품과 가격을 찾아 주는 자연어 커머스 검색 서비스.', '한학생', '대구OO고')
    ];
    const aug = [
      mk(1, 'HabitQuest', 'https://example.com/habit', '선택한 습관을 퀘스트 형식으로 클리어하며 보상·경험치를 얻어 레벨업하는 앱.', '', '대구OO중'),
      mk(2, 'LUGGY', 'https://example.com/luggy', '캐리어 보관+렌탈 플랫폼. 안 쓰는 캐리어를 맡기고 리워드를 얻습니다.', '', '대구OO고'),
      mk(3, 'Quiet Window', 'https://example.com/quiet', '힐링을 위한 앱. 배경 사진 변경, 소리 믹서 조절 기능 제공.', '', '대구OO중')
    ];
    return [
      { sheetName: '8월', year: 2026, month: 8, key: '2026-08', label: '8월', open: true, projects: aug },
      { sheetName: '9월', year: 2026, month: 9, key: '2026-09', label: '9월', open: true, projects: sep },
      { sheetName: '10월', year: 2026, month: 10, key: '2026-10', label: '10월', open: false, projects: [] }
    ];
  }
  function demoComments(key) {
    if (key !== '2026-09') return [];
    return [
      { project: '미션 파서블', name: '박선생', school: '대구OO중', content: '타이머가 끝날 때 알림이 확실해서 좋아요. 포인트 제도도 재밌습니다!', date: '2026-09-15 10:21' },
      { project: 'SAYSO', name: '김학생', school: '대구OO고', content: '말투 바꾸는 기능이 신기해요. 선생님께 메시지 보낼 때 써 봤어요.', date: '2026-09-14 16:03' },
      { project: '매듭', name: '이선생', school: '대구OO중', content: '디자인이 정말 미니멀하고 예뻐요. 35개의 점이 이어지는 게 인상적!', date: '2026-09-13 09:40' }
    ];
  }
  function demoRecent() { return demoComments('2026-09'); }

  document.addEventListener('DOMContentLoaded', init);
})();
