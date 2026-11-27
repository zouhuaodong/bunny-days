(function(){
'use strict';

var $ = function(s, el){ return (el||document).querySelector(s); };
var $$ = function(s, el){ return Array.prototype.slice.call((el||document).querySelectorAll(s)); };
var clamp = function(n,a,b){ a=a==null?0:a; b=b==null?100:b; return Math.max(a,Math.min(b,n)); };
var rand = function(a,b){ return a + Math.random()*(b-a); };
var pick = function(arr){ return arr[Math.floor(Math.random()*arr.length)]; };
var stage = $('#stage');
var petWrap = $('#petWrap');
var petImg = $('#petImg');
var petAcc = $('#petAcc');
var speech = $('#speech');
var fxLayer = $('#fxLayer');
var overlayRoot = $('#overlayRoot');
var gameRoot = $('#gameRoot');
var toastEl = $('#toast');
var nightLayer = $('#nightLayer');

var W = 500, H = 1000;
var KEY = 'rabbit-house-game-v1';
var state = null;
var audioCtx = null, master = null, purrNodes = null;
var soundOn = true;
var sleeping = false, uiLocked = false, petting = false;
var petCounted = false, petMoves = 0, petGainTimer = 0, petHeartTimer = 0;
var speechTimer = null, toastTimer = null;
var mini = null;
var battle = null;

var OUTFITS = {
  none: {name:'不戴', emoji:'🚫', price:0, style:''},
  flower: {name:'小花', emoji:'🌸', price:0, style:'left:34%;top:12%;font-size:44px;transform:rotate(-12deg)'},
  scarf: {name:'围巾', emoji:'🧣', price:40, style:'left:12%;top:57%;font-size:58px;transform:rotate(-9deg)'},
  crown: {name:'小皇冠', emoji:'👑', price:120, style:'left:38%;top:2%;font-size:48px;transform:rotate(-4deg)'},
  bow: {name:'蝴蝶结', emoji:'🎀', price:60, style:'left:57%;top:24%;font-size:34px;transform:rotate(9deg)'},
  sunglasses: {name:'墨镜', emoji:'🕶️', price:80, style:'left:22%;top:41%;font-size:42px;transform:rotate(-4deg)'},
  star: {name:'星星', emoji:'⭐', price:50, style:'left:52%;top:13%;font-size:31px;transform:rotate(12deg)'}
};

/* ---------------- date / save ---------------- */
function dateKey(d){
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function yesterdayKey(){
  var d = new Date(); d.setDate(d.getDate()-1); return dateKey(d);
}
function defaultState(){
  var now = Date.now();
  return {
    name:'东', level:1, xp:35, hunger:78, mood:82, energy:86,
    coins:500, gems:10,
    food:{carrot:5, apple:2, cookie:1},
    owned:['none','flower'], outfit:'none',
    counts:{pet:0,feed:0,play:0,dress:0,sleep:0,checkin:0,minigame:0,adventure:0,battle:0,parkour:0},
    daily:{date:dateKey(),pet:0,feed:0,play:0,sleep:0,minigame:0,parkour:0,claimed:[]},
    lastCheckin:'', streak:0, lastHeal:0, sound:1, parkourBest:0, lastSeen:now
  };
}
function loadState(){
  var s = defaultState(), raw = null;
  try{ raw = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){}
  if (raw && typeof raw === 'object'){
    ['name'].forEach(function(k){ if (typeof raw[k] === 'string' && raw[k].trim()) s[k] = raw[k].slice(0,8); });
    ['level','xp','hunger','mood','energy','coins','gems','streak','lastHeal','sound','lastSeen','parkourBest'].forEach(function(k){
      if (typeof raw[k] === 'number' && isFinite(raw[k])) s[k] = raw[k];
    });
    s.xp = clamp(s.xp);
    s.hunger = clamp(s.hunger); s.mood = clamp(s.mood); s.energy = clamp(s.energy);
    s.coins = Math.max(0, Math.round(s.coins)); s.gems = Math.max(0, Math.round(s.gems));
    s.level = Math.max(1, Math.round(s.level));
    if (raw.food) ['carrot','apple','cookie'].forEach(function(k){
      if (typeof raw.food[k] === 'number') s.food[k] = Math.max(0, Math.floor(raw.food[k]));
    });
    if (Array.isArray(raw.owned)){
      s.owned = raw.owned.filter(function(x){ return OUTFITS[x]; });
      if (s.owned.indexOf('none') < 0) s.owned.unshift('none');
    }
    if (OUTFITS[raw.outfit] && s.owned.indexOf(raw.outfit) >= 0) s.outfit = raw.outfit;
    if (raw.counts) ['pet','feed','play','dress','sleep','checkin','minigame','adventure','battle','parkour'].forEach(function(k){
      if (typeof raw.counts[k] === 'number') s.counts[k] = Math.max(0,Math.floor(raw.counts[k]));
    });
    if (raw.daily && raw.daily.date === dateKey()){
      ['pet','feed','play','sleep','minigame','parkour'].forEach(function(k){
        if (typeof raw.daily[k] === 'number') s.daily[k] = Math.max(0,Math.floor(raw.daily[k]));
      });
      if (Array.isArray(raw.daily.claimed)) s.daily.claimed = raw.daily.claimed.filter(function(x){ return typeof x === 'string'; });
    }
    s.lastCheckin = typeof raw.lastCheckin === 'string' ? raw.lastCheckin : '';
    var hours = Math.max(0, (Date.now() - (raw.lastSeen || Date.now())) / 3600000);
    if (hours > .2){
      s.hunger = clamp(s.hunger - Math.min(32, hours*3.2));
      s.mood = clamp(s.mood - Math.min(22, hours*2.1));
      s.energy = clamp(s.energy + Math.min(30, hours*2.6));
    }
  }
  s.lastSeen = Date.now();
  return s;
}
function save(){
  try{
    state.lastSeen = Date.now();
    state.sound = soundOn ? 1 : 0;
    localStorage.setItem(KEY, JSON.stringify(state));
  }catch(e){}
}
function ensureDaily(){
  var today = dateKey();
  if (!state.daily || state.daily.date !== today){
    state.daily = {date:today, pet:0, feed:0, play:0, sleep:0, minigame:0, parkour:0, claimed:[]};
    save();
  }
}
function bumpDaily(key, n){
  ensureDaily();
  state.daily[key] = (state.daily[key] || 0) + (n || 1);
}

/* ---------------- audio ---------------- */
function audio(){
  if (!soundOn) return null;
  try{
    if (!audioCtx){
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
      master = audioCtx.createGain();
      master.gain.value = .36;
      master.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }catch(e){ return null; }
}
function tone(freq, dur, type, vol, slideTo){
  var ctx = audio(); if (!ctx) return;
  try{
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    var t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || .07, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + .02);
  }catch(e){}
}
function noiseBurst(dur, freq, vol){
  var ctx = audio(); if (!ctx) return;
  try{
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i=0;i<len;i++) data[i] = (Math.random()*2-1) * (1 - i/len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq || 1200; bp.Q.value = 1.1;
    var g = ctx.createGain(); g.gain.value = vol || .05;
    src.connect(bp); bp.connect(g); g.connect(master); src.start();
  }catch(e){}
}
function squeak(){
  tone(760, .12, 'sine', .045, 1160);
  setTimeout(function(){ tone(1000, .1, 'sine', .03, 1320); }, 65);
}
function crunch(){
  noiseBurst(.06, 1450, .07);
  setTimeout(function(){ noiseBurst(.05, 1000, .05); }, 120);
  setTimeout(function(){ noiseBurst(.05, 1700, .04); }, 250);
}
function coinSound(){
  tone(880, .1, 'sine', .04, 1320);
  setTimeout(function(){ tone(1320, .15, 'sine', .03); }, 70);
}
function chime(){
  tone(660, .4, 'sine', .04);
  setTimeout(function(){ tone(990, .55, 'sine', .03); }, 120);
  setTimeout(function(){ tone(1320, .7, 'sine', .02); }, 260);
}
function bounceSound(){ tone(260, .09, 'sine', .06, 520); }
function hitSound(){ noiseBurst(.07, 650, .1); tone(160, .12, 'triangle', .07, 80); }
function startPurr(){
  if (!soundOn || purrNodes) return;
  var ctx = audio(); if (!ctx) return;
  try{
    var o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 46;
    lp.type = 'lowpass'; lp.frequency.value = 165;
    g.gain.value = .0001;
    lfo.frequency.value = 21; lg.gain.value = .028;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(lp); lp.connect(g); g.connect(master);
    var t = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(.04, t + .1);
    o.start(); lfo.start();
    purrNodes = {o:o,lfo:lfo,g:g};
  }catch(e){}
}
function stopPurr(){
  if (!purrNodes) return;
  var ctx = audio();
  try{
    var t = ctx.currentTime;
    purrNodes.g.gain.cancelScheduledValues(t);
    purrNodes.g.gain.setValueAtTime(purrNodes.g.gain.value, t);
    purrNodes.g.gain.exponentialRampToValueAtTime(.0001, t + .16);
    purrNodes.o.stop(t + .2); purrNodes.lfo.stop(t + .2);
  }catch(e){}
  purrNodes = null;
}

/* ---------------- ui helpers ---------------- */
function fitStage(){
  var s = Math.min(window.innerWidth / W, window.innerHeight / H);
  document.documentElement.style.setProperty('--scale', s);
}
function stageInfo(){
  var r = stage.getBoundingClientRect();
  return {r:r, s:r.width / W};
}
function centerOf(el){
  var info = stageInfo(), r = el.getBoundingClientRect();
  return {x:(r.left + r.width/2 - info.r.left)/info.s, y:(r.top + r.height/2 - info.r.top)/info.s};
}
function petPoint(){
  var r = petImg.getBoundingClientRect(), info = stageInfo();
  return {x:(r.left + r.width*.38 - info.r.left)/info.s, y:(r.top + r.height*.50 - info.r.top)/info.s};
}
function mouthPoint(){
  var r = petImg.getBoundingClientRect(), info = stageInfo();
  return {x:(r.left + r.width*.225 - info.r.left)/info.s, y:(r.top + r.height*.64 - info.r.top)/info.s};
}
function toast(text){
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toastEl.classList.remove('show'); }, 2500);
}
function speak(text, ms){
  speech.innerHTML = text;
  speech.classList.add('show');
  clearTimeout(speechTimer);
  if (ms !== 0) speechTimer = setTimeout(function(){ speech.classList.remove('show'); }, ms || 3400);
}
function hideSpeech(){ clearTimeout(speechTimer); speech.classList.remove('show'); }
function heartAt(x,y,big){
  var el = document.createElement('div');
  el.className = 'fx-heart';
  var s = big ? 28 : rand(16,22);
  el.style.width = s + 'px'; el.style.height = s + 'px';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.style.setProperty('--dx', rand(-36,36).toFixed(1) + 'px');
  el.style.setProperty('--rot', rand(-24,24).toFixed(1) + 'deg');
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="' + (Math.random()>.4?'#e26452':'#ef8a70') + '" stroke="#fff2df" stroke-width="1.2" stroke-linejoin="round"><path d="M12 21 3.7 12.8a5.2 5.2 0 0 1 0-7.4 5.2 5.2 0 0 1 7.4 0l.9.9.9-.9a5.2 5.2 0 0 1 7.4 0 5.2 5.2 0 0 1 0 7.4L12 21Z"/></svg>';
  fxLayer.appendChild(el);
  setTimeout(function(){ el.remove(); }, 1600);
}
function starsAt(x,y,n){
  for (var i=0;i<(n||4);i++){
    (function(k){
      setTimeout(function(){
        var el = document.createElement('div');
        el.className = 'fx-star';
        el.style.left = (x + rand(-45,45)) + 'px';
        el.style.top = (y + rand(-30,25)) + 'px';
        el.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5l2.3 8.2 8.2 2.3-8.2 2.3L12 22.5l-2.3-8.2L1.5 12l8.2-2.3Z"/></svg>';
        fxLayer.appendChild(el);
        setTimeout(function(){ el.remove(); }, 950);
      }, k*60);
    })(i);
  }
}
function coinFx(n, x, y){
  for (var i=0;i<(n||1);i++){
    (function(k){
      setTimeout(function(){
        var el = document.createElement('div');
        el.className = 'fx-coin'; el.textContent = '🪙';
        el.style.left = (x + rand(-20,20)) + 'px'; el.style.top = y + 'px';
        el.style.setProperty('--dx', rand(-30,30) + 'px');
        fxLayer.appendChild(el);
        setTimeout(function(){ el.remove(); }, 1200);
      }, k*80);
    })(i);
  }
}
function floatText(text,x,y,color){
  var el = document.createElement('div');
  el.className = 'fx-text'; el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  if (color) el.style.color = color;
  fxLayer.appendChild(el);
  setTimeout(function(){ el.remove(); }, 1050);
}
function angerAt(x,y){
  var el = document.createElement('div');
  el.className = 'fx-anger';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="#dd5b49" stroke-width="4.2" stroke-linecap="round"><path d="M12 15c4-4 8-4 11 0M32 10c4 3 5 7 2 11M20 38c-4-2-5-6-2-9M39 30c-4 2-8 1-10-3"/></svg>';
  fxLayer.appendChild(el);
  setTimeout(function(){ el.remove(); }, 1700);
}
function renderAcc(){
  var o = OUTFITS[state.outfit] || OUTFITS.none;
  if (!o.style){ petAcc.innerHTML = ''; return; }
  petAcc.innerHTML = '<span class="acc-item" style="' + o.style + '">' + o.emoji + '</span>';
}
function statColor(el, value, low){
  el.classList.toggle('low', value < 25);
}

/* ---------------- render ---------------- */
function render(){
  ensureDaily();
  $('#petName').textContent = state.name;
  $('#lvText').textContent = 'Lv.' + state.level;
  $('#levelBadge').textContent = state.level;
  $('#bondText').textContent = Math.round(state.xp) + '/100';
  $('#bondText2').textContent = Math.round(state.xp) + ' / 100';
  $('#bondLevelSmall').textContent = 'Lv.' + state.level;
  $('#bondFill').style.width = Math.max(2, state.xp) + '%';
  $('#bondFill2').style.width = Math.max(2, state.xp) + '%';
  $('#hungerVal').textContent = Math.round(state.hunger) + '%';
  $('#moodVal').textContent = Math.round(state.mood) + '%';
  $('#energyVal').textContent = Math.round(state.energy) + '%';
  $('#hungerBar').style.width = state.hunger + '%';
  $('#moodBar').style.width = state.mood + '%';
  $('#energyBar').style.width = state.energy + '%';
  $('#coinVal').textContent = state.coins;
  $('#gemVal').textContent = state.gems;
  statColor($('#statHunger'), state.hunger);
  statColor($('#statMood'), state.mood);
  statColor($('#statEnergy'), state.energy);
  renderAcc();
}
function addXp(n){
  if (!n) return;
  state.xp += n;
  while (state.xp >= 100){
    state.xp -= 100;
    state.level += 1;
    state.coins += 80;
    state.gems += 1;
    toast('升级啦！Lv.' + state.level + '，奖励 80 金币 + 1 宝石');
    chime();
    starsAt(500, 300, 8);
  }
  save(); render();
}
function addStat(key, n){
  state[key] = clamp(state[key] + n);
}

/* ---------------- overlay ---------------- */
function openOverlay(title, sub, html, after){
  closeOverlay(true);
  overlayRoot.innerHTML = '<div class="overlay"><div class="sheet"><div class="sheet-head"><div><h2>' + title + '</h2><p>' + sub + '</p></div><button class="sheet-close" aria-label="关闭">×</button></div><div class="sheet-body">' + html + '</div></div></div>';
  overlayRoot.classList.add('show');
  uiLocked = true;
  var overlay = $('.overlay', overlayRoot);
  requestAnimationFrame(function(){ overlay.classList.add('show'); });
  $('.sheet-close', overlayRoot).addEventListener('click', function(){ closeOverlay(); });
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeOverlay(); });
  if (after) after($('.sheet-body', overlayRoot));
}
function closeOverlay(instant){
  overlayRoot.classList.remove('show');
  if (instant){ overlayRoot.innerHTML = ''; return; }
  uiLocked = false;
  setTimeout(function(){ overlayRoot.innerHTML = ''; }, 240);
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
}

