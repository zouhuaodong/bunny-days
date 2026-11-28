/* =========================================================
   饿疯兔小屋  ·  纯静态单页小游戏
   主角：饿疯兔（用户提供的三张贴纸）
   玩法参考开源项目 naituan（奶团小屋），代码与场景均为本项目自制
   ========================================================= */
'use strict';
(function () {

  /* ---------------- 工具 ---------------- */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const now = () => Date.now();
  const MIN = 60000;

  /* ---------------- 存档 ---------------- */
  const KEY = 'efhouse.v1';
  const DEF = {
    v: 1,
    name: '饿疯兔',
    food: 72, mood: 70, energy: 80,
    coins: 20, fishes: 3,
    born: now(), lastTick: now(),
    best: { hide: 0, stack: 0, catch: 0 },
    owned: [],
    placed: [],
    sound: true,
    stats: { pet: 0, feed: 0, play: 0 }
  };
  let S = Object.assign({}, DEF, { best: Object.assign({}, DEF.best) });
  let memOnly = false;

  function loadSave() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          S = Object.assign({}, DEF, o);
          S.best = Object.assign({}, DEF.best, o.best || {});
          S.stats = Object.assign({}, DEF.stats, o.stats || {});
          if (!Array.isArray(S.placed)) S.placed = DEF.placed.slice();
          if (!Array.isArray(S.owned)) S.owned = [];
        }
      }
    } catch (e) {
      memOnly = true;
      console.warn('存档读取失败，改用内存存档', e);
    }
  }
  function save() {
    if (memOnly) return;
    try {
      S.lastTick = now();
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) { memOnly = true; }
  }

  /* ---------------- 离线衰减 ---------------- */
  const RATE = { food: 0.34, mood: 0.28, energy: 0.24 }; // 每分钟
  function applyOffline() {
    const mins = Math.min((now() - (S.lastTick || now())) / MIN, 480);
    if (mins <= 0.5) return;
    S.food = clamp(S.food - RATE.food * mins, 0, 100);
    S.energy = clamp(S.energy - RATE.energy * mins, 0, 100);
    S.mood = clamp(S.mood - RATE.mood * mins - (S.food < 25 ? 0.15 * mins : 0), 0, 100);
    S.lastTick = now();
  }

  /* ---------------- 音效（现场合成，无音频文件） ---------------- */
  const Audio1 = {
    ctx: null, on: true,
    boot() {
      if (!this.on) return;
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { /* 忽略 */ }
    },
    tone(freq, dur, type, vol, slideTo) {
      if (!this.on) return;
      this.boot();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol == null ? 0.12 : vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    pet() { this.tone(760, 0.13, 'sine', 0.1, 1180); },
    rub() { this.tone(420, 0.3, 'sine', 0.07, 620); },
    eat() { this.tone(300, 0.1, 'triangle', 0.1, 520); setTimeout(() => this.tone(520, 0.12, 'triangle', 0.08, 380), 110); },
    good() { this.tone(880, 0.09, 'square', 0.06); setTimeout(() => this.tone(1320, 0.12, 'square', 0.05), 80); },
    bad() { this.tone(200, 0.22, 'sawtooth', 0.07, 120); },
    coin() { this.tone(1046, 0.07, 'square', 0.05); setTimeout(() => this.tone(1568, 0.1, 'square', 0.045), 60); }
  };

  /* ---------------- 表情 ---------------- */
  const FACE = {
    happy: 'ef-assets/pet-happy.png',
    bored: 'ef-assets/pet-bored.png',
    hungry: 'ef-assets/pet-hungry.png'
  };
  let faceOverride = null, faceTimer = 0;

  function applyFace(name) {
    const img = $('#pet');
    const src = FACE[name] || FACE.happy;
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  }
  function setFace(name, ms) {
    faceOverride = name;
    applyFace(name);
    clearTimeout(faceTimer);
    if (ms) faceTimer = setTimeout(() => { faceOverride = null; renderFace(); }, ms);
  }
  function autoFace() {
    if (S.food < 28) return 'hungry';
    if (S.energy < 18) return 'bored';
    if (S.mood < 26) return 'bored';
    return 'happy';
  }
  function renderFace() {
    applyFace(faceOverride || autoFace());
    const sleeping = S.energy < 18;
    $('#zzz').classList.toggle('hidden', !sleeping);
    $('#petWrap').style.animationPlayState = sleeping ? 'paused' : 'running';
  }

  /* ---------------- HUD ---------------- */
  function renderHUD() {
    $('#coins').textContent = String(Math.round(S.coins));
    $('#foodBadge').textContent = String(S.fishes);
    $('#petName').textContent = S.name;
    $('#days').textContent = String(Math.max(1, Math.floor((now() - S.born) / 86400000) + 1));
    setBar('food', S.food); setBar('mood', S.mood); setBar('energy', S.energy);
  }
  function setBar(k, v) {
    const u = $('#bar' + k.charAt(0).toUpperCase() + k.slice(1));
    if (!u) return;
    u.style.width = clamp(v, 0, 100) + '%';
    const bar = u.parentElement && u.parentElement.parentElement;
    if (bar) bar.classList.toggle('low', v < 22);
  }

  /* ---------------- 气泡 / Toast ---------------- */
  let bubbleTimer = 0;
  function say(text, ms) {
    const b = $('#bubble');
    b.textContent = text;
    b.classList.remove('hidden');
    requestAnimationFrame(() => b.classList.add('show'));
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => b.classList.remove('show'), ms || 1800);
  }
  let toastTimer = 0;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.remove('hidden');
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
  }

  /* ---------------- 粒子 ---------------- */
  const EMO = { heart: '💗', star: '✨', fish: '🐟', note: '🎵', anger: '💢' };
  function burst(kind, n) {
    const fx = $('#fx');
    const e = EMO[kind] || '✨';
    for (let i = 0; i < (n || 3); i++) {
      const p = document.createElement('div');
      p.className = 'pt';
      p.textContent = e;
      p.style.left = (28 + Math.random() * 44) + '%';
      p.style.top = (24 + Math.random() * 38) + '%';
      p.style.animationDelay = (i * 0.08) + 's';
      fx.appendChild(p);
      setTimeout(() => p.remove(), 1250);
    }
  }
  function anim(cls) {
    const w = $('#petWrap');
    w.classList.remove(cls);
    void w.offsetWidth;
    w.classList.add(cls);
    setTimeout(() => w.classList.remove(cls), 1200);
  }

  /* ---------------- 触摸/鼠标兼容（微信老内核没有 PointerEvent） ---------------- */
  let touchedAt = 0;
  function ptOf(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (t) return { x: t.clientX, y: t.clientY };
    return { x: e.clientX || 0, y: e.clientY || 0 };
  }
  function isSyntheticMouse() { return Date.now() - touchedAt < 900; }
  // 同时在 touch 与 mouse 上挂同一套回调，并过滤 touch 之后浏览器补发的鼠标事件
  function bindPress(el, h) {
    const stop = h.preventDefault !== false;
    el.addEventListener('touchstart', (e) => {
      touchedAt = Date.now();
      if (stop && e.cancelable) e.preventDefault();
      h.down && h.down(ptOf(e), e);
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      if (h.move) h.move(ptOf(e), e);
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      if (stop && e.cancelable) e.preventDefault();
      h.up && h.up(ptOf(e), e);
    }, { passive: false });
    el.addEventListener('touchcancel', () => { h.cancel && h.cancel(); });
    el.addEventListener('mousedown', (e) => {
      if (isSyntheticMouse()) return;
      if (stop) e.preventDefault();
      h.down && h.down(ptOf(e), e);
    });
    el.addEventListener('mousemove', (e) => {
      if (isSyntheticMouse()) return;
      if (h.move) h.move(ptOf(e), e);
    });
    el.addEventListener('mouseup', (e) => {
      if (isSyntheticMouse()) return;
      h.up && h.up(ptOf(e), e);
    });
    el.addEventListener('mouseleave', () => { h.cancel && h.cancel(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // 简易点击（不做长按/拖动）
  function onTap(el, fn) {
    let down = false;
    bindPress(el, {
      down: () => { down = true; },
      up: (p, e) => { if (down) { down = false; fn(p, e); } },
      cancel: () => { down = false; }
    });
  }
  // 批量挂事件并返回解绑函数
  function listen(el, events, fn, opts) {
    events.forEach((t) => el.addEventListener(t, fn, opts));
    return () => events.forEach((t) => el.removeEventListener(t, fn, opts));
  }

  /* ---------------- 摸摸互动 ---------------- */
  let tapCount = 0, tapWindow = 0, pressTimer = 0, longPressed = false, downXY = null;

  const LINES = {
    head: ['嘿嘿…舒服', '再摸摸头嘛', '咕噜咕噜…', '嗯～就是这儿'],
    face: ['唔…鼻子痒', '别戳脸啦', '阿嚏！', '你离得好近'],
    body: ['哈哈哈别挠了', '肚皮不许碰！', '痒痒痒…', '嘿嘿嘿'],
    rub: ['呼噜呼噜…', '好暖…', '就赖着你了', '再待一会儿'],
    annoy: ['别戳我啦！', '烦了哦！', '再戳我就跑了'],
    hungry: ['饿疯了…小鱼干！', '再不吃我要咬人了', '咕…肚子在叫'],
    sleep: ['困…让我睡会儿', '呼…呼…']
  };

  function onPetDown(p) {
    Audio1.boot();
    const w = $('#petWrap');
    const r = w.getBoundingClientRect();
    downXY = { x: p.x, y: p.y };
    longPressed = false;
    const ratio = clamp((p.y - r.top) / Math.max(1, r.height), 0, 1);
    w.dataset.zone = ratio < 0.38 ? 'head' : (ratio < 0.72 ? 'face' : 'body');
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { longPressed = true; doRub(); }, 620);
  }
  function onPetUp(p) {
    clearTimeout(pressTimer);
    if (longPressed) { downXY = null; return; }
    if (!downXY) return;
    const dx = p.x - downXY.x, dy = p.y - downXY.y;
    const zone = $('#petWrap').dataset.zone || 'head';
    downXY = null;
    if (dx * dx + dy * dy > 400) return;
    doTap(zone);
  }
  function onPetMove(p) {
    if (!downXY) return;
    const dx = p.x - downXY.x, dy = p.y - downXY.y;
    if (dx * dx + dy * dy > 200) clearTimeout(pressTimer);
  }
  function onPetCancel() { clearTimeout(pressTimer); downXY = null; }

  function doTap(zone) {
    if (S.energy < 18) { say(pick(LINES.sleep)); setFace('bored', 1400); return; }
    const t = now();
    if (t - tapWindow > 2200) tapCount = 0;
    tapWindow = t; tapCount++;

    if (tapCount >= 5) {
      tapCount = 0;
      S.mood = clamp(S.mood - 8, 0, 100);
      S.energy = clamp(S.energy - 1, 0, 100);
      S.stats.pet++;
      setFace('bored', 1600); anim('shake'); burst('anger', 2);
      say(pick(LINES.annoy)); Audio1.bad();
      renderHUD(); renderFace(); save();
      return;
    }

    if (S.food < 28 && Math.random() < 0.5) {
      say(pick(LINES.hungry)); setFace('hungry', 1500); burst('sweat', 2); Audio1.pet();
      S.mood = clamp(S.mood - 0.5, 0, 100); renderHUD(); save(); return;
    }

    if (zone === 'head') { S.mood += 2.4; S.energy += 0.4; }
    else if (zone === 'face') { S.mood += 1.4; }
    else { S.mood += 3; }
    S.mood = clamp(S.mood, 0, 100);
    S.energy = clamp(S.energy, 0, 100);
    S.stats.pet++;

    setFace('happy', 1600);
    if (zone === 'face') { anim('squash'); burst('star', 2); }
    else if (zone === 'body') { anim('hop'); burst('heart', 4); }
    else { anim('hop'); burst('heart', 3); }
    say(pick(LINES[zone])); Audio1.pet();
    $('#hint').classList.add('off');
    renderHUD(); renderFace(); save();
  }

  function doRub() {
    if (S.energy < 12) { say(pick(LINES.sleep)); return; }
    S.mood = clamp(S.mood + 6, 0, 100);
    S.energy = clamp(S.energy - 1.5, 0, 100);
    S.stats.pet += 2;
    setFace('happy', 2600); anim('nudge'); burst('heart', 6);
    say(pick(LINES.rub), 2200); Audio1.rub();
    renderHUD(); renderFace(); save();
  }

  /* ---------------- 喂食 ---------------- */
  function feed() {
    if (S.fishes <= 0) {
      toast('没有小鱼干了，去玩小游戏赚吧');
      Audio1.bad();
      openSheet('games');
      return;
    }
    if (S.food >= 97) { say('吃不下了…嗝'); setFace('bored', 1400); return; }
    S.fishes--;
    S.food = clamp(S.food + 16, 0, 100);
    S.mood = clamp(S.mood + 4.5, 0, 100);
    S.stats.feed++;
    setFace('hungry', 700);
    setTimeout(() => { setFace('happy', 1800); burst('fish', 4); }, 620);
    anim('squash');
    say(pick(['啊呜一口！', '小鱼干最好吃了', '再来一条嘛～', '吧唧吧唧…']));
    Audio1.eat();
    renderHUD(); renderFace(); save();
  }

  /* ---------------- 家具 ---------------- */
  const FURNI = [
    { id: 'box', emoji: '📦', name: '纸箱', price: 15, s: 1, desc: '兔子最爱的窝' },
    { id: 'plant', emoji: '🪴', name: '绿植', price: 25, s: 1, desc: '让小屋有生气' },
    { id: 'dango', emoji: '🍡', name: '团子垫', price: 30, s: 0.9, desc: '软乎乎' },
    { id: 'lamp', emoji: '💡', name: '落地灯', price: 35, s: 1, desc: '暖黄的光' },
    { id: 'sofa', emoji: '🛋️', name: '懒人沙发', price: 40, s: 1.2, desc: '一起瘫着' },
    { id: 'moon', emoji: '🌙', name: '星月挂饰', price: 45, s: 0.9, desc: '夜里会亮' },
    { id: 'bear', emoji: '🧸', name: '玩偶熊', price: 50, s: 0.9, desc: '陪睡担当' },
    { id: 'wind', emoji: '🎐', name: '风铃', price: 55, s: 0.9, desc: '有风就响' },
    { id: 'tank', emoji: '🐠', name: '小鱼缸', price: 60, s: 1.1, desc: '看着就解馋' }
  ];
  const FMAP = {};
  FURNI.forEach((f) => { FMAP[f.id] = f; });

  function renderFurniture() {
    const box = $('#furniture');
    box.innerHTML = '';
    S.placed.forEach((p, i) => {
      const f = FMAP[p.id];
      if (!f) return;
      const d = document.createElement('div');
      d.className = 'furni' + (p.flip ? ' flip' : '');
      d.style.left = p.x + '%';
      d.style.top = p.y + '%';
      d.style.fontSize = (30 * (p.s || f.s || 1)) + 'px';
      d.style.zIndex = String(Math.round(p.y));
      d.dataset.i = String(i);
      d.textContent = f.emoji;
      box.appendChild(d);
    });
  }

  /* ---------------- 弹层 ---------------- */
  let sheetKind = null;
  function openSheet(kind) {
    sheetKind = kind;
    $('#sheetTitle').textContent = kind === 'games' ? '小游戏' : '我的小窝';
    if (kind === 'games') renderGamesSheet(); else renderNestSheet();
    $('#sheetMask').classList.remove('hidden');
    $('#sheet').classList.remove('hidden');
    requestAnimationFrame(() => {
      $('#sheetMask').classList.add('show');
      $('#sheet').classList.add('show');
    });
  }
  function closeSheet() {
    sheetKind = null;
    $('#sheetMask').classList.remove('show');
    $('#sheet').classList.remove('show');
    setTimeout(() => {
      $('#sheetMask').classList.add('hidden');
      $('#sheet').classList.add('hidden');
    }, 300);
  }
  function refreshSheet() {
    if (!sheetKind) return;
    if (sheetKind === 'games') renderGamesSheet(); else renderNestSheet();
  }

  function renderGamesSheet() {
    const b = $('#sheetBody');
    b.innerHTML = `
      <div class="cards">
        <div class="card" data-game="hide">
          <div class="big">🎵</div>
          <h3>躲猫猫</h3>
          <p>纸箱先抖一下，饿疯兔从哪探头就点哪只。纸片兔别点！</p>
          <div class="best">最佳 ${S.best.hide} 分</div>
        </div>
        <div class="card" data-game="stack">
          <div class="big">📦</div>
          <h3>堆纸箱</h3>
          <p>看准时机点一下，把纸箱一层层叠高，歪了会塌。</p>
          <div class="best">最佳 ${S.best.stack} 层</div>
        </div>
        <div class="card" data-game="catch">
          <div class="big">🐟</div>
          <h3>接小鱼</h3>
          <p>左右移动接住小鱼干，辣椒会扣命，一共三条命。</p>
          <div class="best">最佳 ${S.best.catch} 条</div>
        </div>
      </div>
      <p class="tip">赚到的 <b>小鱼干</b> 可以在「小窝」买家具，也能喂给饿疯兔。</p>`;
    b.querySelectorAll('[data-game]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.game;
        closeSheet();
        setTimeout(() => startGame(id), 260);
      });
    });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderNestSheet() {
    const b = $('#sheetBody');
    const editing = $('#room').classList.contains('editing');
    let html = `
      <div class="row">
        <button class="btn primary" id="editToggle">${editing ? '✓ 完成布置' : '✥ 布置房间'}</button>
        <button class="btn" id="renameBtn">✎ 改名</button>
      </div>
      <p class="tip">${editing ? '拖动家具摆位置，选中后可缩放 / 镜像 / 收起。' : '点「布置房间」可以拖动家具。'}</p>
      <div id="renameBox" class="hidden">
        <input id="renameInput" class="field" maxlength="8" value="${escapeHTML(S.name)}" placeholder="给它改个名字">
        <div class="row">
          <button class="btn primary" id="renameOk">确定</button>
          <button class="btn" id="renameCancel">取消</button>
        </div>
      </div>
      <div class="cards" style="margin-top:12px">`;
    FURNI.forEach((f) => {
      const owned = S.owned.indexOf(f.id) >= 0;
      const can = S.coins >= f.price;
      html += `<div class="card ${owned ? 'owned' : ''} ${!owned && !can ? 'locked' : ''}" data-buy="${f.id}">
        ${owned ? '' : `<div class="price">🐟 ${f.price}</div>`}
        <div class="big">${f.emoji}</div>
        <h3>${f.name}${owned ? ' ✓' : ''}</h3>
        <p>${f.desc}</p>
      </div>`;
    });
    html += `</div>
      <div class="row" style="margin-top:14px">
        <button class="btn" id="soundBtn">${S.sound ? '🔊 音效开' : '🔇 音效关'}</button>
        <button class="btn" id="exportBtn">⬇ 导出存档</button>
      </div>
      <div class="row">
        <button class="btn" id="importBtn">⬆ 导入存档</button>
        <button class="btn" id="resetBtn">🗑 重新开始</button>
      </div>
      <p class="tip">进度存在你这台设备的浏览器里${memOnly ? '（当前环境不支持本地存档，仅本次有效）' : ''}。换设备可以导出/导入。</p>`;
    b.innerHTML = html;

    b.querySelectorAll('[data-buy]').forEach((el) => {
      el.addEventListener('click', () => buyFurni(el.dataset.buy));
    });
    $('#editToggle').addEventListener('click', () => {
      setEditing(!$('#room').classList.contains('editing'));
      renderNestSheet();
    });
    $('#renameBtn').addEventListener('click', () => {
      const box = $('#renameBox');
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) {
        const inp = $('#renameInput');
        inp.focus();
      }
    });
    $('#renameOk').addEventListener('click', () => {
      const inp = $('#renameInput');
      const n = (inp.value || '').trim().slice(0, 8);
      if (n) { S.name = n; save(); renderHUD(); }
      renderNestSheet();
    });
    $('#renameCancel').addEventListener('click', () => renderNestSheet());
    $('#soundBtn').addEventListener('click', () => {
      S.sound = !S.sound;
      Audio1.on = S.sound;
      if (S.sound) Audio1.good();
      save(); renderNestSheet();
    });
    $('#exportBtn').addEventListener('click', exportSave);
    $('#importBtn').addEventListener('click', importSave);
    // 微信里 confirm/prompt 会被拦，改成「点两次」
    let resetArmed = 0;
    $('#resetBtn').addEventListener('click', () => {
      const btn = $('#resetBtn');
      if (Date.now() - resetArmed > 3000) {
        resetArmed = Date.now();
        btn.textContent = '⚠️ 再点一次清空';
        btn.classList.add('danger');
        setTimeout(() => {
          if (Date.now() - resetArmed >= 3000) {
            btn.textContent = '🗑 重新开始';
            btn.classList.remove('danger');
          }
        }, 3100);
        return;
      }
      try { localStorage.removeItem(KEY); } catch (e) {}
      location.reload();
    });
  }

  function buyFurni(id) {
    const f = FMAP[id];
    if (!f) return;
    if (S.owned.indexOf(id) >= 0) {
      S.placed.push(placeOne(id));
      save(); renderFurniture();
      toast(f.name + ' 又摆了一个');
      return;
    }
    if (S.coins < f.price) { toast('小鱼干不够，先去玩小游戏'); Audio1.bad(); return; }
    S.coins -= f.price;
    S.owned.push(id);
    S.placed.push(placeOne(id));
    Audio1.coin();
    toast('买到了 ' + f.name + '！');
    save(); renderHUD(); renderFurniture(); refreshSheet();
    const box = $('#coinBox');
    box.classList.add('bump');
    setTimeout(() => box.classList.remove('bump'), 400);
  }
  function placeOne(id) {
    const f = FMAP[id];
    return {
      id: id,
      x: clamp(rnd(24, 76), 10, 90),
      y: clamp(rnd(64, 86), 40, 94),
      s: f.s || 1,
      flip: Math.random() < 0.4 ? 1 : 0
    };
  }

  /* ---------------- 布置模式 ---------------- */
  let selIndex = -1;
  function setEditing(on) {
    $('#room').classList.toggle('editing', on);
    if (!on) { selIndex = -1; ctrlHide(); save(); }
    else { ctrlCreate(); }
  }
  function ctrlCreate() {
    if (document.getElementById('furniCtrl')) return;
    const d = document.createElement('div');
    d.id = 'furniCtrl';
    d.className = 'furni-ctrl hidden';
    d.innerHTML = '<button data-c="big">➕</button><button data-c="small">➖</button><button data-c="flip">⇄</button><button data-c="del">✕</button>';
    $('#room').appendChild(d);
    d.addEventListener('click', (e) => {
      const c = e.target.dataset && e.target.dataset.c;
      if (!c || selIndex < 0) return;
      const p = S.placed[selIndex];
      if (!p) return;
      if (c === 'big') p.s = clamp((p.s || 1) * 1.15, 0.4, 3);
      if (c === 'small') p.s = clamp((p.s || 1) / 1.15, 0.4, 3);
      if (c === 'flip') p.flip = p.flip ? 0 : 1;
      if (c === 'del') {
        S.placed.splice(selIndex, 1);
        selIndex = -1; ctrlHide(); renderFurniture(); save(); return;
      }
      renderFurniture(); ctrlShow(); save();
    });
  }
  function ctrlShow() { const c = document.getElementById('furniCtrl'); if (c) c.classList.remove('hidden'); }
  function ctrlHide() { const c = document.getElementById('furniCtrl'); if (c) c.classList.add('hidden'); }

  function initFurniDrag() {
    const box = $('#furniture');
    let dragging = -1;
    bindPress(box, {
      down: (p, e) => {
        if (!$('#room').classList.contains('editing')) return;
        const el = e.target.closest ? e.target.closest('.furni') : null;
        if (!el) return;
        dragging = Number(el.dataset.i);
        selIndex = dragging;
        $$('.furni').forEach((n) => n.classList.remove('sel'));
        el.classList.add('sel');
        ctrlShow();
      },
      move: (p) => {
        if (dragging < 0) return;
        const r = $('#room').getBoundingClientRect();
        const it = S.placed[dragging];
        if (!it) return;
        it.x = clamp(((p.x - r.left) / r.width) * 100, 6, 94);
        it.y = clamp(((p.y - r.top) / r.height) * 100, 12, 96);
        renderFurniture();
        const el = box.querySelector('[data-i="' + dragging + '"]');
        if (el) el.classList.add('sel');
      },
      up: () => { if (dragging >= 0) { dragging = -1; save(); } },
      cancel: () => { dragging = -1; }
    });
  }

  /* ---------------- 存档导入导出（微信里不能用下载，改成文本框复制/粘贴） ---------------- */
  function showSaveBox(mode) {
    const isExport = mode === 'export';
    const box = document.createElement('div');
    box.className = 'save-box';
    box.innerHTML = `
      <div class="save-panel">
        <h2>${isExport ? '导出存档' : '导入存档'}</h2>
        <p class="tip">${isExport ? '长按文本框「全选 → 复制」，粘到微信收藏或文件传输助手，换手机时再粘贴回来。' : '把之前复制的存档内容整段粘进来，点导入。'}</p>
        <textarea class="field" id="saveText" ${isExport ? 'readonly' : ''} placeholder="${isExport ? '' : '在这里长按粘贴存档…'}">${isExport ? escapeHTML(JSON.stringify(S)) : ''}</textarea>
        <div class="row">
          <button class="btn primary" id="saveOk">${isExport ? '复制' : '导入'}</button>
          <button class="btn" id="saveClose">关闭</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    const ta = box.querySelector('#saveText');
    const close = () => { box.parentNode && box.parentNode.removeChild(box); };
    box.querySelector('#saveClose').onclick = close;
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    box.querySelector('#saveOk').onclick = () => {
      if (isExport) {
        ta.removeAttribute('readonly');
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        let ok = false;
        try { ok = document.execCommand && document.execCommand('copy'); } catch (e) {}
        ta.setAttribute('readonly', 'readonly');
        if (ok) { toast('已复制，去微信里粘贴吧'); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ta.value).then(
            () => toast('已复制，去微信里粘贴吧'),
            () => toast('复制失败，请长按文本框全选复制')
          );
          return;
        }
        toast('请长按文本框全选复制');
        return;
      }
      // 导入
      const raw = (ta.value || '').trim();
      if (!raw) { toast('先粘贴存档内容'); return; }
      try {
        const o = JSON.parse(raw);
        S = Object.assign({}, DEF, o);
        S.best = Object.assign({}, DEF.best, o.best || {});
        S.stats = Object.assign({}, DEF.stats, o.stats || {});
        if (!Array.isArray(S.owned)) S.owned = [];
        if (!Array.isArray(S.placed)) S.placed = [];
        save(); renderHUD(); renderFurniture(); renderFace(); refreshSheet();
        toast('存档已导入');
        close();
      } catch (e) {
        toast('存档内容读不出来');
      }
    };
  }
  function exportSave() { showSaveBox('export'); }
  function importSave() { showSaveBox('import'); }

  /* =========================================================
     小游戏框架
     ========================================================= */
  const GL = {
    layer: null, stage: null, overlay: null, cur: null, score: 0,
    setScore(n) { this.score = n; const el = $('#gameScore'); if (el) el.textContent = String(n); },
    open() {
      this.layer = $('#gameLayer');
      this.stage = $('#gameStage');
      this.overlay = $('#gameOverlay');
      this.layer.classList.remove('hidden');
      requestAnimationFrame(() => this.layer.classList.add('show'));
    },
    close() {
      if (this.cur && this.cur.stop) this.cur.stop();
      this.cur = null;
      this.layer.classList.remove('show');
      setTimeout(() => this.layer.classList.add('hidden'), 240);
    },
    panel(html) {
      this.overlay.innerHTML = '<div class="panel">' + html + '</div>';
      this.overlay.classList.remove('hidden');
    },
    hidePanel() {
      this.overlay.classList.add('hidden');
      this.overlay.innerHTML = '';
    }
  };

  function startGame(id) {
    GL.open();
    GL.hidePanel();
    GL.stage.innerHTML = '';
    GL.setScore(0);
    const g = GAME[id];
    if (!g) return;
    GL.cur = g;
    g.start();
  }

  /* ---------------- 躲猫猫 ---------------- */
  const GameHide = {
    timers: [], tick: 0, playing: false, combo: 0, earned: 0, left: 60, boxes: [],
    start() {
      this.stop();
      this.playing = true;
      this.combo = 0; this.earned = 0; this.left = 60; this.boxes = [];
      $('#gameTitle').textContent = '躲猫猫';
      const st = GL.stage;
      st.innerHTML = `
        <div class="hide-clock">⏱ <b id="hClock">60</b></div>
        <div class="combo" id="hCombo"></div>
        <div class="hide-row" id="hRow"></div>`;
      const row = st.querySelector('#hRow');
      for (let i = 0; i < 4; i++) {
        const b = document.createElement('div');
        b.className = 'box';
        b.dataset.open = '0';
        b.innerHTML = '<div class="lid"></div><img class="face" alt="">';
        onTap(b, () => this.hit(i));
        row.appendChild(b);
        this.boxes.push(b);
      }
      this.tick = setInterval(() => {
        if (!this.playing) return;
        this.left--;
        const c = $('#hClock'); if (c) c.textContent = String(this.left);
        if (this.left <= 0) this.finish();
      }, 1000);
      this.later(() => this.newPeek(), 600);
    },
    later(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; },
    newPeek() {
      if (!this.playing) return;
      const idx = rint(0, this.boxes.length - 1);
      const box = this.boxes[idx];
      const isDud = Math.random() < 0.22;
      const face = box.querySelector('.face');
      face.src = pick([FACE.happy, FACE.hungry, FACE.bored]);
      box.dataset.dud = isDud ? '1' : '0';
      box.classList.toggle('dud', isDud);
      box.dataset.open = '0';
      box.classList.add('shake');
      this.later(() => box.classList.remove('shake'), 420);
      this.later(() => {
        if (!this.playing) return;
        box.classList.add('peek');
        box.dataset.open = '1';
        const win = Math.max(620, 1180 - this.earned * 12);
        this.later(() => {
          if (!this.playing) return;
          if (box.dataset.open === '1') {
            box.classList.remove('peek');
            box.dataset.open = '0';
            this.combo = 0; this.showCombo(0);
          }
          this.later(() => this.newPeek(), rnd(300, 620));
        }, win);
      }, 430);
    },
    hit(i) {
      if (!this.playing) return;
      const box = this.boxes[i];
      if (box.dataset.open !== '1') {
        this.combo = 0; this.showCombo(0);
        box.classList.add('shake');
        this.later(() => box.classList.remove('shake'), 400);
        Audio1.bad();
        return;
      }
      box.dataset.open = '0';
      box.classList.remove('peek');
      box.classList.add('hit');
      this.later(() => box.classList.remove('hit'), 320);
      if (box.dataset.dud === '1') {
        this.combo = 0; this.showCombo(0); Audio1.bad();
        toast('那是纸片兔！');
        return;
      }
      this.combo++;
      let gain = 2;
      if (this.combo >= 3) gain++;
      if (this.combo >= 6) gain++;
      this.earned += gain;
      GL.setScore(this.earned);
      Audio1.good();
      this.showCombo(this.combo);
    },
    showCombo(n) {
      const c = $('#hCombo');
      if (!c) return;
      if (n >= 2) { c.textContent = '×' + n + ' 连击'; c.classList.add('show'); }
      else c.classList.remove('show');
    },
    finish() {
      if (!this.playing) return;
      this.playing = false;
      this.stop();
      const score = this.earned;
      const newBest = score > S.best.hide;
      S.best.hide = Math.max(S.best.hide, score);
      S.coins += score;
      S.fishes += Math.floor(score / 10);
      S.mood = clamp(S.mood + 6, 0, 100);
      S.energy = clamp(S.energy - 6, 0, 100);
      S.stats.play++;
      save(); renderHUD(); renderFace();
      Audio1.coin();
      GL.panel(`
        <h2>时间到！</h2>
        <div class="big">🐟 +${score}</div>
        <p>${newBest ? '新纪录！' : '最佳 ' + S.best.hide + ' 分'}　额外 ${Math.floor(score / 10)} 条小鱼干</p>
        <div class="row">
          <button class="btn primary" id="pAgain">再来一局</button>
          <button class="btn" id="pBack">回小屋</button>
        </div>`);
      $('#pAgain').onclick = () => { GL.hidePanel(); this.start(); };
      $('#pBack').onclick = () => GL.close();
    },
    stop() {
      this.playing = false;
      clearInterval(this.tick);
      this.timers.forEach(clearTimeout);
      this.timers = [];
    }
  };

  /* ---------------- 堆纸箱 ---------------- */
  const GameStack = {
    playing: false, h: 0, earned: 0, boxW: 0, boxH: 0, x: 0, dir: 1, speed: 2.6,
    raf: 0, groundY: 0, topY: 0, swing: null, dropping: false, onKey: null, onTap: null,
    start() {
      this.stop();
      this.playing = true;
      this.h = 0; this.earned = 0; this.dropping = false;
      $('#gameTitle').textContent = '堆纸箱';
      const st = GL.stage;
      const w = st.clientWidth || 360, hh = st.clientHeight || 480;
      this.boxW = clamp(w * 0.26, 52, 92);
      this.boxH = this.boxW * 0.62;
      this.groundY = hh * 0.86;
      this.topY = this.groundY;
      this.startY = clamp(hh * 0.09, 40, 110);
      st.innerHTML = '<div class="stack-ground"></div><div class="height-tag">高度<b id="sH">0</b></div>';
      this.x = w / 2;
      this.dir = 1;
      this.speed = 2.6;
      const sw = document.createElement('div');
      sw.className = 'stack-swing';
      sw.style.width = this.boxW + 'px';
      sw.style.height = this.boxH + 'px';
      sw.innerHTML = '<div class="stack-box" style="width:100%;height:100%"></div>';
      st.appendChild(sw);
      this.swing = sw;
      GL.setScore(0);
      this.onKey = (e) => {
        if (e.code === 'Space' || e.code === 'ArrowDown') { e.preventDefault(); this.drop(); }
      };
      document.addEventListener('keydown', this.onKey);
      this.onTap = null;
      this.unTap = listen(st, ['touchstart', 'mousedown'], (e) => {
        if (e.type === 'touchstart' && e.cancelable) e.preventDefault();
        if (isSyntheticMouse()) return;
        this.drop();
      }, { passive: false });
      this.loop();
    },
    loop() {
      if (!this.playing) return;
      const st = GL.stage;
      const w = st.clientWidth;
      const amp = Math.max(0, w / 2 - this.boxW / 2 - 6);
      this.x += this.dir * this.speed * (1 + this.h * 0.05);
      if (this.x > w / 2 + amp) { this.x = w / 2 + amp; this.dir = -1; }
      if (this.x < w / 2 - amp) { this.x = w / 2 - amp; this.dir = 1; }
      if (this.swing) {
        this.swing.style.transform = 'translate3d(' + (this.x - this.boxW / 2) + 'px,' + this.startY + 'px,0)';
      }
      this.raf = requestAnimationFrame(() => this.loop());
    },
    drop() {
      if (!this.playing || this.dropping) return;
      this.dropping = true;
      const dropX = this.x;
      const targetY = this.topY - this.boxH;
      const el = this.swing;
      const self = this;
      let y = this.startY;
      this.swing.style.transition = 'none';
      (function fall() {
        if (!self.playing) return;
        y += 18;
        if (y < targetY) {
          el.style.transform = 'translate3d(' + (dropX - self.boxW / 2) + 'px,' + y + 'px,0)';
          requestAnimationFrame(fall);
        } else {
          el.style.transform = 'translate3d(' + (dropX - self.boxW / 2) + 'px,' + targetY + 'px,0)';
          self.land(dropX, targetY);
        }
      })();
    },
    land(dropX, y) {
      const st = GL.stage;
      const center = st.clientWidth / 2;
      const offset = Math.abs(dropX - center);
      if (offset > this.boxW * 0.62) {
        this.swing.style.transition = 'transform .45s ease, opacity .45s';
        this.swing.style.transform += ' rotate(40deg)';
        this.swing.style.opacity = '0';
        Audio1.bad();
        setTimeout(() => this.finish(), 560);
        return;
      }
      const b = document.createElement('div');
      b.className = 'stack-box';
      b.style.width = this.boxW + 'px';
      b.style.height = this.boxH + 'px';
      b.style.left = (dropX - this.boxW / 2) + 'px';
      b.style.top = y + 'px';
      st.appendChild(b);
      this.h++;
      let gain = 1;
      if (offset < this.boxW * 0.12) { gain = 2; }
      this.earned += gain;
      GL.setScore(this.h);
      const tag = $('#sH'); if (tag) tag.textContent = String(this.h);
      Audio1.good();
      if (offset < this.boxW * 0.12) burstStack(st, dropX, y);
      this.topY = y;
      this.speed = Math.min(2.6 + this.h * 0.22, 8);
      setTimeout(() => {
        if (!this.playing) return;
        this.dropping = false;
        this.x = st.clientWidth / 2;
      }, 130);
    },
    finish() {
      if (!this.playing) return;
      this.playing = false;
      this.stop();
      const score = this.h;
      const newBest = score > S.best.stack;
      S.best.stack = Math.max(S.best.stack, score);
      S.coins += this.earned;
      S.fishes += Math.floor(score / 5);
      S.mood = clamp(S.mood + 5, 0, 100);
      S.energy = clamp(S.energy - 5, 0, 100);
      S.stats.play++;
      save(); renderHUD(); renderFace();
      Audio1.coin();
      GL.panel(`
        <h2>纸箱塌了…</h2>
        <div class="big">📦 ${score} 层</div>
        <p>${newBest ? '新纪录！' : '最佳 ' + S.best.stack + ' 层'}　获得 🐟 +${this.earned}，额外 ${Math.floor(score / 5)} 条小鱼干</p>
        <div class="row">
          <button class="btn primary" id="pAgain">再来一局</button>
          <button class="btn" id="pBack">回小屋</button>
        </div>`);
      $('#pAgain').onclick = () => { GL.hidePanel(); this.start(); };
      $('#pBack').onclick = () => GL.close();
    },
    stop() {
      this.playing = false;
      cancelAnimationFrame(this.raf);
      if (this.onKey) document.removeEventListener('keydown', this.onKey);
      if (this.unTap) { this.unTap(); this.unTap = null; }
      this.onKey = null; this.onTap = null;
    }
  };
  function burstStack(st, x, y) {
    const p = document.createElement('div');
    p.className = 'pt';
    p.textContent = '✨';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    st.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }

  /* ---------------- 接小鱼 ---------------- */
  const GameCatch = {
    playing: false, score: 0, lives: 3, left: 45, catcher: null, cx: 0,
    items: [], raf: 0, tick: 0, last: 0, spawnTimer: 0, onKey: null, onMove: null,
    start() {
      this.stop();
      this.playing = true;
      this.score = 0; this.lives = 3; this.left = 45; this.items = [];
      $('#gameTitle').textContent = '接小鱼';
      const st = GL.stage;
      st.innerHTML = `
        <div class="lives" id="cLives">💗💗💗</div>
        <div class="catch-clock">⏱<b><span id="cLeft">45</span>s</b></div>
        <div class="catcher" id="catcher"><img src="ef-assets/pet-hungry.png" alt=""></div>`;
      this.catcher = st.querySelector('#catcher');
      this.cx = st.clientWidth / 2;
      this.catcher.style.left = this.cx + 'px';
      GL.setScore(0);
      this.onMove = (e) => {
        const r = st.getBoundingClientRect();
        const p = ptOf(e);
        this.cx = clamp(p.x - r.left, 40, r.width - 40);
        this.catcher.style.left = this.cx + 'px';
      };
      this.unMove = listen(st, ['touchmove', 'touchstart', 'mousemove', 'mousedown'], (e) => {
        if ((e.type === 'touchstart' || e.type === 'touchmove') && e.cancelable) e.preventDefault();
        if (isSyntheticMouse() && e.type.indexOf('mouse') === 0) return;
        this.onMove(e);
      }, { passive: false });
      this.onKey = (e) => {
        const step = 34;
        if (e.key === 'ArrowLeft' || e.key === 'a') { this.cx = clamp(this.cx - step, 40, st.clientWidth - 40); }
        if (e.key === 'ArrowRight' || e.key === 'd') { this.cx = clamp(this.cx + step, 40, st.clientWidth - 40); }
        this.catcher.style.left = this.cx + 'px';
      };
      document.addEventListener('keydown', this.onKey);
      this.tick = setInterval(() => {
        if (!this.playing) return;
        this.left--;
        const c = $('#cLeft'); if (c) c.textContent = String(this.left);
        if (this.left <= 0) this.finish();
      }, 1000);
      this.last = performance.now();
      this.spawnTimer = 0;
      this.loop(this.last);
    },
    loop(t) {
      if (!this.playing) return;
      const dt = Math.min(48, t - this.last) / 16.67;
      this.last = t;
      const st = GL.stage;
      const w = st.clientWidth, h = st.clientHeight;
      this.spawnTimer += dt;
      if (this.spawnTimer > 34) {
        this.spawnTimer = 0;
        const bad = Math.random() < 0.22;
        const el = document.createElement('div');
        el.className = 'fish-item';
        el.textContent = bad ? '🌶️' : '🐟';
        const x = rnd(26, w - 26);
        el.style.left = x + 'px';
        el.style.top = '-30px';
        st.appendChild(el);
        this.items.push({ el: el, x: x, y: -30, vy: rnd(2.2, 3.4) + this.score * 0.02, bad: bad });
      }
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.y += it.vy * dt;
        it.el.style.top = it.y + 'px';
        if (it.y > h - 118 && it.y < h - 42 && Math.abs(it.x - this.cx) < 50) {
          if (it.bad) this.loseLife();
          else { this.score++; GL.setScore(this.score); Audio1.coin(); }
          it.el.remove(); this.items.splice(i, 1); continue;
        }
        if (it.y > h + 20) { it.el.remove(); this.items.splice(i, 1); }
      }
      this.raf = requestAnimationFrame((tt) => this.loop(tt));
    },
    loseLife() {
      this.lives--;
      Audio1.bad();
      const l = $('#cLives');
      if (l) l.textContent = '💗'.repeat(Math.max(0, this.lives)) + '🖤'.repeat(Math.max(0, 3 - this.lives));
      if (this.lives <= 0) this.finish();
    },
    finish() {
      if (!this.playing) return;
      this.playing = false;
      this.stop();
      const score = this.score;
      const newBest = score > S.best.catch;
      S.best.catch = Math.max(S.best.catch, score);
      S.coins += score;
      S.fishes += Math.floor(score / 8);
      S.mood = clamp(S.mood + 5, 0, 100);
      S.energy = clamp(S.energy - 5, 0, 100);
      S.stats.play++;
      save(); renderHUD(); renderFace();
      Audio1.coin();
      GL.panel(`
        <h2>${this.lives <= 0 ? '被辣椒辣到了…' : '时间到！'}</h2>
        <div class="big">🐟 ${score} 条</div>
        <p>${newBest ? '新纪录！' : '最佳 ' + S.best.catch + ' 条'}　获得 🐟 +${score}，额外 ${Math.floor(score / 8)} 条小鱼干</p>
        <div class="row">
          <button class="btn primary" id="pAgain">再来一局</button>
          <button class="btn" id="pBack">回小屋</button>
        </div>`);
      $('#pAgain').onclick = () => { GL.hidePanel(); this.start(); };
      $('#pBack').onclick = () => GL.close();
    },
    stop() {
      this.playing = false;
      cancelAnimationFrame(this.raf);
      clearInterval(this.tick);
      if (this.onKey) document.removeEventListener('keydown', this.onKey);
      if (this.unMove) { this.unMove(); this.unMove = null; }
      this.onKey = null; this.onMove = null;
      this.items.forEach((i) => { try { i.el.remove(); } catch (e) {} });
      this.items = [];
    }
  };

  const GAME = { hide: GameHide, stack: GameStack, catch: GameCatch };

  /* ---------------- 心跳：衰减 + 自动存档 ---------------- */
  function startLoop() {
    setInterval(() => {
      S.food = clamp(S.food - RATE.food * 0.1, 0, 100);
      S.energy = clamp(S.energy - RATE.energy * 0.1, 0, 100);
      S.mood = clamp(S.mood - RATE.mood * 0.1 - (S.food < 25 ? 0.05 : 0), 0, 100);
      renderHUD(); renderFace();
    }, 6000);
    setInterval(() => save(), 8000);
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    const w = $('#petWrap');
    bindPress(w, { down: onPetDown, up: onPetUp, move: onPetMove, cancel: onPetCancel });

    $('.dock').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'pet') doTap('head');
      else if (act === 'feed') feed();
      else if (act === 'games') openSheet('games');
      else if (act === 'nest') openSheet('nest');
    });

    $('#sheetClose').addEventListener('click', closeSheet);
    $('#sheetMask').addEventListener('click', closeSheet);
    $('#gameBack').addEventListener('click', () => GL.close());
    $('#gameSound').addEventListener('click', () => {
      S.sound = !S.sound;
      Audio1.on = S.sound;
      $('#gameSound').textContent = S.sound ? '🔊' : '🔇';
      save();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { S.lastTick = now(); save(); }
      else { applyOffline(); renderHUD(); renderFace(); }
    });
    window.addEventListener('pagehide', () => { save(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#gameLayer').classList.contains('hidden')) GL.close();
        else if (sheetKind) closeSheet();
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    loadSave();
    Audio1.on = S.sound !== false;
    $('#gameSound').textContent = S.sound ? '🔊' : '🔇';
    applyOffline();
    renderHUD();
    renderFurniture();
    renderFace();
    initFurniDrag();
    bind();
    startLoop();
    setTimeout(() => {
      if (S.food < 30) say('饿疯了…有小鱼干吗');
      else if (S.energy < 25) say('好困…');
      else say('你回来啦');
    }, 900);
    setTimeout(() => $('#hint').classList.add('off'), 9000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 调试入口：方便排查问题，不影响正常游玩 */
  window.__EF = { get state() { return S; }, gl: GL, games: GAME, feed: feed, save: save };

})();
