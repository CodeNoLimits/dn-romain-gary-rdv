/* Présentation RDV Uzi — scrollytelling FR/EN/HE, sons générés en WebAudio, musique Suno en fond. Rien n'est envoyé nulle part. */
(() => {
  'use strict';
  const T = window.T;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const story = $('#story');
  const scenes = $$('.scene');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rg_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rg_' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  const qsLang = new URLSearchParams(location.search).get('lang');
  const state = {
    lang: ['fr', 'en', 'he'].includes(qsLang) ? qsLang : store.get('lang', 'fr'),
    opt: Math.min(1, Math.max(0, +store.get('opt', 0) || 0)),
    needs: store.get('needs', [false, false, false, false, false, false]),
    calc: store.get('calc', { ticket: 135, margin: 60, nights: 26 }),
    sound: false,
    cur: 0
  };
  const LOC = { fr: 'fr-FR', en: 'en-US', he: 'he-IL' };
  const nf = (n) => new Intl.NumberFormat(LOC[state.lang], { maximumFractionDigits: 0 }).format(n);
  const nf1 = (n) => new Intl.NumberFormat(LOC[state.lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  const ils = (n) => state.lang === 'en' ? '₪' + nf(n) : nf(n) + ' ₪';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* titre découpé en mots qui « pop » comme des sous-titres de reel */
  const words = (txt) => esc(txt).split(/\s+/).map((w, i) => `<span class="w${/\d/.test(w) ? ' dg' : ''}" style="--i:${i}">${w}</span>`).join(' ');
  let d = 0; const r = (step = 90) => { d += step; return `class="r" style="--d:${d}"`; };
  const reset = () => { d = 0; };

  /* ---------------- son ---------------- */
  let ac = null, master = null, noise = null;
  function audio() {
    if (ac) return ac;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    ac = new C(); master = ac.createGain(); master.gain.value = .9; master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 1.2, ac.sampleRate);
    const ch = noise.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    return ac;
  }
  function whoosh(up = true) {
    if (!state.sound || !audio() || ac.state !== 'running') return;
    const t = ac.currentTime, src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noise; bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(up ? 380 : 2600, t); bp.frequency.exponentialRampToValueAtTime(up ? 2600 : 380, t + .42);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .12); g.gain.exponentialRampToValueAtTime(.0001, t + .55);
    src.connect(bp); bp.connect(g); g.connect(master); src.start(t); src.stop(t + .6);
    tone(up ? 523 : 392, .05, .03, t + .18, 'sine');
  }
  function tone(f, dur = .12, vol = .08, at, type = 'sine', slide) {
    if (!state.sound || !audio()) return;
    const t = at || ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
  }
  const tick = () => tone(880, .07, .06, 0, 'triangle', 1320);
  const untick = () => tone(660, .07, .05, 0, 'triangle', 440);
  const pop = () => tone(620, .09, .05, 0, 'sine', 940);
  function chime() {
    if (!state.sound || !audio()) return;
    const t = ac.currentTime; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 1.4, .07, t + i * .09, 'sine'));
  }
  const music = $('#music');
  const TRACKS = {
    fr: { src: 'media/music_fr.mp3', name: 'Monsieur Ajar' },
    en: { src: 'media/music_en.mp3', name: 'Music Square Blues' },
    he: { src: 'media/music_he.mp3', name: 'Monsieur Ajar' }
  };
  /* Son ACTIVÉ par défaut à chaque ouverture (rien n'est mémorisé d'une visite à l'autre). */
  let userMuted = false, playing = false, starting = false, curTrack = null, fadeTok = 0, mGain = null, armed = false;
  state.sound = true;
  const getVol = () => (mGain ? mGain.gain.value : music.volume);
  const setVol = (v) => { v = Math.max(0, Math.min(1, v)); if (mGain) { mGain.gain.value = v; music.volume = 1; } else music.volume = v; };
  function wire() {
    /* pendant un geste : la musique passe par WebAudio, pour que le volume marche aussi sur iPhone */
    if (mGain || !audio()) return;
    try { const src = ac.createMediaElementSource(music); mGain = ac.createGain(); mGain.gain.value = music.volume; src.connect(mGain); mGain.connect(ac.destination); music.volume = 1; } catch (e) { mGain = null; }
  }
  function fade(el, to, ms, done) {
    const from = getVol(), t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / ms); setVol(from + (to - from) * k); k < 1 ? requestAnimationFrame(step) : done && done(); };
    requestAnimationFrame(step);
  }
  function ui() {
    state.sound = !userMuted;
    $('#snd').setAttribute('aria-pressed', String(!userMuted));
    const tr = TRACKS[state.lang], np = $('#np');
    np.innerHTML = `<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>♪ ${esc(tr.name)} · Suno`;
    np.classList.toggle('off', !playing);
  }
  function loadTrack() {
    const tr = TRACKS[state.lang];
    if (curTrack === tr.src) return false;
    curTrack = tr.src; music.src = tr.src; music.load(); return true;
  }
  function tryPlay(gesture) {
    if (userMuted || playing || starting) return Promise.resolve(playing);
    starting = true;
    if (gesture) { audio(); if (ac && ac.state === 'suspended') ac.resume(); wire(); }
    loadTrack(); setVol(0);
    const p = music.play();
    const done = (ok) => { starting = false; if (ok) { playing = true; fade(music, .26, 1600); } ui(); return ok; };
    return (p && p.then) ? p.then(() => done(true)).catch(() => done(false)) : Promise.resolve(done(true));
  }
  function stopMusic() { playing = false; ++fadeTok; fade(music, 0, 500, () => music.pause()); ui(); }
  function switchTrack() {
    ui();
    if (!playing) { loadTrack(); return; }
    const my = ++fadeTok;
    fade(music, 0, 450, () => { if (my !== fadeTok) return; if (loadTrack()) { playing = false; tryPlay(false); } else fade(music, .26, 600); });
  }
  /* le navigateur bloque le son avant le premier geste : on démarre au premier toucher / clic / touche, n'importe où */
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  function onGesture(e) {
    if (e && e.target && e.target.closest && e.target.closest('#snd')) return;
    if (playing) { audio(); if (ac && ac.state === 'suspended') ac.resume(); const v = getVol(); wire(); setVol(v); disarm(); return; }
    if (userMuted) return;
    tryPlay(true).then((ok) => { if (ok) disarm(); });
  }
  function arm() { if (armed) return; armed = true; GESTURES.forEach((ev) => document.addEventListener(ev, onGesture, true)); }
  function disarm() { armed = false; GESTURES.forEach((ev) => document.removeEventListener(ev, onGesture, true)); }
  function autoStart() { ui(); arm(); tryPlay(false); }
  $('#snd').addEventListener('click', () => { if (userMuted || !playing) { userMuted = false; tryPlay(true).then((ok) => { if (ok) { disarm(); pop(); } }); } else { userMuted = true; stopMusic(); } ui(); });
  /* ---------------- rendu des scènes ---------------- */
  const R = {
    cover(t) { reset(); return `<div class="inner">
      <div class="kicker r" style="--d:0">${esc(t.cover.kicker)}</div>
      <h1>${words(t.cover.title)}</h1>
      <p class="lead" ${r(260)}>${esc(t.cover.sub)}</p>
      <div ${r()}><button class="cta pulse" id="start"><span class="play"></span>${esc(t.cover.start)}</button>
      <span class="hint">${esc(t.cover.hint)}</span></div></div>
      <div class="ai">${esc(t.cover.ai)}</div>`; },
    venue(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.venue.tag)}</div>
      <h2>${words(t.venue.title)}</h2>
      <ul class="list">${t.venue.items.map((x, i) => `<li ${r(120)}><span class="n">${i + 1}</span><span>${x}</span></li>`).join('')}</ul></div>`; },
    problem(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.problem.tag)}</div>
      <h2>${words(t.problem.title)}</h2><p class="small r" style="--d:200">${esc(t.problem.hint)} ↻</p>
      <div class="flips">${t.problem.cards.map((c, i) => `<button class="flip r" style="--d:${300 + i * 140}" aria-expanded="false">
        <div class="fc"><div class="f"><strong>${esc(c[0])}</strong><span>↻</span></div><div class="b"><em>DreamNova</em><span>${esc(c[1])}</span></div></div></button>`).join('')}</div></div>`; },
    audience(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.audience.tag)}</div>
      <h2>${words(t.audience.title)}</h2>
      <div class="big r" style="--d:250" data-count="22365">0</div>
      <p class="small r" style="--d:350">${esc(t.audience.label)}</p>
      <p class="lead r" style="--d:480">${esc(t.audience.text)}</p>
      <div class="chips">${t.audience.chips.map((c, i) => `<span class="chip r" style="--d:${600 + i * 90}">${esc(c)}</span>`).join('')}</div></div>`; },
    niche(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.niche.tag)}</div>
      <h2>${words(t.niche.title)}</h2>
      <div class="pills">${t.niche.pills.map((p, i) => `<span class="pill r" style="--d:${260 + i * 110}">${esc(p)}</span>`).join('')}</div>
      <p class="punch r" style="--d:900">${t.niche.punch}</p></div>`; },
    s1(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.s1.tag)}</div>
      <h2>${words(t.s1.title)}</h2>
      <ul class="list checks">${t.s1.items.map((x) => `<li ${r(110)}><span class="n"></span><span>${esc(x)}</span></li>`).join('')}</ul>
      <p class="punch r" style="--d:${d + 160}"><mark>${esc(t.s1.note)}</mark></p></div>`; },
    s2(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.s2.tag)}</div>
      <h2>${words(t.s2.title)}</h2>
      <div class="budget">${t.s2.bars.map((b, i) => `<div class="brow r" style="--d:${250 + i * 120}"><span class="lbl">${esc(b[0])}</span>
        <span class="val" data-count="${b[1]}" data-ils="1">${ils(0)}</span><div class="track"><div class="fill" data-w="${(b[1] / 2550) * 100}"></div></div></div>`).join('')}</div>
      <p class="paid r" style="--d:700">${esc(t.s2.paid)}</p>
      <ul class="camps">${t.s2.camps.map((c, i) => `<li class="r" style="--d:${820 + i * 90}">${esc(c)}</li>`).join('')}</ul>
      <p class="note r" style="--d:1250">${esc(t.s2.code)}</p></div>`; },
    s3(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.s3.tag)}</div>
      <h2>${words(t.s3.title)}</h2>
      <div class="stats">${t.s3.stats.map((s, i) => `<div class="stat r" style="--d:${260 + i * 120}"><div class="v" ${typeof s[0] === 'number' ? `data-count="${s[0]}"` : ''}>${typeof s[0] === 'number' ? 0 : s[0]}</div><div class="k">${esc(s[1])}</div></div>`).join('')}</div>
      <p class="lead r" style="--d:820">${esc(t.s3.text)}</p></div>`; },
    s4(t) { reset(); const img = ['media/reggae.jpg', 'media/vin.jpg', 'media/chanson.jpg'];
      return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.s4.tag)}</div>
      <h2>${words(t.s4.title)}</h2>
      <div class="events">${t.s4.events.map((e, i) => `<article class="ev r ${i === 2 ? 'star' : ''}" style="--d:${280 + i * 150}"><img src="${img[i]}" alt="" loading="lazy">
        <div class="c"><h3>${esc(e[0])}</h3><div class="when">${esc(e[1])}</div><p>${esc(e[2])}</p></div></article>`).join('')}</div>
      <p class="note r" style="--d:800">${esc(t.s4.note)}</p></div>`; },
    cal(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.cal.tag)}</div>
      <h2>${words(t.cal.title)}</h2><p class="small r" style="--d:200">${esc(t.cal.hint)} ${state.lang === 'he' ? '←' : '→'}</p>
      <div class="rail" tabindex="0">${t.cal.items.map((c, i) => `<div class="stop r ${c[1].startsWith('★') ? 'star' : ''}" style="--d:${260 + i * 70}"><span class="dot"></span><div class="d">${esc(c[0])}</div><div class="t">${esc(c[1])}</div></div>`).join('')}</div></div>`; },
    measure(t) { reset(); const ic = ['🎯', '🔖', '📊'];
      return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.measure.tag)}</div>
      <h2>${words(t.measure.title)}</h2>
      <div class="tiles">${t.measure.tiles.map((x, i) => `<div class="tile r" style="--d:${260 + i * 140}"><span class="ic" aria-hidden="true">${ic[i]}</span>${esc(x)}</div>`).join('')}</div>
      <p class="lead r" style="--d:760">${esc(t.measure.text)}</p></div>`; },
    calc(t) { reset(); const c = state.calc;
      return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.calc.tag)}</div>
      <h2>${words(t.calc.title)}</h2>
      <div class="calc r" style="--d:300"><div class="sliders">
        <div class="sl"><label for="c-ticket"><span>${esc(t.calc.ticket)}</span><output id="o-ticket"></output></label><input id="c-ticket" type="range" min="70" max="250" step="5" value="${c.ticket}"></div>
        <div class="sl"><label for="c-margin"><span>${esc(t.calc.margin)}</span><output id="o-margin"></output></label><input id="c-margin" type="range" min="25" max="75" step="1" value="${c.margin}"></div>
        <div class="sl"><label for="c-nights"><span>${esc(t.calc.nights)}</span><output id="o-nights"></output></label><input id="c-nights" type="range" min="8" max="30" step="1" value="${c.nights}"></div>
        <p class="inv">${t.calc.invest}</p></div>
        <div class="res"><div class="card"><div class="num" id="r-month">0</div><div class="lab">${esc(t.calc.perMonth)}</div></div>
        <div class="card"><div class="num" id="r-night">0</div><div class="lab">${esc(t.calc.perNight)}</div></div></div></div>
      <p class="note r" style="--d:600">${esc(t.calc.note)}</p></div>`; },
    offer(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.offer.tag)}</div>
      <h2>${words(t.offer.title)}</h2>
      <div class="offer"><ul class="list checks">${t.offer.items.map((x) => `<li ${r(80)}><span class="n"></span><span>${esc(x)}</span></li>`).join('')}</ul>
      <div class="side"><div class="box gold r" style="--d:400">${esc(t.offer.ads)}</div><div class="box r" style="--d:520">${esc(t.offer.opt)}</div></div></div></div>`; },
    choose(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.choose.tag)}</div>
      <h2>${words(t.choose.title)}</h2>
      <div class="opts" role="radiogroup">${t.choose.opts.map((o, i) => `<button class="opt r" style="--d:${260 + i * 140}" role="radio" aria-checked="${state.opt === i}" data-opt="${i}">
        ${i === 0 ? `<span class="badge">${esc(t.choose.rec)}</span>` : ''}<span class="rad" aria-hidden="true"></span>
        <span class="nm">${esc(o[0])}</span><span class="pr">${esc(o[1])}</span><span class="dt">${esc(o[2])}</span></button>`).join('')}</div>
      <p class="always r" style="--d:760">${esc(t.choose.always)}</p></div>`; },
    needs(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.needs.tag)}</div>
      <h2>${words(t.needs.title)}</h2>
      <div class="meter r" style="--d:220"><div class="trk"><div class="fl" id="n-fill"></div></div><span id="n-txt"></span></div>
      <ul class="needs">${t.needs.items.map((x, i) => `<li class="r" style="--d:${300 + i * 90}"><button class="need" aria-pressed="${!!state.needs[i]}" data-need="${i}"><span class="bx">✓</span><span>${esc(x)}</span></button></li>`).join('')}</ul></div>`; },
    recap(t) { reset(); const o = t.choose.opts[state.opt]; const rows = t.recap.rows;
      const vals = [`${o[0]} · ${o[1]}`, t.recap.start, t.recap.pay[state.opt], t.recap.ads, t.recap.commit];
      const wa = 'https://wa.me/972584921492?text=' + encodeURIComponent(t.recap.waText.replace('{opt}', o[0]));
      return `<div class="inner"><div class="tag r" style="--d:0">${esc(t.recap.tag)}</div>
      <h2>${words(t.recap.title)}</h2>
      <dl class="recap r" style="--d:300">${rows.map((k, i) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(vals[i])}</dd></div>`).join('')}</dl>
      <div class="acts r" style="--d:520"><button class="cta pulse" id="go">${esc(t.recap.go)} ✓</button>
      <a class="ghost" href="${wa}" target="_blank" rel="noopener">${esc(t.recap.wa)}</a></div>
      <p class="note r" style="--d:640">${esc(t.recap.note)}</p></div>`; },
    final(t) { reset(); return `<div class="inner"><div class="tag r" style="--d:0">DreamNova × Romain Gary</div>
      <h2>${words(t.final.title)}</h2><p class="small r" style="--d:200">${esc(t.final.sub)}</p>
      <ol class="steps">${t.final.steps.map((s, i) => `<li class="r" style="--d:${280 + i * 90}"><span>${esc(s[0])}</span><span>${esc(s[1])}</span></li>`).join('')}</ol>
      <p class="thanks r" style="--d:1000">${esc(t.final.thanks)}</p></div>`; }
  };

  /* fonds : vidéo (chargée à l'approche) ou image */
  scenes.forEach((s) => {
    const bg = document.createElement('div'); bg.className = 'bg';
    if (s.dataset.bg) bg.innerHTML = `<video muted loop playsinline preload="none" poster="${s.dataset.poster}" data-src="${s.dataset.bg}"></video>`;
    else if (s.dataset.img) bg.innerHTML = `<img src="${s.dataset.img}" alt="" loading="lazy">`;
    else { s.classList.add('plain'); if (s.dataset.plain) s.classList.add('p' + s.dataset.plain); }
    const g = document.createElement('div'); g.className = 'grain';
    s.prepend(g); s.prepend(bg);
    const box = document.createElement('div'); box.className = 'content'; box.style.cssText = 'display:contents';
    s.appendChild(box);
  });

  function render() {
    const t = T[state.lang];
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'he' ? 'rtl' : 'ltr';
    document.title = t.meta.title;
    $('#next').setAttribute('aria-label', t.meta.next);
    $('#snd').title = t.meta.sound;
    $$('#langs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));
    scenes.forEach((s) => { const box = s.querySelector('.content'); box.innerHTML = R[s.id](t); });
    bind();
    const cur = scenes[state.cur]; if (cur) { cur.classList.remove('on'); void cur.offsetWidth; activate(state.cur, true); }
  }

  /* ---------------- interactions ---------------- */
  function bind() {
    const st = $('#start'); if (st) st.addEventListener('click', () => { if (!playing && !userMuted) tryPlay(true); setTimeout(() => go(1), 250); });
    $$('.flip').forEach((f) => f.addEventListener('click', () => { const o = f.classList.toggle('open'); f.setAttribute('aria-expanded', String(o)); o ? tick() : untick(); }));
    $$('.opt').forEach((b) => b.addEventListener('click', () => {
      state.opt = +b.dataset.opt; store.set('opt', state.opt);
      $$('.opt').forEach((x) => x.setAttribute('aria-checked', String(x === b))); tick();
      const rc = $('#recap .content'); rc.innerHTML = R.recap(T[state.lang]); $('#recap').classList.add('on'); bindRecap();
    }));
    $$('.need').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.need; state.needs[i] = !state.needs[i]; store.set('needs', state.needs);
      b.setAttribute('aria-pressed', String(state.needs[i])); state.needs[i] ? tick() : untick(); meter(true);
    }));
    meter(); calc(); bindRecap();
    ['ticket', 'margin', 'nights'].forEach((k) => { const el = $('#c-' + k); if (el) el.addEventListener('input', () => { state.calc[k] = +el.value; store.set('calc', state.calc); calc(true); }); });
  }
  function bindRecap() { const g = $('#go'); if (g) g.addEventListener('click', () => { chime(); confetti(); setTimeout(() => go(scenes.length - 1), 900); }); }
  function meter(play) {
    const n = state.needs.filter(Boolean).length, f = $('#n-fill'), t = $('#n-txt');
    if (f) f.style.width = (n / 6 * 100) + '%'; if (t) t.textContent = T[state.lang].needs.ready.replace('{n}', n);
    if (play && n === 6) chime();
  }
  let lastTick = 0;
  function calc(sound) {
    const c = state.calc, t = $('#r-month'); if (!t) return;
    const perCover = c.ticket * c.margin / 100, month = 6000 / perCover, night = month / c.nights;
    $('#o-ticket').textContent = ils(c.ticket); $('#o-margin').textContent = c.margin + ' %'; $('#o-nights').textContent = nf(c.nights);
    t.textContent = nf(Math.ceil(month)); $('#r-night').textContent = nf1(night);
    [['ticket', 70, 250], ['margin', 25, 75], ['nights', 8, 30]].forEach(([k, a, b]) => { const el = $('#c-' + k); el.style.setProperty('--p', ((c[k] - a) / (b - a) * 100) + '%'); });
    const now = performance.now(); if (sound && now - lastTick > 70) { lastTick = now; tone(500 + night * 60, .04, .03, 0, 'sine'); }
  }

  /* compteurs animés */
  function counters(sc) {
    $$('[data-count]', sc).forEach((el) => {
      const to = +el.dataset.count, isIls = el.dataset.ils, t0 = performance.now(), dur = 1300;
      const step = (now) => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = Math.round(to * e);
        el.textContent = isIls ? ils(v) : nf(v); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    $$('.fill', sc).forEach((f) => { f.style.width = '0'; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.width = f.dataset.w + '%'; })); });
  }

  /* ---------------- navigation ---------------- */
  const bars = $('#bars'); bars.innerHTML = scenes.map(() => '<i></i>').join('');
  function activate(i, silent) {
    const prev = state.cur; state.cur = i;
    scenes.forEach((s, k) => {
      s.classList.toggle('on', k === i);
      const v = s.querySelector('video');
      if (v) {
        if (Math.abs(k - i) <= 1 && !v.src) v.src = v.dataset.src;
        if (k === i) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
      }
    });
    $$('#bars i').forEach((b, k) => { b.classList.toggle('done', k < i); b.classList.toggle('cur', k === i); });
    $('#count').textContent = String(i + 1).padStart(2, '0') + ' / ' + scenes.length;
    $('#next').classList.toggle('hide', i === scenes.length - 1);
    counters(scenes[i]);
    if (!silent && i !== prev) whoosh(i > prev);
    try { history.replaceState(null, '', '#' + scenes[i].id); } catch (e) { /* ignore */ }
  }
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => { if (e.isIntersecting && e.intersectionRatio > .55) { const i = scenes.indexOf(e.target); if (i !== state.cur || !e.target.classList.contains('on')) activate(i); } });
  }, { root: story, threshold: [.56] });
  scenes.forEach((s) => io.observe(s));
  function go(i) { i = Math.max(0, Math.min(scenes.length - 1, i)); scenes[i].scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  $('#next').addEventListener('click', () => go(state.cur + 1));
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(state.cur + 1); }
    if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(state.cur - 1); }
  });
  $$('#langs button').forEach((b) => b.addEventListener('click', () => { if (state.lang === b.dataset.lang) return; state.lang = b.dataset.lang; store.set('lang', state.lang); pop(); render(); switchTrack(); }));

  /* ---------------- confettis ---------------- */
  function confetti() {
    const cv = $('#confetti'), ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const cols = ['#f1d08e', '#d4ae63', '#a8303f', '#f6efe3', '#7d1e2c'];
    const P = Array.from({ length: 160 }, () => ({ x: innerWidth / 2, y: innerHeight * .55, vx: (Math.random() - .5) * 14, vy: -Math.random() * 15 - 4, r: Math.random() * 6 + 3, c: cols[Math.random() * cols.length | 0], a: Math.random() * 6, va: (Math.random() - .5) * .3 }));
    const t0 = performance.now();
    (function f(now) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach((p) => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
      if (now - t0 < 3200) requestAnimationFrame(f); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }

  render();
  const h = location.hash.slice(1), hi = scenes.findIndex((s) => s.id === h);
  if (hi > 0) { state.cur = hi; story.style.scrollBehavior = 'auto'; story.scrollTop = scenes[hi].offsetTop; requestAnimationFrame(() => { story.style.scrollBehavior = ''; }); }
  activate(state.cur, true);
  autoStart();
})();