/* ---------------- petting ---------------- */
function startPet(e){
  if (sleeping || uiLocked) return;
  if (e && e.cancelable) e.preventDefault();
  petting = true;
  petCounted = false;
  petMoves = 0;
  petWrap.classList.add('petting');
  startPurr();
  squeak();
  var p = petPoint();
  heartAt(p.x, p.y, true);
  if (!petCounted){
    petCounted = true;
    state.counts.pet += 1;
    bumpDaily('pet', 1);
    addXp(1.2);
    addStat('mood', 1.2);
    save(); render();
  }
  if (e){
    try{ petWrap.setPointerCapture(e.pointerId); }catch(err){}
  }
}
function movePet(e){
  if (!petting) return;
  var now = performance.now();
  if (now - petHeartTimer > 110){
    petHeartTimer = now;
    var info = stageInfo();
    var x = (e.clientX - info.r.left)/info.s;
    var y = (e.clientY - info.r.top)/info.s;
    heartAt(x + rand(-6,6), y + rand(-6,6), false);
  }
  if (now - petGainTimer > 170){
    petGainTimer = now;
    petMoves += 1;
    addXp(.45);
    addStat('mood', .5);
    if (petMoves === 3) speak('呼噜呼噜…好舒服。');
    if (petMoves === 8) speak('再摸下去，我要融化啦。');
    render();
  }
}
function endPet(){
  if (!petting) return;
  petting = false;
  petWrap.classList.remove('petting');
  stopPurr();
  addXp(Math.min(2.4, petMoves * .35));
  addStat('mood', Math.min(3, petMoves * .4));
  save(); render();
  if (petMoves >= 5) speak(pick(['呼噜呼噜…还要还要。','你的手好暖和。','再陪我一会儿嘛。']));
  else speak(pick(['嘿嘿，好痒呀。','摸摸头，今天也辛苦啦。','你来了，我就开心。']));
}
function petAction(){
  if (sleeping){ toast('东睡着了，轻一点哦'); return; }
  if (uiLocked) return;
  startPet(null);
  setTimeout(function(){ endPet(); }, 900);
  speak(pick(['呼噜呼噜…好舒服。','摸摸头，今天也辛苦啦。','再摸一会儿嘛。','你的手好暖和。']));
  var p = petPoint(); heartsBurst(p);
}
function heartsBurst(p){
  for (var i=0;i<3;i++){
    (function(k){ setTimeout(function(){ heartAt(p.x + rand(-25,25), p.y + rand(-18,18), false); }, k*100); })(i);
  }
}

