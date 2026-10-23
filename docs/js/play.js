// Single-player flow: start screen, six stations, your finished biscuit.
(function () {
  'use strict';

  var $ = function (id) {
    return document.getElementById(id);
  };
  var S = window.STATIONS;
  var SCREENS = ['start', 'play', 'done'];
  var N = S.LIST.length;

  var state = { seed: 0, daily: false, results: [], run: 0 };
  var stage = null;
  var timers = [];

  function show(name) {
    SCREENS.forEach(function (s) {
      $('screen-' + s).classList.toggle('hidden', s !== name);
    });
    $('brand').style.visibility = name === 'start' ? 'hidden' : 'visible';
    window.scrollTo(0, 0);
  }
  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  // ---------- setup ----------
  $('brand').innerHTML = ART.hatSVG(BK.HATS[2], 34) + '<span>Biscuit Bake-Off</span>';
  $('mascot').appendChild(ART.biscuitCanvas({ rise: 0.9, layers: 6, round: 1, brown: 0.62, tender: 1, mood: 1, seed: 3 }, 280));

  function setMuteIcon() {
    $('muteBtn').textContent = BK.isMuted() ? '🔇' : '🔊';
    $('muteBtn').setAttribute('aria-label', BK.isMuted() ? 'Sound off' : 'Sound on');
  }
  $('muteBtn').addEventListener('click', function () {
    BK.setMuted(!BK.isMuted());
    setMuteIcon();
  });
  setMuteIcon();

  $('playBtn').addEventListener('click', function () {
    start(false);
  });
  $('dailyBtn').addEventListener('click', function () {
    start(true);
  });
  $('againBtn').addEventListener('click', function () {
    start(state.daily);
  });
  $('homeBtn').addEventListener('click', goHome);

  // ---------- today's class challenge: same seed for everyone on the same date ----------
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dateSeed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function prettyDay() {
    return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  // ---------- personal bests (saved in this browser) ----------
  function saved() {
    return BK.local.get('bk-best') || {};
  }
  function renderBest() {
    var b = saved();
    var has = typeof b.best === 'number';
    $('bestBox').classList.toggle('hidden', !has);
    if (has) {
      var art = $('bestArt');
      art.innerHTML = '';
      art.appendChild(ART.biscuitCanvas(b.bestLook, 96));
      $('bestTitle').textContent = S.rating(b.best).title;
      $('bestPts').textContent = b.best + ' / 600 points';
    }
    var d = b.dailyDate === today() ? b.dailyBest : null;
    $('dailyNote').textContent =
      typeof d === 'number'
        ? "Your best in today's challenge: " + d + ' points. Everyone gets the same kitchen today, so compare with your class!'
        : 'Everyone who plays today gets the exact same flour, butter and oven. Compare scores with your class!';
  }

  function goHome() {
    stopFlow();
    renderBest();
    show('start');
  }

  // ---------- stations flow ----------
  function ensureStage() {
    if (!stage) stage = new S.Stage($('stageBox'));
    return stage;
  }
  function stopFlow() {
    clearTimers();
    if (stage) stage.stop();
    state.run++;
    hideOverlay();
  }
  function seedFor(i) {
    return (state.seed + i * 7919) >>> 0;
  }
  function scoreClass(s) {
    return s >= 80 ? 'good' : s >= 50 ? 'meh' : 'bad';
  }

  function start(daily) {
    stopFlow();
    state.daily = daily;
    state.seed = daily ? dateSeed('biscuit-' + today()) : Math.floor(Math.random() * 2147483647);
    state.results = Array(N).fill(null);
    BK.sfx.pop();
    nextStation();
  }

  function renderProgress(current) {
    $('progress').innerHTML = S.LIST.map(function (def, i) {
      var r = state.results[i];
      var cls = 'step';
      if (r) cls += ' done ' + (r.score >= 80 ? '' : r.score >= 50 ? 'meh' : 'bad');
      else if (i === current) cls += ' now';
      return '<span class="' + cls + '"' + (i === current ? ' aria-current="step"' : '') + '><span class="dot">' + (r ? '✓' : i + 1) + '</span><span class="label">' + def.title + '</span></span>';
    }).join('');
  }

  var overlayAt = 0;
  // ignore clicks for a moment so key-mashing from the last station can't skip ahead
  function overlayReady() {
    return Date.now() - overlayAt > 600;
  }
  function showOverlay(html) {
    overlayAt = Date.now();
    var o = $('overlay');
    o.innerHTML = '<div class="card">' + html + '</div>';
    o.classList.remove('hidden');
    $('stageBox').classList.add('has-overlay');
    var b = o.querySelector('button');
    if (b) {
      try {
        b.focus({ preventScroll: true });
      } catch (e) {}
    }
  }
  function hideOverlay() {
    $('overlay').classList.add('hidden');
    $('stageBox').classList.remove('has-overlay');
  }

  function firstOpen() {
    for (var i = 0; i < N; i++) if (!state.results[i]) return i;
    return N;
  }

  function nextStation() {
    var i = firstOpen();
    if (i >= N) return finishBiscuit();
    show('play');
    renderProgress(i);
    var def = S.LIST[i];
    ensureStage();
    previewStation(def, seedFor(i));
    showOverlay(
      '<div class="kicker">' + (state.daily ? "Today's challenge: station " : 'Station ') + (i + 1) + ' of ' + N + '</div>' +
        '<h2>' + def.title + '</h2>' +
        '<p>' + def.how + '</p>' +
        '<button class="btn big" type="button" id="goBtn">Start</button>' +
        '<div class="hint">Mouse, touchscreen, or keyboard all work.</div>'
    );
    var run = state.run;
    $('goBtn').addEventListener('click', function () {
      if (state.run !== run || !overlayReady()) return;
      hideOverlay();
      BK.sfx.pop();
      stage.run(def, seedFor(i), function (res) {
        if (state.run !== run) return;
        stationDone(i, res);
      });
    });
  }

  // draw one still frame of the station behind the instructions
  function previewStation(def, seed) {
    stage.stop();
    var inst = def.create({ done: function () {} }, BK.rng(seed));
    stage.ctx.clearRect(0, 0, S.W, S.H);
    inst.draw(stage.ctx);
  }

  function stationDone(i, res) {
    state.results[i] = res;
    renderProgress(-1);
    var last = firstOpen() >= N;
    var run = state.run;
    showOverlay(
      '<div class="kicker">' + S.LIST[i].title + '</div>' +
        '<div class="score-big ' + scoreClass(res.score) + '">' + res.score + '</div>' +
        '<p>' + BK.esc(res.note) + '</p>' +
        '<button class="btn big" type="button" id="nextBtn">' + (last ? 'See my biscuit' : 'Next station') + '</button>'
    );
    var go = function (e) {
      if (state.run !== run) return;
      if (e && !overlayReady()) return;
      clearTimers();
      nextStation();
    };
    $('nextBtn').addEventListener('click', go);
    later(go, last ? 2600 : 3200);
  }

  function finishBiscuit() {
    hideOverlay();
    if (stage) stage.stop();
    var look = S.lookFrom(state.results, state.seed);
    var pts = state.results.reduce(function (a, r) {
      return a + (r ? r.score : 0);
    }, 0);
    var rate = S.rating(pts);

    // save personal bests
    var b = saved();
    var newBest = typeof b.best !== 'number' || pts > b.best;
    if (newBest) {
      b.best = pts;
      b.bestLook = look;
    }
    if (state.daily) {
      if (b.dailyDate !== today()) {
        b.dailyDate = today();
        b.dailyBest = pts;
      } else if (pts > b.dailyBest) b.dailyBest = pts;
    }
    BK.local.set('bk-best', b);

    var box = $('myBiscuit');
    box.innerHTML = '';
    box.appendChild(ART.biscuitCanvas(look, 360));
    $('doneKicker').textContent = state.daily ? "Today's class challenge (" + prettyDay() + ')' : 'Your biscuit';
    $('doneRating').textContent = rate.title;
    $('doneLine').textContent = rate.line;
    $('donePoints').textContent = pts + ' / 600 points';
    $('newBest').classList.toggle('hidden', !newBest);
    $('doneBreakdown').innerHTML = S.LIST.map(function (def, i) {
      var r = state.results[i];
      return '<li><span>' + def.title + '</span><b>' + (r ? r.score : 0) + '</b></li>';
    }).join('');
    var bits = [];
    if (!newBest) bits.push('Your best ever: ' + b.best + ' points.');
    if (state.daily) bits.push("Your best in today's challenge: " + b.dailyBest + ' points.');
    $('doneBest').textContent = bits.join(' ');
    $('againBtn').textContent = state.daily ? 'Try the challenge again' : 'Bake again';
    show('done');
    if (pts >= 570) BK.sfx.fanfare();
    else BK.sfx.ding();
  }

  // ---------- boot ----------
  renderBest();
  show('start');
})();
