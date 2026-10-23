// Student side: join a room, play the six stations, see your biscuit.
(function () {
  'use strict';

  var $ = function (id) {
    return document.getElementById(id);
  };
  var S = window.STATIONS;
  var SCREENS = ['join', 'wait', 'play', 'done', 'results'];
  var N = S.LIST.length;

  var state = {
    mode: null, // 'live' | 'practice'
    net: null,
    code: '',
    token: null,
    name: '',
    hat: 0,
    round: 0,
    seed: 0,
    status: '',
    results: [],
    flowRound: null,
    finishSent: false,
    rank: null,
    of: null,
    joined: false,
  };
  var stage = null;
  var timers = [];

  function show(name) {
    SCREENS.forEach(function (s) {
      $('screen-' + s).classList.toggle('hidden', s !== name);
    });
    $('brand').style.visibility = name === 'join' ? 'hidden' : 'visible';
    window.scrollTo(0, 0);
  }

  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  // ---------- setup ----------
  $('brand').innerHTML = ART.hatSVG(BK.HATS[0], 34) + '<span>Biscuit Bake-Off</span>';
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

  // hat picker
  var saved = BK.local.get('bk-me') || {};
  state.hat = typeof saved.hat === 'number' ? saved.hat : Math.floor(Math.random() * 8);
  if (saved.name) $('nameIn').value = saved.name;
  function renderHats() {
    $('hats').innerHTML = BK.HATS.map(function (c, i) {
      return (
        '<button type="button" class="hat-choice" role="radio" aria-checked="' + (i === state.hat) + '" aria-label="' + BK.HAT_NAMES[i] + ' hat" data-i="' + i + '" tabindex="' + (i === state.hat ? 0 : -1) + '">' +
        ART.hatSVG(c, 40) +
        '</button>'
      );
    }).join('');
  }
  renderHats();
  $('hats').addEventListener('click', function (e) {
    var b = e.target.closest('.hat-choice');
    if (!b) return;
    state.hat = Number(b.dataset.i);
    renderHats();
    $('hats').querySelector('[data-i="' + state.hat + '"]').focus();
    BK.sfx.pop();
  });
  $('hats').addEventListener('keydown', function (e) {
    var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    state.hat = (state.hat + d + 8) % 8;
    renderHats();
    $('hats').querySelector('[data-i="' + state.hat + '"]').focus();
  });

  var qs = new URLSearchParams(location.search);
  if (qs.get('code')) $('codeIn').value = qs.get('code').replace(/\D/g, '').slice(0, 4);
  $('codeIn').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 4);
  });

  function joinError(msg) {
    var el = $('joinError');
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
  }

  $('joinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('codeIn').value.trim();
    var name = $('nameIn').value.trim();
    if (code.length !== 4) return joinError('Room codes are 4 numbers. Check the board.');
    if (!name) return joinError('Type a chef name so the class knows whose biscuit is whose.');
    joinError('');
    BK.local.set('bk-me', { name: name, hat: state.hat });
    BK.sfx.pop();
    startLive(code, name, state.hat, null);
  });

  $('practiceBtn').addEventListener('click', startPractice);
  $('waitBack').addEventListener('click', goHome);
  $('homeBtn').addEventListener('click', goHome);
  $('againBtn').addEventListener('click', startPractice);

  // ---------- screens ----------
  function meChip() {
    return '<span class="me-chip">' + ART.hatSVG(BK.HATS[state.hat], 34) + BK.esc(state.name) + '</span>';
  }

  function showWait(title, text, opts) {
    opts = opts || {};
    $('waitTitle').textContent = title;
    $('waitText').textContent = text || '';
    $('waitMe').innerHTML = opts.me ? meChip() : '';
    $('waitBack').classList.toggle('hidden', !opts.back);
    var art = $('waitArt');
    art.innerHTML = '';
    art.appendChild(ART.biscuitCanvas(opts.look || { rise: 0.7, layers: 4, round: 0.9, brown: 0.55, tender: 0.9, mood: opts.sad ? 0.25 : 0.85, seed: 5 }, 200));
    show('wait');
  }

  function goHome() {
    stopFlow();
    if (state.net) state.net.stop();
    state.net = null;
    state.mode = null;
    state.token = null;
    state.joined = false;
    BK.session.del('bk-session');
    BK.session.del('bk-progress');
    show('join');
  }

  function endWith(title, text) {
    if (state.net) state.net.stop();
    state.net = null;
    stopFlow();
    BK.session.del('bk-session');
    BK.session.del('bk-progress');
    state.token = null;
    showWait(title, text, { back: true, sad: true });
  }

  // ---------- stations flow ----------
  function ensureStage() {
    if (!stage) stage = new S.Stage($('stageBox'));
    return stage;
  }

  function stopFlow() {
    clearTimers();
    if (stage) stage.stop();
    state.flowRound = null;
    hideOverlay();
  }

  function seedFor(i) {
    return (state.seed + i * 7919) >>> 0;
  }

  function scoreClass(s) {
    return s >= 80 ? 'good' : s >= 50 ? 'meh' : 'bad';
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
      '<div class="kicker">Station ' + (i + 1) + ' of ' + N + '</div>' +
        '<h2>' + def.title + '</h2>' +
        '<p>' + def.how + '</p>' +
        '<button class="btn big" type="button" id="goBtn">Start</button>' +
        '<div class="hint">Mouse, touchscreen, or keyboard all work.</div>'
    );
    var round = state.flowRound;
    $('goBtn').addEventListener('click', function () {
      if (state.flowRound !== round || !overlayReady()) return;
      hideOverlay();
      BK.sfx.pop();
      stage.run(def, seedFor(i), function (res) {
        if (state.flowRound !== round) return;
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
    saveProgress();
    if (state.mode === 'live' && state.net) {
      state.net.send({ t: 'progress', round: state.round, station: i, score: res.score });
    }
    renderProgress(-1);
    var last = firstOpen() >= N;
    var round = state.flowRound;
    showOverlay(
      '<div class="kicker">' + S.LIST[i].title + '</div>' +
        '<div class="score-big ' + scoreClass(res.score) + '">' + res.score + '</div>' +
        '<p>' + BK.esc(res.note) + '</p>' +
        '<button class="btn big" type="button" id="nextBtn">' + (last ? 'See my biscuit' : 'Next station') + '</button>'
    );
    var go = function (e) {
      if (state.flowRound !== round) return;
      if (e && !overlayReady()) return;
      clearTimers();
      nextStation();
    };
    $('nextBtn').addEventListener('click', go);
    later(go, last ? 2600 : 3200);
  }

  function points() {
    return state.results.reduce(function (a, r) {
      return a + (r ? r.score : 0);
    }, 0);
  }

  function finishBiscuit() {
    hideOverlay();
    if (stage) stage.stop();
    var look = S.lookFrom(state.results, state.seed);
    var pts = points();
    var rate = S.rating(pts);
    if (state.mode === 'live' && state.net && !state.finishSent) {
      if (state.net.send({ t: 'finish', round: state.round, look: look })) state.finishSent = true;
    }
    var box = $('myBiscuit');
    box.innerHTML = '';
    box.appendChild(ART.biscuitCanvas(look, 360));
    $('doneKicker').textContent = state.mode === 'practice' ? 'Practice biscuit' : 'Round ' + state.round + ' biscuit';
    $('doneRating').textContent = rate.title;
    $('doneLine').textContent = rate.line;
    $('donePoints').textContent = pts + ' / 600 points';
    $('doneBreakdown').innerHTML = S.LIST.map(function (def, i) {
      var r = state.results[i];
      return '<li><span>' + def.title + '</span><b>' + (r ? r.score : 0) + '</b></li>';
    }).join('');
    var live = state.mode === 'live';
    $('doneWaiting').classList.toggle('hidden', !live);
    $('doneRank').classList.toggle('hidden', !live);
    $('practiceAgain').classList.toggle('hidden', live);
    updateRank();
    show('done');
    if (pts >= 570) BK.sfx.fanfare();
    else BK.sfx.ding();
  }

  function updateRank() {
    if (!state.rank) {
      $('doneRank').textContent = '';
      return;
    }
    $('doneRank').textContent = "You're #" + state.rank + ' of ' + state.of + ' so far';
  }

  // reactions
  $('reacts').innerHTML = BK.REACTS.map(function (e, i) {
    return '<button type="button" class="react-btn" data-e="' + i + '" aria-label="Send ' + e + '">' + e + '</button>';
  }).join('');
  $('reacts').addEventListener('click', function (ev) {
    var b = ev.target.closest('.react-btn');
    if (!b || !state.net) return;
    state.net.send({ t: 'react', e: Number(b.dataset.e) });
    BK.sfx.pop();
    var all = $('reacts').querySelectorAll('button');
    all.forEach(function (x) {
      x.disabled = true;
    });
    setTimeout(function () {
      all.forEach(function (x) {
        x.disabled = false;
      });
    }, 1600);
  });

  // ---------- progress persistence (survives a refresh) ----------
  function saveProgress() {
    if (state.mode !== 'live') return;
    BK.session.set('bk-progress', { code: state.code, round: state.round, seed: state.seed, results: state.results });
  }
  function loadProgress() {
    var p = BK.session.get('bk-progress');
    if (p && p.code === state.code && p.round === state.round && Array.isArray(p.results)) return p.results;
    return null;
  }

  // ---------- practice ----------
  function startPractice() {
    stopFlow();
    if (state.net) state.net.stop();
    state.net = null;
    state.mode = 'practice';
    state.name = $('nameIn').value.trim() || 'Chef';
    state.seed = Math.floor(Math.random() * 2147483647);
    state.round = 0;
    state.results = Array(N).fill(null);
    state.rank = null;
    state.flowRound = 'practice-' + state.seed;
    nextStation();
  }

  // ---------- live ----------
  function startLive(code, name, hat, token) {
    stopFlow();
    state.mode = 'live';
    state.code = code;
    state.name = name || state.name;
    state.hat = hat;
    state.token = token;
    state.joined = false;
    state.rank = null;
    showWait('Preheating the oven…', 'Connecting to the kitchen.', { back: true });

    var net = new BK.Net(window.BISCUIT_SERVER);
    state.net = net;
    net.on('open', function () {
      $('netbar').classList.add('hidden');
      if (state.token) net.send({ t: 'rejoin', code: state.code, token: state.token });
      else net.send({ t: 'join', code: state.code, name: state.name, hat: state.hat });
    });
    net.on('retrying', function (m) {
      if (!state.joined) {
        $('waitText').textContent = m.tries > 2 ? 'The game server naps when nobody is playing. It can take up to a minute to wake up…' : 'Connecting to the kitchen.';
      } else {
        $('netbar').classList.remove('hidden');
      }
    });
    net.on('down', function () {
      if (state.joined) $('netbar').classList.remove('hidden');
    });
    net.on('error', function (m) {
      net.stop();
      state.net = null;
      show('join');
      joinError(m.msg || 'Something went wrong. Try again.');
    });
    net.on('rejoin_failed', function () {
      net.stop();
      state.net = null;
      BK.session.del('bk-session');
      BK.session.del('bk-progress');
      state.token = null;
      show('join');
      joinError('That game has ended. Join again with the code on the board.');
    });
    net.on('joined', onJoined);
    net.on('status', function (m) {
      applyStatus(m.status, m.round, m.seed, null, null);
    });
    net.on('rank', function (m) {
      state.rank = m.rank;
      state.of = m.of;
      updateRank();
    });
    net.on('results', onResults);
    net.on('kicked', function () {
      endWith('You were removed from the kitchen', 'Ask your teacher if that was a mistake.');
    });
    net.on('closed', function () {
      endWith('The kitchen is closed', 'Thanks for baking!');
    });
    net.on('replaced', function () {
      endWith('Opened somewhere else', 'You joined from another tab or device. Keep baking over there.');
    });
    net.connect();
  }

  function onJoined(m) {
    state.joined = true;
    state.token = m.token;
    state.name = m.name;
    state.hat = m.hat;
    state.code = m.code;
    BK.session.set('bk-session', { code: m.code, token: m.token, name: m.name, hat: m.hat });
    $('brand').innerHTML = ART.hatSVG(BK.HATS[state.hat], 34) + '<span>' + BK.esc(state.name) + "'s kitchen</span>";
    $('netbar').classList.add('hidden');
    applyStatus(m.status, m.round, m.seed, m.scores, m.done);
  }

  function applyStatus(status, round, seed, serverScores, serverDone) {
    state.status = status;
    if (status === 'lobby') {
      stopFlow();
      showWait("You're in!", state.round ? 'Nice baking. Waiting for the next round to start…' : 'Waiting for your teacher to start the bake-off.', { me: true });
      return;
    }
    if (status === 'results') {
      stopFlow();
      showWait('The judges are tasting…', '', { me: true });
      return;
    }
    if (status !== 'playing') return;

    if (state.flowRound !== round) {
      // new round, or picking up after a refresh
      var sameRound = state.round === round && state.seed === seed;
      state.round = round;
      state.seed = seed;
      state.results = loadProgress() || (sameRound ? state.results : null) || Array(N).fill(null);
      state.finishSent = !!serverDone;
      if (!sameRound && !loadProgress()) state.rank = null;
    }
    // fill in anything the server knows that this tab forgot
    if (serverScores && serverScores.length) {
      serverScores.forEach(function (s, i) {
        if (typeof s === 'number' && !state.results[i]) state.results[i] = { score: s, note: '', data: {} };
      });
    }
    // re-send anything the server missed while we were offline
    state.results.forEach(function (r, i) {
      if (r && (!serverScores || typeof serverScores[i] !== 'number')) {
        state.net.send({ t: 'progress', round: state.round, station: i, score: r.score });
      }
    });
    if (serverDone === false) state.finishSent = false;
    saveProgress();

    if (state.flowRound === round) {
      // already playing this round; just make sure a finished biscuit got reported
      if (firstOpen() >= N && !state.finishSent) {
        if (state.net.send({ t: 'finish', round: state.round, look: S.lookFrom(state.results, state.seed) })) state.finishSent = true;
      }
      return;
    }
    stopFlow();
    state.flowRound = round;
    nextStation();
  }

  function onResults(m) {
    stopFlow();
    state.rank = m.rank;
    state.of = m.of;
    $('resMine').textContent = 'You placed #' + m.rank + ' of ' + m.of + ' with ' + m.points + ' points.';
    renderPodium($('podium'), m.top);
    show('results');
  }

  function renderPodium(el, top) {
    el.innerHTML = '';
    var order = [1, 0, 2];
    order.forEach(function (idx) {
      var p = top[idx];
      var d = document.createElement('div');
      d.className = 'pod p' + (idx + 1);
      if (p) {
        d.appendChild(ART.biscuitCanvas(p.look || null, idx === 0 ? 180 : 140));
        var who = document.createElement('div');
        who.className = 'who';
        who.innerHTML = ART.hatSVG(BK.HATS[p.hat], 28) + '<span>' + BK.esc(p.name) + '</span>';
        d.appendChild(who);
        var pts = document.createElement('div');
        pts.className = 'pts';
        pts.textContent = p.points + ' pts';
        d.appendChild(pts);
      }
      var block = document.createElement('div');
      block.className = 'block';
      block.textContent = idx + 1;
      d.appendChild(block);
      el.appendChild(d);
    });
  }

  // ---------- boot ----------
  var sess = BK.session.get('bk-session');
  if (sess && sess.token && sess.code) {
    state.name = sess.name || '';
    state.hat = sess.hat || 0;
    startLive(sess.code, sess.name, sess.hat || 0, sess.token);
  } else {
    show('join');
  }
})();