/* ---------------- feed ---------------- */
function openFeed(){
  if (sleeping){ toast('东睡着了，等它醒了再喂吧'); return; }
  if (uiLocked) return;
  ensureDaily();
  var foods = [
    {id:'carrot', name:'胡萝卜', emoji:'🥕', hunger:22, mood:4, price:5, desc:'东的最爱，咔嚓咔嚓'},
    {id:'apple', name:'苹果', emoji:'🍎', hunger:15, mood:7, price:8, desc:'甜甜的，心情变好'},
    {id:'cookie', name:'小饼干', emoji:'🍪', hunger:10, mood:10, price:10, desc:'偶尔来一块，幸福感满满'}
  ];
  var html = '<div class="card-grid">';
  foods.forEach(function(f){
    var count = state.food[f.id] || 0;
    html += '<button class="choice-card" data-food="' + f.id + '">' +
      (count > 0 ? '<span class="owned-tag">×' + count + '</span>' : '') +
      '<div class="big-emoji">' + f.emoji + '</div><h3>' + f.name + '</h3><p>' + f.desc + '</p>' +
      '<span class="price">' + (count > 0 ? '库存 ' + count : '🪙 ' + f.price) + '</span>' +
      '<div class="mini-stats"><span>饱腹 +' + f.hunger + '</span><span>心情 +' + f.mood + '</span></div></button>';
  });
  html += '</div><p class="tip">没有库存时可以用金币购买；喂食会消耗金币或库存。</p>';
  openOverlay('喂食时间', '东的肚子在咕咕叫', html, function(body){
    $$('[data-food]', body).forEach(function(btn){
      btn.addEventListener('click', function(){ feedFood(btn.getAttribute('data-food')); });
    });
  });
}
function flyFood(emoji, fromEl, done){
  var info = stageInfo();
  var start = fromEl ? centerOf(fromEl) : centerOf($('.action-btn[data-action="feed"]'));
  var end = mouthPoint();
  var el = document.createElement('div');
  el.textContent = emoji;
  el.style.position = 'absolute';
  el.style.left = start.x + 'px';
  el.style.top = start.y + 'px';
  el.style.fontSize = '38px';
  el.style.zIndex = 45;
  el.style.pointerEvents = 'none';
  el.style.filter = 'drop-shadow(0 5px 5px rgba(80,45,25,.2))';
  el.style.transform = 'translate(-50%,-50%)';
  stage.appendChild(el);
  var dx = end.x - start.x, dy = end.y - start.y;
  var anim = null;
  try{
    anim = el.animate([
      {transform:'translate(-50%,-50%) scale(.6) rotate(-10deg)', opacity:1, offset:0},
      {transform:'translate(calc(-50% + ' + (dx*.55) + 'px), calc(-50% + ' + (dy*.35 - 40) + 'px)) scale(1.15) rotate(180deg)', opacity:1, offset:.55},
      {transform:'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.35) rotate(360deg)', opacity:.15, offset:1}
    ], {duration:620,easing:'cubic-bezier(.3,.1,.3,1)'});
  }catch(err){}
  setTimeout(function(){
    el.remove();
    if (done) done();
  }, 640);
}
function feedFood(id){
  var f = {carrot:{name:'胡萝卜',emoji:'🥕',hunger:22,mood:4,price:5},apple:{name:'苹果',emoji:'🍎',hunger:15,mood:7,price:8},cookie:{name:'小饼干',emoji:'🍪',hunger:10,mood:10,price:10}}[id];
  if (!f) return;
  if ((state.food[id] || 0) <= 0){
    if (state.coins < f.price){ toast('金币不够啦，去小游戏赚一点吧'); return; }
    state.coins -= f.price;
  } else {
    state.food[id] -= 1;
  }
  closeOverlay();
  var btn = $('.action-btn[data-action="feed"]');
  flyFood(f.emoji, btn, function(){
    petWrap.classList.add('happy');
    setTimeout(function(){ petWrap.classList.remove('happy'); }, 1100);
    petWrap.classList.add('eating');
    setTimeout(function(){ petWrap.classList.remove('eating'); }, 1000);
    crunch();
    addStat('hunger', f.hunger);
    addStat('mood', f.mood);
    addXp(2.5);
    state.counts.feed += 1;
    bumpDaily('feed', 1);
    save(); render();
    var mp = mouthPoint();
    starsAt(mp.x, mp.y, 3);
    coinFx(0, mp.x, mp.y);
    if (state.hunger >= 98) speak('好饱呀…肚肚变成小圆球了。');
    else speak(pick(['咔嚓咔嚓，好甜！','谢谢款待，肚肚暖暖的。','这个味道，我最喜欢啦。','再来一口好不好？']));
    setTimeout(function(){ render(); }, 300);
  });
}

/* ---------------- dress ---------------- */
function openDress(){
  if (sleeping){ toast('东睡着了，明天再换衣服吧'); return; }
  if (uiLocked) return;
  var html = '<div class="card-grid four">';
  Object.keys(OUTFITS).forEach(function(id){
    var o = OUTFITS[id];
    var owned = state.owned.indexOf(id) >= 0;
    var selected = state.outfit === id;
    html += '<button class="choice-card' + (selected?' selected':'') + (owned?'':' locked') + '" data-outfit="' + id + '">' +
      (selected?'<span class="owned-tag">穿着中</span>':'') +
      (owned && id !== 'none' && !selected ? '<span class="owned-tag">已拥有</span>' : '') +
      '<div class="big-emoji">' + o.emoji + '</div><h3>' + o.name + '</h3>' +
      '<span class="price">' + (owned ? '点击穿上' : '🪙 ' + o.price) + '</span></button>';
  });
  html += '</div><p class="tip">换装会保存在东的衣柜里；金币可以通过签到、任务和小游戏获得。</p>';
  openOverlay('东的衣柜', '今天想戴点什么？', html, function(body){
    $$('[data-outfit]', body).forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-outfit');
        var o = OUTFITS[id];
        var owned = state.owned.indexOf(id) >= 0;
        if (!owned){
          if (state.coins < o.price){ toast('金币不够，先去赚一点吧'); return; }
          state.coins -= o.price;
          state.owned.push(id);
          toast('买到了「' + o.name + '」');
          coinSound();
        }
        state.outfit = id;
        save(); render();
        closeOverlay();
        if (id !== 'none') speak(pick(['好看吗？我觉得超适合我。','嘿嘿，今天也要美美的。','这个给你也看一看。']));
      });
    });
  });
}

/* ---------------- sleep ---------------- */
function sleepAction(){
  if (sleeping || uiLocked) return;
  if (state.energy >= 98){ toast('东现在还很有精神，晚点再睡吧'); return; }
  sleeping = true;
  uiLocked = true;
  petWrap.classList.add('sleeping');
  stage.classList.add('sleeping-stage');
  nightLayer.classList.add('show');
  nightLayer.setAttribute('aria-hidden', 'false');
  addStat('energy', 30);
  addStat('mood', 5);
  addXp(2);
  state.counts.sleep += 1;
  bumpDaily('sleep', 1);
  save(); render();
  chime();
  hideSpeech();
}
function wakeUp(){
  if (!sleeping) return;
  sleeping = false;
  uiLocked = false;
  petWrap.classList.remove('sleeping');
  stage.classList.remove('sleeping-stage');
  nightLayer.classList.remove('show');
  nightLayer.setAttribute('aria-hidden', 'true');
  petWrap.classList.add('happy');
  setTimeout(function(){ petWrap.classList.remove('happy'); }, 700);
  addStat('mood', 2);
  addXp(1);
  save(); render();
  speak(pick(['唔…睡得好香。你一直都在呀。','伸个懒腰，又是软软的一天。','我梦见你啦，梦里的你也很好。']));
}

/* ---------------- checkin ---------------- */
function openCheckin(){
  ensureDaily();
  var today = dateKey();
  var done = state.lastCheckin === today;
  var nextStreak = 1;
  if (done) nextStreak = state.streak;
  else if (state.lastCheckin === yesterdayKey()) nextStreak = (state.streak % 7) + 1;
  var html = '<div class="checkin-grid">';
  for (var i=1;i<=7;i++){
    var isDone = done ? i <= state.streak : i < nextStreak;
    var isToday = !done && i === nextStreak;
    html += '<div class="day-card' + (isDone?' done':'') + (isToday?' today':'') + '">' +
      '<small>第 ' + i + ' 天</small><div class="d-emoji">' + (i%3===0?'💎':i%2===0?'🥕':'🪙') + '</div>' +
      '<b>+' + (i*20) + ' 金币</b><i>' + (i%3===0?'+1 宝石':'') + '</i></div>';
  }
  html += '</div>';
  html += '<div class="checkin-actions"><button class="primary-btn" id="claimCheckin"' + (done?' disabled':'') + '>' + (done?'今天已经签到啦':'签到领取') + '</button></div>';
  html += '<p class="tip">连续签到奖励更多；第 3、6 天有宝石。</p>';
  openOverlay('每日签到', '今天也来见东一面吧', html, function(body){
    var btn = $('#claimCheckin', body);
    if (btn) btn.addEventListener('click', claimCheckin);
  });
}
function claimCheckin(){
  var today = dateKey();
  if (state.lastCheckin === today){ toast('今天已经签到过了'); return; }
  var newStreak = 1;
  if (state.lastCheckin === yesterdayKey()) newStreak = (state.streak % 7) + 1;
  state.streak = newStreak;
  state.lastCheckin = today;
  var coins = newStreak * 20;
  state.coins += coins;
  if (newStreak % 3 === 0) state.gems += 1;
  if (newStreak % 2 === 0) state.food.carrot += 1;
  state.counts.checkin += 1;
  save(); render();
  coinSound();
  toast('签到成功：+' + coins + ' 金币' + (newStreak%3===0?'，+1 宝石':'') + (newStreak%2===0?'，+1 胡萝卜':''));
  coinFx(3, 500, 380);
  openCheckin();
}

/* ---------------- rewards ---------------- */
function openRewards(){
  ensureDaily();
  var tasks = [
    {id:'pet', name:'摸摸东 5 次', emoji:'🤚', need:5, reward:30},
    {id:'feed', name:'给东喂食 3 次', emoji:'🥕', need:3, reward:40},
    {id:'play', name:'陪东玩 1 次', emoji:'🧶', need:1, reward:30},
    {id:'sleep', name:'哄东睡 1 次', emoji:'😴', need:1, reward:25},
    {id:'minigame', name:'完成 1 次小游戏', emoji:'🎮', need:1, reward:50},
    {id:'parkour', name:'完成 1 次跑酷', emoji:'🏃', need:1, reward:60}
  ];
  var html = '<div class="task-list">';
  tasks.forEach(function(t){
    var val = Math.min(state.daily[t.id] || 0, t.need);
    var claimed = state.daily.claimed.indexOf(t.id) >= 0;
    var can = val >= t.need && !claimed;
    html += '<div class="task-row"><span class="t-emoji">' + t.emoji + '</span><div class="t-main"><b>' + t.name + '</b><small>' + val + ' / ' + t.need + ' · 奖励 ' + t.reward + ' 金币</small><div class="mini-bar"><i style="width:' + (val/t.need*100) + '%"></i></div></div><button class="claim-btn" data-claim="' + t.id + '"' + (can?'':' disabled') + '>' + (claimed?'已领取':'领取') + '</button></div>';
  });
  html += '</div><p class="tip">每日任务每天 0 点刷新；领取后奖励会直接进金币袋。</p>';
  openOverlay('每日奖励', '陪东做的每一件小事都有回礼', html, function(body){
    $$('[data-claim]', body).forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-claim');
        var t = tasks.filter(function(x){ return x.id===id; })[0];
        if (!t) return;
        var val = state.daily[id] || 0;
        if (val < t.need || state.daily.claimed.indexOf(id) >= 0) return;
        state.daily.claimed.push(id);
        state.coins += t.reward;
        save(); render();
        coinSound();
        toast('领取成功：+' + t.reward + ' 金币');
        coinFx(3, 500, 380);
        openRewards();
      });
    });
  });
}

