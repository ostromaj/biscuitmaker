// Teacher side: open a room, start rounds, watch the race, crown the best biscuits.
(function () {
  'use strict';

  var $ = function (id) {
    return document.getElementById(id);
  };
  var S = window.STATIONS;
  var SCREENS = ['start', 'wait', 'lobby', 'play', 'results'];
  var net = null;
  var room = null;
  var known = {}; // ids seen, for join pops
  var doneSeen = {};
  var roundSeenAt = {};
  var lastStatus = '';
  var lastRound = -1;

  function show(name) {
    SCREENS.forEach(function (s) {
      $('h-' + s).classList.toggle('hidden', s !== name);
    });
    $('brand').style.visibility = name === 'start' ? 'hidden' : 'visible';
    $('closeBtn').classList.toggle('hidden', !(name === 'lobby' || name === 'play' || name === 'results'));
  }

  $('brand').innerHTML = ART.hatSVG(BK.HATS[2], 34) + '<span>Biscuit Bake-Off</span>';

  function setMuteIcon() {
    $('muteBtn').textContent = BK.isMuted() ? '🔇' : '🔊';
    $('muteBtn').setAttribute('aria-label', BK.isMuted() ? 'Sound off' : 'Sound on');
  }
  $('muteBtn').addEventListener('click', function () {
    BK.setMuted(!BK.isMuted());
    setMuteIcon();
  });
  setMuteIcon();

  function joinBase() {
    var path = location.pathname.replace(/host\.html$/, '').replace(/index\.html$/, '');
    return location.origin + path;
  }
  function prettyUrl() {
    return joinBase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  function waitScreen(title, text) {
    $('hWaitTitle').textContent = title;
    $('hWaitText').textContent = text || '';
    var art = $('hWaitArt');
    if (!art.firstChild) art.appendChild(ART.biscuitCanvas({ rise: 0.8, layers: 5, round: 1, brown: 0.45, tender: 1, mood: 0.85, seed: 9 }, 200));
    show('wait');
  }

  function startError(msg) {
    $('startError').textContent = msg;
    $('startError').classList.toggle('hidden', !msg);
  }

  // ---------- connection ----------
  function connect(resume) {
    if (net) net.stop();
    net = new BK.Net(window.BISCUIT_SERVER);
    net.on('open', function () {
      $('netbar').classList.add('hidden');
      var saved = BK.local.get('bk-host');
      if (saved && saved.code && saved.hostToken) net.send({ t: 'host_resume', code: saved.code, hostToken: saved.hostToken });
      else if (!resume) net.send({ t: 'host_create' });
      else {
        net.stop();
        show('start');
      }
    });
    net.on('down', function () {
      $('netbar').classList.remove('hidden');
    });
    net.on('retrying', function (m) {
      if (room) $('netbar').classList.remove('hidden');
      else if (m.tries > 2) $('hWaitText').textContent = 'Still waking up the server… (this only happens on the first game of the day)';
    });
    net.on('host_ok', function (m) {
      BK.local.set('bk-host', { code: m.code, hostToken: m.hostToken });
    });
    net.on('host_gone', function () {
      BK.local.del('bk-host');
      room = null;
      net.stop();
      net = null;
      show('start');
      startError('Your last kitchen closed (the server tidies up after a few quiet hours). Open a new one.');
    });
    net.on('error', function (m) {
      startError(m.msg || 'Something went wrong.');
      show('start');
    });
    net.on('replaced', function () {
      net.stop();
      net = null;
      room = null;
      waitScreen('Opened in another tab', 'This kitchen is now running in another window. Use that one, or reload this page to take it back.');
    });
    net.on('state', onState);
    net.on('react', onReact);
    net.connect();
  }

  $('openBtn').addEventListener('click', function () {
    startError('');
    BK.local.del('bk-host');
    BK.sfx.pop();
    waitScreen('Preheating the oven…', 'Waking up the game server.');
    BK.wake(window.BISCUIT_SERVER, function (s) {
      $('hWaitText').textContent = 'Waking up the game server… ' + s + 's (first game of the day can take up to a minute)';
    }).then(function (ok) {
      if (!ok) {
        show('start');
        startError("Couldn't reach the game server. Check the school Wi-Fi isn't blocking onrender.com, then try again.");
        return;
      }
      connect(false);
    });
  });

  $('closeBtn').addEventListener('click', function () {
    if (!confirm('Close this kitchen? Everyone will be sent out and the code stops working.')) return;
    if (net) net.send({ t: 'close_room' });
    BK.local.del('bk-host');
    setTimeout(function () {
      if (net) net.stop();
      net = null;
      room = null;
      show('start');
    }, 200);
  });

  $('startBtn').addEventListener('click', function () {
    if (net) net.send({ t: 'start' });
    BK.sfx.fanfare();
  });
  $('againBtn').addEventListener('click', function () {
    if (net) net.send({ t: 'start' });
    BK.sfx.fanfare();
  });
  $('lobbyBtn').addEventListener('click', function () {
    if (net) net.send({ t: 'lobby' });
  });
  $('endBtn').addEventListener('click', function () {
    if (!room) return;
    var playing = room.players.filter(function (p) {
      return p.connected || p.points > 0;
    });
    var left = playing.filter(function (p) {
      return !p.done;
    }).length;
    if (left > 0 && !confirm(left + (left === 1 ? ' chef is' : ' chefs are') + ' still baking. Ring the bell anyway?')) return;
    if (net) net.send({ t: 'end' });
  });
  $('copyBtn').addEventListener('click', function () {
    var link = joinBase() + '?code=' + (room ? room.code : '');
    var done = function () {
      $('copyNote').textContent = 'Copied! Paste it into Classroom.';
    };
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, function () {
      $('copyNote').textContent = link;
    });
    else $('copyNote').textContent = link;
  });

  $('players').addEventListener('click', function (e) {
    var b = e.target.closest('.kick');
    if (!b || !net) return;
    var name = b.dataset.name;
    if (confirm('Remove ' + name + ' from the kitchen?')) net.send({ t: 'kick', id: b.dataset.id });
  });

  // ---------- rendering ----------
  function onState(m) {
    var prev = room;
    room = m;
    $('netbar').classList.add('hidden');

    // little sounds for joins and finishes
    m.players.forEach(function (p) {
      if (!known[p.id] && prev) BK.sfx.pop();
      known[p.id] = true;
      var key = m.round + ':' + p.id;
      if (p.done && !doneSeen[key] && m.status === 'playing') {
        doneSeen[key] = true;
        if (prev) BK.sfx.ding();
      }
    });

    if (m.status === 'playing' && !roundSeenAt[m.round]) roundSeenAt[m.round] = Date.now();
    if (m.status === 'results' && (lastStatus !== 'results' || lastRound !== m.round)) BK.sfx.fanfare();
    lastStatus = m.status;
    lastRound = m.round;

    if (m.status === 'lobby') renderLobby();
    else if (m.status === 'playing') renderPlay();
    else if (m.status === 'results') renderResults();
  }

  function renderLobby() {
    $('joinUrl').textContent = prettyUrl();
    $('codeDigits').innerHTML = room.code.split('').map(function (d) {
      return '<span>' + d + '</span>';
    }).join('');
    var n = room.players.length;
    $('lobbyCount').textContent = n === 0 ? 'Waiting for chefs…' : n + (n === 1 ? ' chef' : ' chefs') + ' in the kitchen';
    $('startBtn').disabled = n === 0;
    $('startBtn').textContent = room.round > 0 ? 'Start round ' + (room.round + 1) : 'Start baking';
    $('lobbyHint').classList.toggle('hidden', n === 0);
    $('players').innerHTML = n
      ? room.players
          .slice()
          .sort(function (a, b) {
            return a.name.localeCompare(b.name);
          })
          .map(function (p) {
            return (
              '<span class="pchip' + (p.connected ? '' : ' off') + '">' + ART.hatSVG(BK.HATS[p.hat], 30) + BK.esc(p.name) +
              '<button class="kick" type="button" data-id="' + p.id + '" data-name="' + BK.esc(p.name) + '" aria-label="Remove ' + BK.esc(p.name) + '">×</button></span>'
            );
          })
          .join('')
      : '<div class="empty">Names pop up here as students join.</div>';
    show('lobby');
  }

  function dotClass(s) {
    if (typeof s !== 'number') return '';
    return s >= 80 ? 'g' : s >= 50 ? 'm' : 'b';
  }

  function racerRow(p, i, extra) {
    var dots = '';
    for (var k = 0; k < 6; k++) dots += '<i class="' + dotClass(p.scores[k]) + '" title="' + S.LIST[k].title + (typeof p.scores[k] === 'number' ? ': ' + p.scores[k] : '') + '"></i>';
    return (
      '<div class="racer' + (p.done ? ' done' : '') + (p.connected ? '' : ' off') + '">' +
      '<span class="rk">' + (i + 1) + '</span>' +
      ART.hatSVG(BK.HATS[p.hat], 32) +
      '<span class="nm">' + BK.esc(p.name) + (extra || '') + '</span>' +
      '<span class="dots">' + dots + '</span>' +
      '<span class="pt">' + p.points + '</span>' +
      '</div>'
    );
  }

  function renderPlay() {
    $('playTitle').textContent = 'Round ' + room.round;
    $('playCode').textContent = 'Code ' + room.code;
    var active = room.players.filter(function (p) {
      return p.connected || p.points > 0;
    });
    var done = active.filter(function (p) {
      return p.done;
    }).length;
    $('playDone').textContent = done + ' / ' + active.length + ' done';
    var all = active.length > 0 && done === active.length;
    $('endBtn').textContent = all ? "Everyone's done! Ring the bell" : 'Ring the bell';
    $('endBtn').classList.toggle('bounce', all);
    $('race').innerHTML = room.players.map(function (p, i) {
      return racerRow(p, i, p.done ? ' ✓' : '');
    }).join('');
    show('play');
  }

  function renderResults() {
    $('resTitle').textContent = 'Round ' + room.round + ' results';
    var ranked = room.players;
    var baked = ranked.filter(function (p) {
      return p.done || p.points > 0;
    });
    // podium
    var pod = $('hPodium');
    pod.innerHTML = '';
    [1, 0, 2].forEach(function (idx) {
      var p = baked[idx];
      var d = document.createElement('div');
      d.className = 'pod p' + (idx + 1);
      if (p) {
        d.appendChild(ART.biscuitCanvas(p.look, idx === 0 ? 230 : 170));
        var who = document.createElement('div');
        who.className = 'who';
        who.innerHTML = ART.hatSVG(BK.HATS[p.hat], 32) + '<span>' + BK.esc(p.name) + '</span>';
        d.appendChild(who);
        var pts = document.createElement('div');
        pts.className = 'pts';
        pts.textContent = p.points + ' pts';
        d.appendChild(pts);
        var title = document.createElement('div');
        title.className = 'pts';
        title.textContent = S.rating(p.points).title;
        d.appendChild(title);
      }
      var block = document.createElement('div');
      block.className = 'block';
      block.textContent = idx + 1;
      d.appendChild(block);
      pod.appendChild(d);
    });

    // station stars: best score at each station
    $('stars').innerHTML = S.LIST.map(function (def, k) {
      var best = -1;
      var who = [];
      ranked.forEach(function (p) {
        var s = p.scores[k];
        if (typeof s !== 'number') return;
        if (s > best) {
          best = s;
          who = [p.name];
        } else if (s === best) who.push(p.name);
      });
      var names = who.length > 3 ? who.slice(0, 3).join(', ') + ' +' + (who.length - 3) : who.join(', ');
      return '<div class="star"><div class="st">' + def.title + '</div><div class="sn">' + (best > 0 ? BK.esc(names) : 'Nobody yet') + '</div><div class="st">' + (best > 0 ? best + ' points' : 'Tough station!') + '</div></div>';
    }).join('');

    var scored = ranked.filter(function (p) {
      return p.points > 0;
    });
    var avg = scored.length
      ? Math.round(
          scored.reduce(function (a, p) {
            return a + p.points;
          }, 0) / scored.length
        )
      : 0;
    $('classAvg').textContent = 'Class average: ' + avg + ' pts';
    $('finalList').innerHTML = ranked.map(function (p, i) {
      return racerRow(p, i, p.best > p.points ? ' <span class="muted-note">(best ' + p.best + ')</span>' : '');
    }).join('');
    show('results');
  }

  // clock on the race screen
  setInterval(function () {
    if (!room || room.status !== 'playing') return;
    var t0 = roundSeenAt[room.round] || Date.now();
    var s = Math.floor((Date.now() - t0) / 1000);
    $('playClock').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 500);

  // emoji reactions float up the projector
  var floaterCount = 0;
  function onReact(m) {
    if (floaterCount > 18) return;
    var f = document.createElement('div');
    f.className = 'floater';
    f.style.left = 5 + Math.random() * 85 + '%';
    f.innerHTML = '<span class="e">' + BK.REACTS[m.e] + '</span><span class="n">' + BK.esc(m.name) + '</span>';
    $('floaters').appendChild(f);
    floaterCount++;
    setTimeout(function () {
      f.remove();
      floaterCount--;
    }, 3300);
  }

  // ---------- boot: pick the last kitchen back up after a refresh ----------
  var saved = BK.local.get('bk-host');
  if (saved && saved.code && saved.hostToken) {
    waitScreen('Reopening your kitchen…', 'Room ' + saved.code);
    connect(true);
  } else {
    show('start');
  }
})();
