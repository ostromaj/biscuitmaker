// Shared bits: seeded randomness, the live connection, sounds, and constants.
(function () {
  'use strict';

  // Chef hat colors students pick from (also used on the host screen).
  var HATS = ['#ff5c7a', '#ff9f43', '#ffd23f', '#5ccf8a', '#3fb8e0', '#7d6bff', '#e86bd8', '#ffffff'];
  var HAT_NAMES = ['Strawberry', 'Peach', 'Honey', 'Mint', 'Blueberry', 'Grape', 'Bubblegum', 'Powdered sugar'];
  var REACTS = ['🧈', '🔥', '😋', '😱', '👏', '🥴', '🍯', '💯'];

  // mulberry32: tiny seeded random generator so every kid gets the same kitchen.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- live connection with auto-reconnect ----------
  function Net(base) {
    this.url = base.replace(/^http/, 'ws') + '/ws';
    this.handlers = {};
    this.ws = null;
    this.tries = 0;
    this.closedOnPurpose = false;
    this.connected = false;
  }
  Net.prototype.on = function (t, fn) {
    (this.handlers[t] = this.handlers[t] || []).push(fn);
    return this;
  };
  Net.prototype.emit = function (t, msg) {
    (this.handlers[t] || []).forEach(function (fn) {
      fn(msg);
    });
  };
  Net.prototype.connect = function () {
    var self = this;
    var ws;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      return this.retry();
    }
    this.ws = ws;
    ws.onopen = function () {
      self.tries = 0;
      self.connected = true;
      self.emit('open');
    };
    ws.onmessage = function (ev) {
      var msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      self.emit(msg.t, msg);
    };
    ws.onclose = function () {
      var was = self.connected;
      self.connected = false;
      if (was) self.emit('down');
      if (!self.closedOnPurpose) self.retry();
    };
    ws.onerror = function () {};
    if (!this.pinger) {
      this.pinger = setInterval(function () {
        self.send({ t: 'ping' });
      }, 20000);
    }
  };
  Net.prototype.retry = function () {
    var self = this;
    this.tries++;
    var wait = Math.min(8000, 600 * Math.pow(1.6, this.tries));
    this.emit('retrying', { tries: this.tries });
    setTimeout(function () {
      self.connect();
    }, wait);
  };
  Net.prototype.send = function (msg) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  };
  Net.prototype.stop = function () {
    this.closedOnPurpose = true;
    if (this.ws) this.ws.close();
  };

  // The free server naps when nobody is playing. Poke it so it starts waking up.
  function wake(base, onTick) {
    var start = Date.now();
    return new Promise(function (resolve) {
      function poke() {
        fetch(base + '/health', { cache: 'no-store' })
          .then(function (r) {
            if (r.ok) resolve(true);
            else throw new Error('not yet');
          })
          .catch(function () {
            var s = Math.round((Date.now() - start) / 1000);
            if (onTick) onTick(s);
            if (s > 120) return resolve(false);
            setTimeout(poke, 2500);
          });
      }
      poke();
    });
  }

  // ---------- sounds (tiny synth blips, no audio files) ----------
  var ctx = null;
  var muted = false;
  try {
    muted = localStorage.getItem('biscuit-muted') === '1';
  } catch (e) {}
  function audio() {
    if (muted) return null;
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, slide) {
    var a = audio();
    if (!a) return;
    var o = a.createOscillator();
    var g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  }
  var sfx = {
    pop: function () {
      tone(520 + Math.random() * 200, 0.09, 'triangle', 0.12, 900);
    },
    tap: function () {
      tone(330, 0.06, 'square', 0.05);
    },
    good: function () {
      tone(660, 0.1, 'triangle', 0.12);
      setTimeout(function () {
        tone(990, 0.16, 'triangle', 0.12);
      }, 90);
    },
    bad: function () {
      tone(220, 0.22, 'sawtooth', 0.06, 110);
    },
    ding: function () {
      tone(1320, 0.5, 'sine', 0.14);
      tone(1980, 0.4, 'sine', 0.05);
    },
    whoosh: function () {
      tone(200, 0.25, 'triangle', 0.05, 600);
    },
    fanfare: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () {
          tone(f, 0.25, 'triangle', 0.12);
        }, i * 120);
      });
    },
    pour: function () {
      tone(140 + Math.random() * 60, 0.05, 'triangle', 0.025);
    },
  };
  function setMuted(m) {
    muted = m;
    try {
      localStorage.setItem('biscuit-muted', m ? '1' : '0');
    } catch (e) {}
  }

  function store(kind) {
    var s;
    try {
      s = window[kind];
      s.setItem('__t', '1');
      s.removeItem('__t');
    } catch (e) {
      s = null;
    }
    return {
      get: function (k) {
        try {
          return s ? JSON.parse(s.getItem(k)) : null;
        } catch (e) {
          return null;
        }
      },
      set: function (k, v) {
        try {
          if (s) s.setItem(k, JSON.stringify(v));
        } catch (e) {}
      },
      del: function (k) {
        try {
          if (s) s.removeItem(k);
        } catch (e) {}
      },
    };
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.BK = {
    HATS: HATS,
    HAT_NAMES: HAT_NAMES,
    REACTS: REACTS,
    rng: rng,
    Net: Net,
    wake: wake,
    sfx: sfx,
    setMuted: setMuted,
    isMuted: function () {
      return muted;
    },
    session: store('sessionStorage'),
    local: store('localStorage'),
    esc: esc,
  };
})();