/* ---------------- adventure ---------------- */
function openAdventure(){
  if (sleeping){ toast('东睡着了，等它醒了再去冒险吧'); return; }
  if (state.energy < 10){ toast('精力不足，先让东休息一下吧'); return; }
  var html = '<div class="location-grid">' +
    '<button class="location-card" data-place="field"><div class="loc-emoji">🥕</div><h3>胡萝卜田</h3><p>阳光下的胡萝卜地，适合觅食。</p><small>消耗 10 精力</small></button>' +
    '<button class="location-card" data-place="forest"><div class="loc-emoji">🍄</div><h3>蘑菇林</h3><p>有点神秘，也许会捡到宝贝。</p><small>消耗 10 精力</small></button>' +
    '<button class="location-card" data-place="lake"><div class="loc-emoji">🌌</div><h3>星光湖</h3><p>夜晚的湖边，宝石在发光。</p><small>消耗 10 精力</small></button>' +
    '</div><div class="adventure-result" id="advResult"></div><p class="tip">每次冒险都会带回一点小礼物，也可能交到新朋友。</p>';
  openOverlay('森林冒险', '和东一起出门走走', html, function(body){
    $$('[data-place]', body).forEach(function(btn){
      btn.addEventListener('click', function(){ doAdventure(btn.getAttribute('data-place')); });
    });
  });
}
function doAdventure(place){
  if (state.energy < 10){ toast('精力不足'); return; }
  state.energy = clamp(state.energy - 10);
  state.counts.adventure += 1;
  var result = null;
  if (place === 'field'){
    state.food.carrot += 3; state.coins += 35; addStat('mood', 5); addXp(6);
    result = {emoji:'🥕', title:'满载而归', text:'东在田里挖到了 3 根胡萝卜，还捡到 35 金币。'};
  } else if (place === 'forest'){
    state.coins += 70; addStat('mood', 8); addXp(8);
    if (Math.random() < .35){ state.gems += 1; result = {emoji:'💎', title:'蘑菇林的礼物', text:'东发现了一颗闪亮的宝石，还带回了 70 金币。'}; }
    else result = {emoji:'🍄', title:'蘑菇小径', text:'东在蘑菇林里散步，捡到 70 金币，心情很好。'};
  } else {
    state.gems += 1; state.coins += 20; addStat('mood', 10); addXp(10);
    result = {emoji:'🌌', title:'星光湖的倒影', text:'东在湖边许了个愿，捡到 1 颗宝石和 20 金币。'};
  }
  save(); render(); coinSound();
  var box = $('#advResult');
  if (!box){ closeOverlay(); toast(result.title); return; }
  box.className = 'adventure-result show';
  box.innerHTML = '<div class="r-emoji">' + result.emoji + '</div><h3>' + result.title + '</h3><p>' + result.text + '</p><div class="checkin-actions"><button class="primary-btn" id="advBack">收下礼物</button></div>';
  $$('[data-place]', box.parentElement).forEach(function(b){ b.disabled = true; b.style.opacity = .55; });
  $('#advBack', box).addEventListener('click', function(){ closeOverlay(); speak('今天也玩得很开心，谢谢你陪我。'); });
}

/* ---------------- battle ---------------- */
function openBattle(){
  if (sleeping){ toast('东睡着了，不适合战斗'); return; }
  if (state.energy < 10){ toast('精力不足，先休息一下吧'); return; }
  battle = {enemyHp:32, playerHp:32, guard:false, over:false, log:'一只灰尘怪挡住了去路！'};
  state.energy = clamp(state.energy - 8);
  save(); render();
  renderBattle();
}
function renderBattle(){
  if (!battle) return;
  var html = '<div class="battle-arena"><div class="fighter player"><div class="sprite">🐰</div><h3>东</h3><div class="hpbar"><i id="playerHp"></i></div></div><div class="fighter enemy"><div class="sprite">👾</div><h3>灰尘怪</h3><div class="hpbar"><i id="enemyHp"></i></div></div></div><div class="battle-log" id="battleLog">' + battle.log + '</div><div class="battle-actions"><button data-battle="attack">⚔️ 攻击</button><button data-battle="guard">🛡️ 防御</button><button data-battle="flee">🏃 逃跑</button></div>';
  openOverlay('小屋保卫战', '帮东赶走灰尘怪', html, function(body){
    updateBattleBars();
    $$('[data-battle]', body).forEach(function(btn){
      btn.addEventListener('click', function(){ battleTurn(btn.getAttribute('data-battle')); });
    });
  });
  updateBattleBars();
}
function updateBattleBars(){
  if (!battle) return;
  var p = $('#playerHp'), e = $('#enemyHp');
  if (p) p.style.width = Math.max(0, battle.playerHp / 32 * 100) + '%';
  if (e) e.style.width = Math.max(0, battle.enemyHp / 32 * 100) + '%';
  var log = $('#battleLog'); if (log) log.textContent = battle.log;
}
function battleTurn(action){
  if (!battle || battle.over) return;
  if (action === 'flee'){
    battle.over = true;
    battle.log = '东躲到了沙发后面，灰尘怪走开了。';
    updateBattleBars();
    setTimeout(function(){ closeOverlay(); speak('呼…好险，下次我们一起把它赶跑。'); }, 650);
    return;
  }
  if (action === 'attack'){
    var dmg = Math.round(rand(6,10));
    battle.enemyHp -= dmg;
    battle.log = '东使用了兔兔拳，造成 ' + dmg + ' 点伤害！';
    hitSound();
    var sprite = $('.fighter.enemy .sprite');
    if (sprite){ sprite.parentElement.classList.add('hit'); setTimeout(function(){ sprite.parentElement.classList.remove('hit'); }, 350); }
    updateBattleBars();
    if (battle.enemyHp <= 0){ winBattle(); return; }
  } else if (action === 'guard'){
    battle.guard = true;
    battle.log = '东缩成了一团毛球，准备防御。';
    updateBattleBars();
  }
  setTimeout(enemyTurn, 520);
}
function enemyTurn(){
  if (!battle || battle.over) return;
  var dmg = Math.round(rand(4,8));
  if (battle.guard){ dmg = Math.max(2, Math.round(dmg/2)); battle.guard = false; }
  battle.playerHp -= dmg;
  battle.log = '灰尘怪扑了过来，东受到 ' + dmg + ' 点伤害。';
  updateBattleBars();
  var sprite = $('.fighter.player .sprite');
  if (sprite){ sprite.parentElement.classList.add('hit'); setTimeout(function(){ sprite.parentElement.classList.remove('hit'); }, 350); }
  if (battle.playerHp <= 0) loseBattle();
}
function winBattle(){
  battle.over = true;
  var coins = 80;
  state.coins += coins; state.gems += 1; addStat('mood', 8); addXp(15);
  state.counts.battle += 1;
  save(); render(); coinSound();
  battle.log = '灰尘怪被赶跑了！获得 80 金币和 1 颗宝石。';
  updateBattleBars();
  setTimeout(function(){
    closeOverlay(); toast('战斗胜利：+80 金币，+1 宝石'); coinFx(5, 500, 360);
    speak('我们赢啦！东是不是很厉害？');
  }, 900);
}
function loseBattle(){
  battle.over = true;
  state.mood = clamp(state.mood - 8);
  state.energy = clamp(state.energy - 5);
  state.counts.battle += 1;
  save(); render();
  battle.log = '东累了…灰尘怪溜走了。摸摸它，安慰一下吧。';
  updateBattleBars();
  setTimeout(function(){ closeOverlay(); speak('呜…下次我会更勇敢的。'); }, 1000);
}

/* ---------------- mini games ---------------- */
function startMini(html, after){
  closeOverlay();
  gameRoot.innerHTML = '<div class="mini"><div class="mini-box">' + html + '</div></div>';
  gameRoot.classList.add('show');
  uiLocked = true;
  if (after) after($('.mini-box', gameRoot));
}
function closeMini(){
  if (mini && mini.timers){
    mini.timers.forEach(function(t){ clearInterval(t); });
  }
  mini = null;
  gameRoot.classList.remove('show');
  gameRoot.innerHTML = '';
  uiLocked = false;
}
function openCarrotGame(){
  if (sleeping){ toast('东睡着了'); return; }
  if (state.energy < 10){ toast('精力不足，先休息一下'); return; }
  state.energy = clamp(state.energy - 5);
  save(); render();
  var html = '<div class="mini-head"><b>🥕 接住胡萝卜</b><div class="m-stats"><span>时间 <b id="miniTime">20</b>s</span><span>得分 <b id="miniScore">0</b></span></div><button class="mini-close" id="miniClose">×</button></div><div class="mini-field" id="miniField"></div><div class="mini-foot"><span>点胡萝卜得分，20 秒后结算</span><span class="mini-btn" id="miniEnd">结束</span></div>';
  startMini(html, function(box){
    var field = $('#miniField', box);
    var score = 0, time = 20, over = false;
    var timers = [];
    mini = {timers:timers, type:'carrot'};
    function spawn(){
      if (over) return;
      var c = document.createElement('button');
      c.className = 'falling-carrot';
      c.type = 'button';
      c.textContent = '🥕';
      c.style.left = rand(18, field.clientWidth - 62) + 'px';
      var dur = rand(2.4,3.6);
      c.style.setProperty('--fall', (field.clientHeight + 70) + 'px');
      c.style.animationDuration = dur + 's';
      c.addEventListener('click', function(e){
        e.stopPropagation();
        if (over) return;
        score += 1;
        $('#miniScore', box).textContent = score;
        bounceSound();
        c.classList.add('pop');
        c.disabled = true;
        setTimeout(function(){ c.remove(); }, 250);
      });
      c.addEventListener('animationend', function(){ if (c.parentNode) c.remove(); });
      field.appendChild(c);
    }
    for (var i=0;i<3;i++) setTimeout(spawn, i*260);
    var spawnTimer = setInterval(spawn, 520);
    timers.push(spawnTimer);
    var clock = setInterval(function(){
      time -= 1;
      $('#miniTime', box).textContent = Math.max(0,time);
      if (time <= 0) endCarrot();
    }, 1000);
    timers.push(clock);
    function endCarrot(){
      if (over) return;
      over = true;
      clearInterval(spawnTimer); clearInterval(clock);
      var reward = score * 3;
      state.coins += reward;
      addStat('mood', Math.min(18, score * 2));
      addXp(score);
      state.counts.minigame += 1;
      bumpDaily('minigame', 1);
      save(); render();
      if (reward) coinSound();
      var result = document.createElement('div');
      result.className = 'result-card';
      result.innerHTML = '<div class="result-inner"><div class="r-emoji">🥕</div><h3>接到 ' + score + ' 根胡萝卜</h3><p>获得 ' + reward + ' 金币，东的心情 +' + Math.min(18,score*2) + '</p><button class="primary-btn" id="miniCollect">收下奖励</button></div>';
      $('.mini-box', gameRoot).appendChild(result);
      $('#miniCollect', result).addEventListener('click', function(){
        closeMini(); toast('小游戏奖励：+' + reward + ' 金币'); speak('好多胡萝卜！谢谢你陪我玩。');
      });
    }
    $('#miniClose', box).addEventListener('click', endCarrot);
    $('#miniEnd', box).addEventListener('click', endCarrot);
  });
}
function openYarnGame(){
  if (sleeping){ toast('东睡着了'); return; }
  if (state.energy < 10){ toast('精力不足，先休息一下'); return; }
  state.energy = clamp(state.energy - 5);
  save(); render();
  var html = '<div class="mini-head"><b>🧶 追毛球</b><div class="m-stats"><span>时间 <b id="miniTime">15</b>s</span><span>得分 <b id="miniScore">0</b></span></div><button class="mini-close" id="miniClose">×</button></div><div class="mini-field" id="miniField"></div><div class="mini-foot"><span>点毛球得分，15 秒后结算</span><span class="mini-btn" id="miniEnd">结束</span></div>';
  startMini(html, function(box){
    var field = $('#miniField', box);
    var score = 0, time = 15, over = false;
    var ball = document.createElement('button');
    ball.className = 'mini-yarn'; ball.type = 'button'; ball.textContent = '🧶';
    field.appendChild(ball);
    function place(){
      ball.style.left = rand(25, field.clientWidth - 95) + 'px';
      ball.style.top = rand(25, field.clientHeight - 100) + 'px';
    }
    place();
    ball.addEventListener('click', function(e){
      e.stopPropagation();
      if (over) return;
      score += 1;
      $('#miniScore', box).textContent = score;
      bounceSound();
      ball.style.transform = 'scale(1.25)';
      setTimeout(function(){ ball.style.transform = ''; }, 100);
      place();
      starsAt(rand(220,780), rand(180,360), 2);
    });
    var clock = setInterval(function(){
      time -= 1;
      $('#miniTime', box).textContent = Math.max(0,time);
      if (time <= 0) endYarn();
    }, 1000);
    mini = {timers:[clock], type:'yarn'};
    function endYarn(){
      if (over) return;
      over = true;
      clearInterval(clock);
      var reward = score * 2;
      state.coins += reward;
      addStat('mood', Math.min(20, score * 2));
      addXp(score);
      state.counts.play += 1;
      bumpDaily('play', 1);
      save(); render();
      if (reward) coinSound();
      var result = document.createElement('div');
      result.className = 'result-card';
      result.innerHTML = '<div class="result-inner"><div class="r-emoji">🧶</div><h3>抓到 ' + score + ' 次毛球</h3><p>获得 ' + reward + ' 金币，东的心情 +' + Math.min(20,score*2) + '</p><button class="primary-btn" id="miniCollect">收下奖励</button></div>';
      $('.mini-box', gameRoot).appendChild(result);
      $('#miniCollect', result).addEventListener('click', function(){
        closeMini(); toast('玩耍奖励：+' + reward + ' 金币'); speak('毛球滚呀滚，好开心！');
      });
    }
    $('#miniClose', box).addEventListener('click', endYarn);
    $('#miniEnd', box).addEventListener('click', endYarn);
  });
}

/* ---------------- heal / settings / shop ---------------- */
function healAction(){
  if (sleeping || uiLocked) return;
  var now = Date.now();
  if (now - state.lastHeal < 30*60*1000){ toast('东刚休息过，等一会儿再恢复吧'); return; }
  if (state.energy >= 95 && state.mood >= 95){ toast('东现在状态超好，不需要恢复'); return; }
  state.lastHeal = now;
  addStat('energy', 30);
  addStat('mood', 20);
  addXp(2);
  save(); render();
  chime();
  var p = petPoint();
  heartsBurst(p);
  speak('休息了一会儿，感觉好多了。谢谢你照顾我。');
  toast('东恢复了一些精力');
}
function openSettings(){
  if (uiLocked && !$('.overlay')) return;
  var html = '<div class="setting-row"><span>🔊 游戏音效</span><button class="switch' + (soundOn?' on':'') + '" id="soundSwitch" aria-label="切换音效"></button></div>' +
    '<div class="setting-row"><span>🖥️ 全屏 / 竖屏</span><button class="primary-btn" id="fullBtn" style="padding:7px 14px;font-size:10px">尝试竖屏</button></div>' +
    '<div class="setting-row"><span>📱 当前版本</span><span style="font-size:10px;color:#9a7a63">兔兔屋 v1.0</span></div>' +
    '<div class="setting-row"><span>🗑️ 重新开始</span><button id="resetBtn" style="color:#b55d4f;font-size:10.5px;font-weight:700">清空存档</button></div>' +
    '<p class="tip">游戏会自动保存；微信里建议竖屏并把页面添加到桌面。音效需要先点一下页面才会开启。</p>';
  openOverlay('设置', '把兔兔屋调成你喜欢的样子', html, function(body){
    $('#soundSwitch', body).addEventListener('click', function(){
      soundOn = !soundOn;
      this.classList.toggle('on', soundOn);
      if (soundOn){ squeak(); toast('音效已开启'); } else { stopPurr(); toast('已静音'); }
      save();
    });
    $('#fullBtn', body).addEventListener('click', goFullscreen);
    $('#resetBtn', body).addEventListener('click', function(){
      if (window.confirm('确定要清空存档，重新开始吗？')){ localStorage.removeItem(KEY); location.reload(); }
    });
  });
}
function goFullscreen(){
  var el = document.documentElement;
  var p = el.requestFullscreen ? el.requestFullscreen() : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null);
  if (p && p.then) p.catch(function(){});
  if (screen.orientation && screen.orientation.lock){
    screen.orientation.lock('portrait').catch(function(){});
  }
  setTimeout(fitStage, 400);
  toast('如果画面没有旋转，请把手机竖过来');
}
function openShop(type){
  if (uiLocked) return;
  var html = '<div class="card-grid" style="grid-template-columns:1fr 1fr">' +
    '<button class="choice-card" data-goto="rewards"><div class="big-emoji">🎁</div><h3>做每日任务</h3><p>陪东摸摸、喂食、玩耍，领取金币。</p><span class="price">去赚金币</span></button>' +
    '<button class="choice-card" data-goto="minigame"><div class="big-emoji">🎮</div><h3>玩小游戏</h3><p>接胡萝卜、追毛球，得分换金币。</p><span class="price">去玩一局</span></button>' +
    '<button class="choice-card" data-goto="checkin"><div class="big-emoji">📅</div><h3>每日签到</h3><p>连续签到有金币和宝石。</p><span class="price">去签到</span></button>' +
    '<button class="choice-card" data-goto="adventure"><div class="big-emoji">🗺️</div><h3>森林冒险</h3><p>带东出门，捡金币和宝石。</p><span class="price">去冒险</span></button>' +
    '</div><p class="tip">这里不需要付费，所有金币和宝石都可以通过陪东玩获得。</p>';
  openOverlay(type === 'gem' ? '获取宝石' : '获取金币', '不用充值，陪东玩就能赚到', html, function(body){
    $$('[data-goto]', body).forEach(function(btn){
      btn.addEventListener('click', function(){
        var g = btn.getAttribute('data-goto');
        closeOverlay();
        setTimeout(function(){
          if (g === 'rewards') openRewards();
          else if (g === 'checkin') openCheckin();
          else if (g === 'minigame') openCarrotGame();
          else if (g === 'adventure') openAdventure();
        }, 260);
      });
    });
  });
}

/* ---------------- name ---------------- */
function openName(){
  $('#nameInput').value = state.name;
  $('#nameDialog').classList.add('show');
  setTimeout(function(){ $('#nameInput').focus(); }, 100);
}
function closeName(){ $('#nameDialog').classList.remove('show'); }
function saveName(){
  var v = $('#nameInput').value.replace(/\s+/g,'').slice(0,8) || '东';
  state.name = v;
  save(); render(); closeName();
  toast('名字已改为「' + v + '」');
  speak('你好呀，我是' + v + '。');
}

/* ---------------- rabbit parkour ---------------- */
/*
  Vertical 2.5D port of the 3-lane Unity parkour demo:
  three lanes, jump / slide / lane change, randomly spawned
  obstacles, recycled road segments and collision game over.
  The run happens on a canvas inside the already-portrait shell.
*/
var PK_LANES = [125, 250, 375];
var PK_PLAYER_Y = 812;
var PK_HORIZON = 258;
var pk = null;
var pkCanvas = null, pkCtx = null, pkImg = null, pkImgReady = false;
var pkRaf = 0, pkLast = 0, pkCountdownTimer = null, pkOverTimer = null;
var pkSwipe = null;

function pkDefault(){
  return {
    active:false, running:false, paused:false, over:false, energyCharged:false,
    lane:1, x:250, jumpT:0, slideT:0, speed:.34, t:0,
    distance:0, score:0, coinCount:0, carrotCount:0,
    obstacles:[], pickups:[], spawnTimer:.7, roadOffset:0,
    shake:0, hudTimer:0, result:null
  };
}
function pkJumpHeight(){
  if (!pk || pk.jumpT <= 0) return 0;
  var p = 1 - pk.jumpT / .62;
  return Math.sin(Math.max(0,Math.min(1,p)) * Math.PI) * 84;
}
function pkInit(){
  pkCanvas = $('#pkCanvas');
  if (!pkCanvas) return;
  pkCanvas.width = 1000;
  pkCanvas.height = 2000;
  pkCtx = pkCanvas.getContext('2d');
  pkCtx.setTransform(2,0,0,2,0,0);
  pk = pkDefault();
  pkImg = new Image();
  pkImg.onload = function(){ pkImgReady = true; if (pk && pk.active) pkDraw(); };
  pkImg.src = 'bunny.png';

  $('#pkStartBtn').addEventListener('click', pkBegin);
  $('#pkStartClose').addEventListener('click', closeParkour);
  $('#pkPause').addEventListener('click', pkPauseGame);
  $('#pkQuit').addEventListener('click', function(){
    if (pk && pk.running) pkPauseGame();
    else closeParkour();
  });
  $('#pkResume').addEventListener('click', pkResume);
  $('#pkExit').addEventListener('click', closeParkour);
  $$('[data-pk]').forEach(function(btn){
    btn.addEventListener('click', function(){ pkAction(btn.getAttribute('data-pk')); });
  });

  pkCanvas.addEventListener('pointerdown', function(e){
    if (!pk || !pk.running) return;
    e.preventDefault();
    pkSwipe = {x:e.clientX, y:e.clientY, t:performance.now()};
    try{ pkCanvas.setPointerCapture(e.pointerId); }catch(err){}
  });
  pkCanvas.addEventListener('pointerup', function(e){
    if (!pkSwipe || !pk || !pk.running) { pkSwipe = null; return; }
    var dx = e.clientX - pkSwipe.x, dy = e.clientY - pkSwipe.y;
    pkSwipe = null;
    if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy)){
      pkAction(dx > 0 ? 'right' : 'left');
    } else if (dy < -26){
      pkAction('jump');
    } else if (dy > 26){
      pkAction('slide');
    } else {
      var r = pkCanvas.getBoundingClientRect();
      var rx = (e.clientX - r.left) / Math.max(1,r.width);
      if (rx < .36) pkAction('left');
      else if (rx > .64) pkAction('right');
      else pkAction('jump');
    }
  });
  pkCanvas.addEventListener('pointercancel', function(){ pkSwipe = null; });

  document.addEventListener('keydown', function(e){
    if (!pk || !pk.active || !pk.running) return;
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A'){ e.preventDefault(); pkAction('left'); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D'){ e.preventDefault(); pkAction('right'); }
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' '){ e.preventDefault(); pkAction('jump'); }
    else if (k === 'ArrowDown' || k === 's' || k === 'S'){ e.preventDefault(); pkAction('slide'); }
  });
  document.addEventListener('visibilitychange', function(){
    if (document.hidden && pk && pk.running) pkPauseGame();
  });
}

function openParkour(){
  if (sleeping){ toast('东睡着了，等它醒了再去跑酷吧'); return; }
  if (state.energy < 10){ toast('精力不足，先让东休息一下吧'); return; }
  if (pk && pk.active) return;
  closeOverlay(true);
  if (gameRoot.classList.contains('show')) closeMini();
  hideSpeech();
  uiLocked = true;
  $('#parkourRoot').classList.add('show');
  $('#parkourRoot').setAttribute('aria-hidden','false');
  pk = pkDefault();
  pk.active = true;
  pk.energyCharged = false;
  $('#pkStart').classList.add('show');
  $('#pkOver').classList.remove('show');
  $('#pkPauseOver').classList.remove('show');
  $('#pkCount').classList.remove('show','go');
  $('#pkBest').textContent = state.parkourBest || 0;
  pkReset();
  pkDraw();
}

function pkReset(){
  if (!pk) return;
  pk.running = false;
  pk.over = false;
  pk.paused = false;
  pk.t = 0;
  pk.speed = .34;
  pk.distance = 0;
  pk.score = 0;
  pk.coinCount = 0;
  pk.carrotCount = 0;
  pk.lane = 1;
  pk.x = 250;
  pk.jumpT = 0;
  pk.slideT = 0;
  pk.obstacles = [];
  pk.pickups = [];
  pk.spawnTimer = .72;
  pk.roadOffset = 0;
  pk.shake = 0;
  pk.result = null;
  $('#pkDist').textContent = '0';
  $('#pkScore').textContent = '0';
  $('#pkBest').textContent = state.parkourBest || 0;
}

function pkBegin(){
  if (!pk || !pk.active) return;
  if (!pk.energyCharged){
    state.energy = clamp(state.energy - 10);
    pk.energyCharged = true;
    save(); render();
  }
  $('#pkStart').classList.remove('show');
  $('#pkOver').classList.remove('show');
  $('#pkPauseOver').classList.remove('show');
  $('#pkCount').classList.remove('go');
  pkReset();
  pkDraw();
  audio();

  var n = 3;
  $('#pkCount').textContent = n;
  $('#pkCount').classList.add('show');
  clearInterval(pkCountdownTimer);
  pkCountdownTimer = setInterval(function(){
    if (!pk || !pk.active){ clearInterval(pkCountdownTimer); return; }
    n -= 1;
    if (n > 0){
      $('#pkCount').textContent = n;
      $('#pkCount').classList.remove('go');
      tone(620, .08, 'sine', .04);
    } else if (n === 0){
      $('#pkCount').textContent = 'GO!';
      $('#pkCount').classList.add('go');
      tone(880, .16, 'sine', .05, 1320);
    } else {
      clearInterval(pkCountdownTimer);
      pkCountdownTimer = null;
      $('#pkCount').classList.remove('show','go');
      pk.running = true;
      pk.last = performance.now();
      pkLast = pk.last;
      pkRaf = requestAnimationFrame(pkLoop);
    }
  }, 700);
}

function pkPauseGame(){
  if (!pk || !pk.running) return;
  pk.running = false;
  cancelAnimationFrame(pkRaf);
  pkRaf = 0;
  pk.paused = true;
  $('#pkPauseOver').classList.add('show');
}
function pkResume(){
  if (!pk || !pk.active) return;
  $('#pkPauseOver').classList.remove('show');
  pk.paused = false;
  pk.running = true;
  pk.last = performance.now();
  pkLast = pk.last;
  pkRaf = requestAnimationFrame(pkLoop);
}
function pkAction(action){
  if (!pk || !pk.running) return;
  if (action === 'left' && pk.lane > 0){ pk.lane -= 1; tone(660,.07,'sine',.035,760); }
  else if (action === 'right' && pk.lane < 2){ pk.lane += 1; tone(660,.07,'sine',.035,760); }
  else if (action === 'jump'){
    if (pk.jumpT <= 0){ pk.jumpT = .62; pk.slideT = 0; tone(520,.12,'sine',.045,820); }
  } else if (action === 'slide'){
    if (pk.slideT <= 0){ pk.slideT = .62; pk.jumpT = 0; tone(280,.13,'triangle',.045,150); }
  }
}

function pkSpawnWave(){
  if (!pk) return;
  var lanes = [0,1,2];
  for (var i=lanes.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var tmp=lanes[i]; lanes[i]=lanes[j]; lanes[j]=tmp; }
  var count = Math.random() < .32 ? 2 : 1;
  for (var k=0;k<count;k++){
    var roll = Math.random();
    var type = roll < .42 ? 'truck' : roll < .75 ? 'barrier' : 'gate';
    pk.obstacles.push({lane:lanes[k], z:.02, type:type, checked:false, color:pkTruckColor()});
  }
  var free = lanes.slice(count);
  if (free.length && Math.random() < .82){
    var kind = Math.random() < .58 ? 'coin' : 'carrot';
    var num = Math.random() < .36 ? 3 : 1;
    for (var m=0;m<num;m++){
      pk.pickups.push({lane:free[0], z:.03 + m*.055, type:kind, checked:false});
    }
  }
}

function pkLoop(now){
  if (!pk || !pk.running) return;
  var dt = Math.min(.05, (now - pk.last) / 1000);
  pk.last = now;
  pk.t += dt;
  pk.speed = Math.min(.86, .34 + pk.t * .0105);
  pk.distance += pk.speed * dt * 42;
  pk.roadOffset = (pk.roadOffset + pk.speed * dt * 1.1) % 1;

  var targetX = PK_LANES[pk.lane];
  pk.x += (targetX - pk.x) * Math.min(1, dt * 14);
  if (pk.jumpT > 0) pk.jumpT = Math.max(0, pk.jumpT - dt);
  if (pk.slideT > 0) pk.slideT = Math.max(0, pk.slideT - dt);
  if (pk.shake > 0) pk.shake = Math.max(0, pk.shake - dt * 30);

  pk.spawnTimer -= dt;
  if (pk.spawnTimer <= 0){
    pkSpawnWave();
    pk.spawnTimer = Math.max(.48, .94 - pk.t * .0065) * rand(.86, 1.14);
  }

  for (var i=pk.obstacles.length-1;i>=0;i--){
    var o = pk.obstacles[i];
    o.z += pk.speed * dt;
    if (!o.checked && o.z >= .94){
      o.checked = true;
      if (o.lane === pk.lane){
        var cleared = false;
        if (o.type === 'barrier' && pkJumpHeight() > 36) cleared = true;
        if (o.type === 'gate' && pk.slideT > .08) cleared = true;
        if (!cleared){ pkCrash(); return; }
      }
    }
    if (o.z > 1.12) pk.obstacles.splice(i,1);
  }
  for (var j=pk.pickups.length-1;j>=0;j--){
    var p = pk.pickups[j];
    p.z += pk.speed * dt;
    if (!p.checked && p.z >= .9 && p.lane === pk.lane){
      p.checked = true;
      if (p.type === 'coin'){ pk.coinCount += 1; coinSound(); }
      else { pk.carrotCount += 1; bounceSound(); }
      pk.pickups.splice(j,1);
      continue;
    }
    if (p.z > 1.08) pk.pickups.splice(j,1);
  }

  pk.hudTimer -= dt;
  if (pk.hudTimer <= 0){
    pk.hudTimer = .08;
    pkUpdateHud();
  }
  pkDraw();
  pkRaf = requestAnimationFrame(pkLoop);
}

function pkUpdateHud(){
  if (!pk) return;
  var score = Math.floor(pk.distance) + pk.coinCount * 10 + pk.carrotCount * 20;
  pk.score = score;
  $('#pkDist').textContent = Math.floor(pk.distance);
  $('#pkScore').textContent = score;
}

function pkCrash(){
  if (!pk || pk.over) return;
  pk.over = true;
  pk.running = false;
  cancelAnimationFrame(pkRaf);
  pkRaf = 0;
  pk.shake = 9;
  hitSound();
  pkApplyResult();
  pkDraw();
  clearTimeout(pkOverTimer);
  pkOverTimer = setTimeout(function(){
    if (!pk || !pk.active) return;
    pkShowResult();
  }, 520);
}

function pkApplyResult(){
  if (!pk) return;
  var score = Math.floor(pk.distance) + pk.coinCount * 10 + pk.carrotCount * 20;
  var rewardCoins = Math.floor(pk.coinCount * 2 + pk.distance / 25);
  var rewardCarrots = pk.carrotCount;
  var isBest = score > (state.parkourBest || 0);
  if (isBest) state.parkourBest = score;
  state.coins += rewardCoins;
  state.food.carrot += rewardCarrots;
  state.mood = clamp(state.mood + Math.min(15, 3 + score / 100));
  state.counts.parkour = (state.counts.parkour || 0) + 1;
  bumpDaily('parkour', 1);
  addXp(2 + Math.floor(score / 40));
  save(); render();
  pk.result = {score:score, distance:Math.floor(pk.distance), coins:rewardCoins, carrots:rewardCarrots, best:state.parkourBest, isBest:isBest};
  $('#pkBest').textContent = state.parkourBest;
  if (isBest) chime();
}

function pkShowResult(){
  if (!pk || !pk.result) return;
  var r = pk.result;
  var card = $('#pkOverCard');
  card.innerHTML =
    '<div class="pk-result-emoji">' + (r.isBest ? '🏆' : '🥕') + '</div>' +
    '<div class="pk-kicker">' + (r.isBest ? '新纪录' : '本局结束') + '</div>' +
    '<h2>跑了 ' + r.distance + ' 米</h2>' +
    '<div class="pk-result-grid">' +
      '<div class="pk-result-row"><span>得分</span><b>' + r.score + '</b></div>' +
      '<div class="pk-result-row"><span>最佳纪录</span><b>' + r.best + '</b></div>' +
      '<div class="pk-result-row reward"><span>带回金币</span><b>+' + r.coins + '</b></div>' +
      '<div class="pk-result-row reward"><span>带回胡萝卜</span><b>+' + r.carrots + '</b></div>' +
    '</div>' +
    '<div class="pk-result-best">精力 -10 · 经验 +' + (2 + Math.floor(r.score / 40)) + '</div>' +
    '<div class="pk-over-btns"><button class="pk-primary" id="pkAgain">再来一次</button><button class="pk-ghost" id="pkHome">回小屋</button></div>';
  $('#pkAgain').addEventListener('click', function(){
    $('#pkOver').classList.remove('show');
    pkBegin();
  });
  $('#pkHome').addEventListener('click', closeParkour);
  $('#pkOver').classList.add('show');
}

function closeParkour(){
  cancelAnimationFrame(pkRaf);
  pkRaf = 0;
  clearInterval(pkCountdownTimer);
  pkCountdownTimer = null;
  clearTimeout(pkOverTimer);
  pkOverTimer = null;
  $('#pkCount').classList.remove('show','go');
  $('#pkStart').classList.remove('show');
  $('#pkOver').classList.remove('show');
  $('#pkPauseOver').classList.remove('show');
  $('#parkourRoot').classList.remove('show');
  $('#parkourRoot').setAttribute('aria-hidden','true');
  if (pk){ pk.active = false; pk.running = false; pk.paused = false; }
  uiLocked = false;
  render();
}

/* ---------------- coordinate projection / canvas art ---------------- */
function pkProject(lane,z){
  var t = .1 + z * .9;
  return {
    x: 250 + (PK_LANES[lane] - 250) * t,
    y: PK_HORIZON + z * 560,
    s: .2 + z * .9
  };
}
function pkRt(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function pkDraw(){
  if (!pk || !pkCtx) return;
  var ctx = pkCtx;
  ctx.save();
  ctx.clearRect(0,0,500,1000);
  if (pk.shake > 0){
    ctx.translate(rand(-pk.shake,pk.shake), rand(-pk.shake,pk.shake));
  }
  pkDrawWorld(ctx);
  var obs = pk.obstacles.slice().sort(function(a,b){ return a.z - b.z; });
  for (var i=0;i<obs.length;i++) pkDrawObstacle(ctx, obs[i]);
  var picks = pk.pickups.slice().sort(function(a,b){ return a.z - b.z; });
  for (var j=0;j<picks.length;j++) pkDrawPickup(ctx, picks[j]);
  pkDrawPlayer(ctx);
  if (pk.shake > 0){
    ctx.fillStyle = 'rgba(255,90,60,.12)';
    ctx.fillRect(-20,-20,540,1040);
  }
  ctx.restore();
}

function pkDrawWorld(ctx){
  var sky = ctx.createLinearGradient(0,0,0,360);
  sky.addColorStop(0,'#cfe9f2');
  sky.addColorStop(.5,'#f4e2c8');
  sky.addColorStop(1,'#f8d2a2');
  ctx.fillStyle = sky;
  ctx.fillRect(0,0,500,360);

  ctx.save();
  var sun = ctx.createRadialGradient(390,94,6,390,94,72);
  sun.addColorStop(0,'rgba(255,248,210,.98)');
  sun.addColorStop(.4,'rgba(255,225,160,.75)');
  sun.addColorStop(1,'rgba(255,210,140,0)');
  ctx.fillStyle = sun;
  ctx.beginPath(); ctx.arc(390,94,72,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ffe6a8';
  ctx.beginPath(); ctx.arc(390,94,30,0,Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,.85)';
  pkCloud(ctx, 78, 84, 1.1);
  pkCloud(ctx, 250, 52, .8);
  pkCloud(ctx, 154, 150, .62);

  var hill = ctx.createLinearGradient(0,230,0,330);
  hill.addColorStop(0,'#a9cf9b');
  hill.addColorStop(1,'#7eab79');
  ctx.fillStyle = hill;
  ctx.beginPath();
  ctx.moveTo(-30,300);
  ctx.quadraticCurveTo(60,210,150,270);
  ctx.quadraticCurveTo(230,205,330,262);
  ctx.quadraticCurveTo(420,210,530,292);
  ctx.lineTo(530,360); ctx.lineTo(-30,360); ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#92ba83';
  for (var t=0;t<9;t++){
    var tx = 18 + t * 57;
    var th = 34 + ((t*17)%28);
    ctx.beginPath(); ctx.arc(tx, 286 - th*.35, th*.55, Math.PI, 0); ctx.fill();
    ctx.fillRect(tx-2, 286 - th*.35, 4, th*.35);
  }

  ctx.fillStyle = '#6f9b68';
  ctx.fillRect(0,300,500,700);

  ctx.fillStyle = '#6d4a35';
  ctx.beginPath();
  ctx.moveTo(214,258);
  ctx.lineTo(286,258);
  ctx.lineTo(506,1000);
  ctx.lineTo(-6,1000);
  ctx.closePath();
  ctx.fill();

  var roadGlow = ctx.createLinearGradient(0,258,0,1000);
  roadGlow.addColorStop(0,'rgba(255,205,150,.28)');
  roadGlow.addColorStop(.45,'rgba(120,70,40,0)');
  roadGlow.addColorStop(1,'rgba(40,20,12,.22)');
  ctx.fillStyle = roadGlow;
  ctx.fillRect(0,258,500,742);

  ctx.strokeStyle = '#f2d0a1';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(214,258); ctx.lineTo(-6,1000); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(286,258); ctx.lineTo(506,1000); ctx.stroke();

  ctx.strokeStyle = 'rgba(255,239,209,.62)';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 30]);
  ctx.lineDashOffset = -pk.roadOffset * 90;
  for (var l=1;l<3;l++){
    var bottom = 183 + (l-1) * 134;
    ctx.beginPath(); ctx.moveTo(242 + (l-1)*16, 258); ctx.lineTo(bottom, 1000); ctx.stroke();
  }
  ctx.setLineDash([]);

  for (var q=0;q<7;q++){
    var z = (q/7 + pk.roadOffset) % 1;
    var y = 258 + z * 742;
    var x1 = 250 + (8-250) * (.1+z*.9);
    var x2 = 250 + (492-250) * (.1+z*.9);
    ctx.strokeStyle = 'rgba(255,226,187,' + (.03 + z*.045) + ')';
    ctx.lineWidth = 2 + z*3;
    ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke();
  }

  pkDrawRoadside(ctx, -1);
  pkDrawRoadside(ctx, 1);

  if (pk.running && pk.speed > .52){
    ctx.strokeStyle = 'rgba(255,245,220,.2)';
    ctx.lineWidth = 2;
    for (var s=0;s<6;s++){
      var sy = 330 + ((s*97 + pk.roadOffset*400)%520);
      var sx = 40 + ((s*73)%420);
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx + (sx<250?-34:34), sy-40); ctx.stroke();
    }
  }
}

function pkCloud(ctx,x,y,s){
  ctx.save(); ctx.globalAlpha = .72; ctx.translate(x,y); ctx.scale(s,s);
  ctx.beginPath();
  ctx.arc(-22,0,18,0,Math.PI*2);
  ctx.arc(0,-8,25,0,Math.PI*2);
  ctx.arc(26,1,17,0,Math.PI*2);
  ctx.arc(4,8,21,0,Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function pkDrawRoadside(ctx, side){
  for (var i=0;i<5;i++){
    var z = (i/5 + pk.roadOffset * .55) % 1;
    if (z < .05) continue;
    var y = 258 + z * 742;
    var edge = side < 0 ? 250 + (8-250) * (.1+z*.9) : 250 + (492-250) * (.1+z*.9);
    var s = .18 + z*.9;
    ctx.save();
    ctx.translate(edge + side*24*s, y);
    ctx.scale(s,s);
    ctx.strokeStyle = '#5e4434';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-84); ctx.stroke();
    ctx.fillStyle = '#f6d79e';
    ctx.beginPath(); ctx.arc(0,-90,11,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,211,124,.22)';
    ctx.beginPath(); ctx.arc(0,-90,26,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

function pkDrawObstacle(ctx,o){
  var p = pkProject(o.lane,o.z);
  if (o.z > 1.05) return;
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.scale(p.s,p.s);
  ctx.globalAlpha = Math.min(1, .35 + o.z*2);
  ctx.fillStyle = 'rgba(40,20,12,.26)';
  ctx.beginPath(); ctx.ellipse(0,3,48,10,0,0,Math.PI*2); ctx.fill();
  if (o.type === 'truck') pkDrawTruck(ctx, o.color || '#7fb0bd');
  else if (o.type === 'barrier') pkDrawBarrier(ctx);
  else pkDrawGate(ctx);
  ctx.restore();
}

function pkDrawTruck(ctx, color){
  ctx.fillStyle = '#3a2a22';
  ctx.beginPath(); ctx.arc(-27,-5,10,0,Math.PI*2); ctx.arc(28,-5,10,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#cfd8d8';
  ctx.beginPath(); ctx.arc(-27,-5,4,0,Math.PI*2); ctx.arc(28,-5,4,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#e8a35f';
  pkRt(ctx,-44,-48,34,44,5); ctx.fill();
  ctx.fillStyle = '#b7e2ec';
  pkRt(ctx,-39,-42,24,17,3); ctx.fill();
  ctx.fillStyle = '#4b7e8e';
  pkRt(ctx,-42,-24,6,8,2); ctx.fill();
  ctx.fillStyle = color || '#7fb0bd';
  pkRt(ctx,-12,-78,56,72,6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  pkRt(ctx,-7,-72,22,60,4); ctx.fill();
  ctx.fillStyle = 'rgba(60,30,15,.16)';
  ctx.fillRect(22,-70,3,58);
  ctx.fillStyle = '#fff0c8';
  ctx.beginPath(); ctx.arc(-38,-55,3,0,Math.PI*2); ctx.arc(40,-50,3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#5c3b2a';
  ctx.fillRect(-45,-50,90,6);
  ctx.fillStyle = '#2f241e';
  ctx.fillRect(-44,-6,88,7);
}
function pkTruckColor(){
  var colors = ['#7fb0bd','#d98b6b','#8ea7cc','#b9a06c'];
  return colors[Math.floor(Math.random()*colors.length)];
}
function pkDrawBarrier(ctx){
  ctx.fillStyle = '#6b4c36';
  ctx.fillRect(-42,-16,7,16); ctx.fillRect(35,-16,7,16);
  ctx.fillStyle = '#f08a52';
  pkRt(ctx,-48,-36,96,22,4); ctx.fill();
  ctx.fillStyle = '#fff3da';
  for (var i=0;i<4;i++){ ctx.save(); ctx.translate(-38 + i*24,-32); ctx.rotate(-.35); ctx.fillRect(0,0,10,26); ctx.restore(); }
  ctx.fillStyle = '#8b4d30';
  ctx.fillRect(-48,-38,96,4);
  ctx.fillStyle = '#ffe5ad';
  ctx.beginPath(); ctx.arc(0,-52,9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#c65032';
  ctx.font = 'bold 16px sans-serif'; ctx.textAlign='center'; ctx.fillText('!',0,-46);
}
function pkDrawGate(ctx){
  ctx.fillStyle = '#5b4030';
  ctx.fillRect(-45,-88,8,88); ctx.fillRect(37,-88,8,88);
  ctx.fillStyle = '#d96d4d';
  pkRt(ctx,-50,-98,100,18,5); ctx.fill();
  ctx.fillStyle = '#fff1d2';
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('SLIDE',0,-85);
  ctx.fillStyle = 'rgba(255,240,210,.92)';
  for (var i=0;i<4;i++){ ctx.fillRect(-38 + i*21,-72,12,30); }
  ctx.fillStyle = 'rgba(217,109,77,.5)';
  ctx.beginPath(); ctx.arc(0,-114,8,0,Math.PI*2); ctx.fill();
}

function pkDrawPickup(ctx,p){
  var pos = pkProject(p.lane,p.z);
  ctx.save();
  ctx.translate(pos.x,pos.y);
  ctx.scale(.5 + p.z*.75, .5 + p.z*.75);
  ctx.globalAlpha = Math.min(1,.4+p.z*2);
  if (p.type === 'coin'){
    ctx.fillStyle = 'rgba(255,220,120,.18)';
    ctx.beginPath(); ctx.arc(0,-8,26,0,Math.PI*2); ctx.fill();
    var g = ctx.createLinearGradient(-12,-22,12,4);
    g.addColorStop(0,'#fff1a8'); g.addColorStop(.5,'#ffc94c'); g.addColorStop(1,'#e69a2c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0,-8,13,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff0b0'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff7cf';
    ctx.beginPath(); ctx.arc(-4,-12,4,0,Math.PI*2); ctx.fill();
  } else {
    ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🥕',0,-10);
    ctx.fillStyle = 'rgba(255,225,170,.16)';
    ctx.beginPath(); ctx.arc(0,-10,24,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function pkDrawPlayer(ctx){
  var x = pk.x, jump = pkJumpHeight(), y = PK_PLAYER_Y;
  ctx.save();
  ctx.fillStyle = 'rgba(55,30,18,.28)';
  ctx.beginPath(); ctx.ellipse(x, y + 5, 46 - jump*.14, 10, 0, 0, Math.PI*2); ctx.fill();
  ctx.translate(x, y - jump);
  if (pk.slideT > 0) ctx.scale(1.02, .56);
  if (pkImgReady){
    ctx.drawImage(pkImg, -50, -117, 100, 117);
  } else {
    ctx.fillStyle = '#e7c39d';
    ctx.beginPath(); ctx.ellipse(0,-54,38,43,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-19,-100,10,24,-.2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(17,-102,9,22,.22,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
  if (pk.jumpT > 0 && pk.jumpT < .2){
    ctx.fillStyle = 'rgba(255,238,205,.45)';
    for (var i=0;i<4;i++){
      ctx.beginPath(); ctx.arc(x + rand(-30,30), y - 4 + rand(-4,5), rand(3,7), 0, Math.PI*2); ctx.fill();
    }
  }
}

/* ---------------- init ---------------- */
function init(){
  state = loadState();
  soundOn = state.sound !== 0;
  ensureDaily();
  fitStage();
  render();
  pkInit();
  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', function(){ setTimeout(fitStage, 260); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitStage);

  petWrap.addEventListener('pointerdown', startPet);
  petWrap.addEventListener('pointermove', movePet);
  petWrap.addEventListener('pointerup', endPet);
  petWrap.addEventListener('pointercancel', endPet);
  petWrap.addEventListener('pointerleave', function(e){ if (e.pointerType === 'mouse' && petting) endPet(); });

  $$('.action-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      audio();
      var a = btn.getAttribute('data-action');
      if (a === 'pet') petAction();
      else if (a === 'feed') openFeed();
      else if (a === 'play') openYarnGame();
      else if (a === 'dress') openDress();
      else if (a === 'sleep') sleepAction();
    });
  });
  $$('[data-open]').forEach(function(btn){
    btn.addEventListener('click', function(){
      audio();
      var a = btn.getAttribute('data-open');
      if (a === 'checkin') openCheckin();
      else if (a === 'rewards') openRewards();
      else if (a === 'minigame') openCarrotGame();
      else if (a === 'adventure') openAdventure();
      else if (a === 'battle') openBattle();
      else if (a === 'parkour') openParkour();
    });
  });
  $$('[data-shop]').forEach(function(btn){
    btn.addEventListener('click', function(){ audio(); openShop(btn.getAttribute('data-shop')); });
  });
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#healBtn').addEventListener('click', healAction);
  $('#editName').addEventListener('click', openName);
  $('#nameCancel').addEventListener('click', closeName);
  $('#nameSave').addEventListener('click', saveName);
  $('#nameInput').addEventListener('keydown', function(e){ if (e.key === 'Enter') saveName(); });
  $('#wakeBtn').addEventListener('click', wakeUp);
  $('#rotateFullscreen').addEventListener('click', goFullscreen);
  document.addEventListener('pointerdown', function once(){ audio(); document.removeEventListener('pointerdown', once); }, {once:true, passive:true});

  setTimeout(function(){ speak(greeting(), 4200); }, 700);
  setTimeout(function(){ if (state.counts.pet === 0) speak('用手指摸摸我，或者点下面的按钮。'); }, 5200);
  setInterval(function(){
    state.hunger = clamp(state.hunger - .04);
    state.mood = clamp(state.mood - .02);
    save(); render();
  }, 30000);
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);
}
function greeting(){
  if (!state.counts.pet && !state.counts.feed && !state.counts.play && !state.counts.sleep){
    return 'Hi～我是' + state.name + '。<br>一起玩吧！';
  }
  var h = new Date().getHours();
  if (state.hunger < 25) return '肚子好饿…<br>有胡萝卜吗？';
  if (state.mood < 25) return '今天有点没精神…<br>陪陪我好不好？';
  if (h >= 5 && h < 10) return '早安～<br>今天也一起玩吧！';
  if (h >= 10 && h < 14) return '阳光刚刚好，<br>要一起晒太阳吗？';
  if (h >= 14 && h < 18) return '你闻到胡萝卜的味道了吗？';
  if (h >= 18 && h < 23) return '今天也辛苦了，<br>摸摸我吧。';
  return '这么晚还没睡？<br>那我陪你一会儿。';
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
