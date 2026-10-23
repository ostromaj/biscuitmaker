// The six baking stations. Each one is a little canvas mini-game scored 0-100.
(function () {
  'use strict';

  var W = 800;
  var H = 500;
  var INK = ART.INK;
  var rr = ART.rr;
  var face = ART.face;
  var sfx = BK.sfx;

  var C = {
    tile: '#bde8d4',
    tileLine: '#a5dcc3',
    counter: '#f2c47e',
    counterEdge: '#d99a4e',
    butter: '#ffd966',
    jam: '#2f2b6b',
    berry: '#ff5c7a',
    dough: '#fff3d6',
    doughShade: '#f3dfb2',
    mint: '#3ec98a',
    white: '#ffffff',
  };

  var clamp = function (v, a, b) {
    return Math.max(a, Math.min(b, v));
  };

  // ---------- shared scenery ----------
  var sceneCache = null;
  function scene(ctx) {
    if (!sceneCache) {
      sceneCache = document.createElement('canvas');
      sceneCache.width = W * 2;
      sceneCache.height = H * 2;
      var g = sceneCache.getContext('2d');
      g.scale(2, 2);
      g.fillStyle = C.tile;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = C.tileLine;
      g.lineWidth = 2;
      for (var x = 0; x <= W; x += 50) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 400);
        g.stroke();
      }
      for (var y = 0; y <= 400; y += 50) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      g.fillStyle = C.counter;
      g.fillRect(0, 400, W, 100);
      g.fillStyle = C.counterEdge;
      g.fillRect(0, 400, W, 10);
      g.strokeStyle = 'rgba(160,100,40,0.25)';
      g.lineWidth = 2;
      for (var i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(0, 430 + i * 12);
        g.bezierCurveTo(250, 425 + i * 13, 520, 440 + i * 11, W, 428 + i * 12);
        g.stroke();
      }
    }
    ctx.drawImage(sceneCache, 0, 0, W, H);
  }

  function label(ctx, text, x, y, size, color, align, weight) {
    ctx.save();
    ctx.font = (weight || 700) + ' ' + size + 'px "Baloo 2", "Trebuchet MS", sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || INK;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function pill(ctx, text, x, y, bg, fg, size) {
    size = size || 20;
    ctx.save();
    ctx.font = '700 ' + size + 'px "Baloo 2", "Trebuchet MS", sans-serif';
    var w = ctx.measureText(text).width + size * 1.4;
    var h = size * 1.7;
    rr(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
    label(ctx, text, x, y + 1, size, fg || INK);
  }

  // timer bar at the top of the screen
  function timer(ctx, frac, text) {
    frac = clamp(frac, 0, 1);
    rr(ctx, 240, 16, 320, 22, 11);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (frac > 0.01) {
      rr(ctx, 243, 19, 314 * frac, 16, 8);
      ctx.fillStyle = frac > 0.3 ? C.mint : C.berry;
      ctx.fill();
    }
    if (text) label(ctx, text, 400, 52, 16, INK);
  }

  function bowl(ctx, cx, cy, w, h, fill) {
    // back rim
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#7fc4ff';
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, w / 2 - 14, h * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function bowlFront(ctx, cx, cy, w, h) {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#5fb2f5';
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy);
    ctx.bezierCurveTo(cx - w / 2, cy + h * 0.95, cx + w / 2, cy + h * 0.95, cx + w / 2, cy);
    ctx.ellipse(cx, cy, w / 2, h * 0.22, 0, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // polka dots on the bowl, because cute
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * w * 0.17, cy + h * 0.45 + Math.abs(i) * -h * 0.06, w * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- Stage: canvas, input, loop ----------
  function Stage(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.setAttribute('role', 'application');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.station = null;
    this.running = false;
    this.keyHeld = false;
    var self = this;

    this.resize = function () {
      var w = container.clientWidth || W;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      self.scale = w / W;
      self.canvas.width = Math.round(w * dpr);
      self.canvas.height = Math.round((w * H * dpr) / W);
      self.canvas.style.height = (w * H) / W + 'px';
      self.ctx.setTransform(self.scale * dpr, 0, 0, self.scale * dpr, 0, 0);
    };
    window.addEventListener('resize', this.resize);
    this.resize();

    function pos(e) {
      var b = self.canvas.getBoundingClientRect();
      return { x: ((e.clientX - b.left) / b.width) * W, y: ((e.clientY - b.top) / b.height) * H };
    }
    this.canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try {
        self.canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      var p = pos(e);
      if (self.station && self.station.down) self.station.down(p.x, p.y, false);
    });
    var up = function (e) {
      var p = pos(e);
      if (self.station && self.station.up) self.station.up(p.x, p.y);
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    this.onKeyDown = function (e) {
      if (!self.running || !self.station) return;
      var k = e.key;
      if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        if (e.repeat || self.keyHeld) return;
        self.keyHeld = true;
        if (self.station.down) self.station.down(null, null, true);
      } else {
        var map = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D', a: 'L', d: 'R', w: 'U', s: 'D', A: 'L', D: 'R', W: 'U', S: 'D' };
        if (map[k]) {
          e.preventDefault();
          if (e.repeat) return;
          if (self.station.key) self.station.key(map[k]);
        }
      }
    };
    this.onKeyUp = function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        self.keyHeld = false;
        if (self.running && self.station && self.station.up) self.station.up(null, null);
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  Stage.prototype.run = function (def, seed, onDone) {
    var self = this;
    this.stop();
    var r = BK.rng(seed);
    var finished = false;
    var tail = 0;
    var result = null;
    this.station = def.create({
      done: function (score, note, data) {
        if (finished) return;
        finished = true;
        result = { score: clamp(Math.round(score), 0, 100), note: note || '', data: data || {} };
      },
    }, r);
    this.running = true;
    this.keyHeld = false;
    var last = performance.now();
    function frame(t) {
      if (!self.running) return;
      var dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (self.station.update) self.station.update(dt);
      self.ctx.clearRect(0, 0, W, H);
      self.station.draw(self.ctx);
      if (finished) {
        tail += dt;
        if (tail > 0.9) {
          self.running = false;
          onDone(result);
          return;
        }
      }
      self.raf = requestAnimationFrame(frame);
    }
    this.raf = requestAnimationFrame(frame);
    try {
      this.canvas.focus({ preventScroll: true });
    } catch (e) {}
  };
  Stage.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.station = null;
  };
  Stage.prototype.destroy = function () {
    this.stop();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  };

  // ======================================================================
  // 1. Measure the flour: hold to pour, let go at the line (flour lags!)
  // ======================================================================
  var flour = {
    id: 'flour',
    title: 'Measure the flour',
    how: 'Hold down (or hold Space) to pour. Let go at the line. Careful: flour keeps falling for a moment after you let go!',
    create: function (S, r) {
      var target = 0.5 + r() * 0.33;
      var fill = 0;
      var rate = 0;
      var pouring = false;
      var poured = false;
      var lag = 0;
      var t = 0;
      var parts = [];
      var ended = false;
      var endT = 0;
      var cupX = 330;
      var cupY = 170;
      var cupW = 150;
      var cupH = 220;
      var LIMIT = 12;

      function finish() {
        if (ended) return;
        ended = true;
        var diff = fill - target;
        var a = Math.abs(diff);
        var score = a < 0.008 ? 100 : 100 - a * 480;
        var note = a < 0.008 ? 'Right on the line!' : a < 0.03 ? (diff > 0 ? 'A pinch over' : 'A pinch under') : diff > 0 ? 'Whoa, too much flour' : 'Not enough flour';
        if (!poured) note = 'You forgot to pour!';
        if (score >= 90) sfx.good();
        else sfx.bad();
        S.done(score, note, { flour: diff });
      }

      return {
        down: function () {
          if (poured || ended) return;
          pouring = true;
          rate = 0.08;
        },
        up: function () {
          if (!pouring) return;
          pouring = false;
          poured = true;
          lag = 0.22;
        },
        update: function (dt) {
          t += dt;
          if (pouring) {
            rate = Math.min(0.55, rate + 0.55 * dt);
            fill += rate * dt;
            if (Math.random() < 0.6) sfx.pour();
          } else if (lag > 0) {
            lag -= dt;
            rate *= Math.exp(-5 * dt);
            fill += rate * dt;
            if (lag <= 0) {
              endT = t;
            }
          }
          if (fill >= 1) {
            fill = 1;
            pouring = false;
            poured = true;
          }
          if ((pouring || lag > 0) && parts.length < 160) {
            for (var i = 0; i < 4; i++) {
              parts.push({ x: 404 + (Math.random() - 0.5) * 16, y: 130, vy: 120 + Math.random() * 80, vx: (Math.random() - 0.5) * 20 });
            }
          }
          var surface = cupY + cupH - fill * cupH;
          parts = parts.filter(function (p) {
            p.vy += 900 * dt;
            p.y += p.vy * dt;
            p.x += p.vx * dt;
            return p.y < surface;
          });
          if (poured && lag <= 0 && !ended && t - endT > 0.35) finish();
          if (!poured && t > LIMIT) {
            poured = true;
            finish();
          }
        },
        draw: function (ctx) {
          scene(ctx);
          if (!poured) timer(ctx, 1 - t / LIMIT, '');
          // flour bag
          ctx.save();
          var tilt = pouring || lag > 0 ? 0.55 : 0.15;
          ctx.translate(460, 92);
          ctx.rotate(tilt);
          rr(ctx, -60, -70, 120, 120, 18);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = INK;
          ctx.stroke();
          rr(ctx, -60, -70, 120, 26, 12);
          ctx.fillStyle = C.berry;
          ctx.fill();
          ctx.stroke();
          label(ctx, 'FLOUR', 0, 20, 20, INK, 'center', 800);
          face(ctx, 0, -12, 34, pouring ? 0.95 : 0.7, { open: pouring });
          ctx.restore();
          // falling flour
          ctx.fillStyle = '#ffffff';
          parts.forEach(function (p) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
            ctx.fill();
          });
          // cup (glass)
          var surface = cupY + cupH - fill * cupH;
          ctx.save();
          rr(ctx, cupX, cupY, cupW, cupH, 16);
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fill();
          ctx.clip();
          ctx.fillStyle = '#fffaf0';
          ctx.fillRect(cupX, surface, cupW, cupH);
          ctx.fillStyle = '#f1e6cc';
          for (var i = 0; i < 9; i++) {
            ctx.beginPath();
            ctx.arc(cupX + 12 + i * 16, surface + 2 + (i % 2) * 2, 9, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          rr(ctx, cupX, cupY, cupW, cupH, 16);
          ctx.lineWidth = 4;
          ctx.strokeStyle = INK;
          ctx.stroke();
          // handle
          ctx.beginPath();
          ctx.moveTo(cupX + cupW, cupY + 50);
          ctx.bezierCurveTo(cupX + cupW + 60, cupY + 50, cupX + cupW + 60, cupY + 150, cupX + cupW, cupY + 150);
          ctx.lineWidth = 12;
          ctx.stroke();
          ctx.lineWidth = 6;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.stroke();
          // tick marks
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          for (var k = 1; k < 8; k++) {
            var ty = cupY + cupH - (k / 8) * cupH;
            ctx.beginPath();
            ctx.moveTo(cupX, ty);
            ctx.lineTo(cupX + (k % 2 ? 14 : 24), ty);
            ctx.stroke();
          }
          // target line
          var ty2 = cupY + cupH - target * cupH;
          ctx.setLineDash([10, 7]);
          ctx.lineWidth = 4;
          ctx.strokeStyle = C.berry;
          ctx.beginPath();
          ctx.moveTo(cupX - 30, ty2);
          ctx.lineTo(cupX + cupW + 10, ty2);
          ctx.stroke();
          ctx.setLineDash([]);
          pill(ctx, 'Fill to here', cupX - 100, ty2, C.berry, '#fff', 17);
          if (!poured && !pouring) label(ctx, 'Hold to pour', 400, 455, 26, INK);
          if (pouring) label(ctx, 'Pouring...', 400, 455, 26, INK);
        },
      };
    },
  };

  // ======================================================================
  // 2. Cut in the butter: tap cubes to chop them to pea size before they melt
  // ======================================================================
  var butter = {
    id: 'butter',
    title: 'Cut in the butter',
    how: 'Tap the butter to chop it. Big cubes split into smaller ones. Stop at pea-size bits — tapping a tiny one smushes it! Hurry before it melts.',
    create: function (S, r) {
      var SIZES = [0, 17, 27, 40];
      var pieces = [];
      var mush = 0;
      var t = 0;
      var LIMIT = 10;
      var ended = false;
      var poofs = [];
      var bowlX = 400;
      var bowlY = 250;
      for (var i = 0; i < 6; i++) {
        pieces.push({
          x: 250 + (i % 3) * 150 + (r() - 0.5) * 30,
          y: 200 + Math.floor(i / 3) * 110 + (r() - 0.5) * 20,
          s: 3,
          vx: (r() - 0.5) * 40,
          vy: (r() - 0.5) * 30,
          ph: r() * 6,
        });
      }
      function peas() {
        return pieces.filter(function (p) {
          return p.s === 1;
        }).length;
      }
      function finish() {
        if (ended) return;
        ended = true;
        var pc = peas();
        var score = (pc / 24) * 100 - mush * 5;
        var note = pc === 24 && mush === 0 ? 'Perfect little peas!' : mush > 2 ? 'Some butter got smushed' : pc < 16 ? 'Still some big chunks' : 'Nice and crumbly';
        if (score >= 90) sfx.good();
        else sfx.bad();
        S.done(score, note, { peas: pc, mush: mush });
      }
      return {
        down: function (x, y, isKey) {
          if (ended || isKey || x === null) return;
          for (var i = pieces.length - 1; i >= 0; i--) {
            var p = pieces[i];
            var rad = SIZES[p.s] + 8;
            if (Math.abs(x - p.x) < rad && Math.abs(y - p.y) < rad) {
              if (p.s > 1) {
                pieces.splice(i, 1);
                var ns = p.s - 1;
                for (var k = 0; k < 2; k++) {
                  var d = k ? 1 : -1;
                  pieces.push({ x: p.x + d * SIZES[ns] * 0.9, y: p.y + (Math.random() - 0.5) * 10, s: ns, vx: d * 60, vy: (Math.random() - 0.5) * 60, ph: Math.random() * 6 });
                }
                sfx.pop();
              } else {
                pieces.splice(i, 1);
                mush++;
                poofs.push({ x: p.x, y: p.y, t: 0, smush: true });
                sfx.bad();
              }
              poofs.push({ x: x, y: y, t: 0 });
              if (peas() === 24) finish();
              return;
            }
          }
        },
        update: function (dt) {
          t += dt;
          pieces.forEach(function (p) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.97;
            p.vy *= 0.97;
            p.vx += (Math.random() - 0.5) * 30 * dt;
            p.vy += (Math.random() - 0.5) * 30 * dt;
            var rad = SIZES[p.s];
            // keep inside the bowl ellipse
            var ex = (p.x - bowlX) / (270 - rad);
            var ey = (p.y - bowlY) / (140 - rad);
            var d = Math.sqrt(ex * ex + ey * ey);
            if (d > 1) {
              p.x = bowlX + (ex / d) * (270 - rad);
              p.y = bowlY + (ey / d) * (140 - rad);
              p.vx *= -0.6;
              p.vy *= -0.6;
            }
          });
          poofs.forEach(function (f) {
            f.t += dt;
          });
          poofs = poofs.filter(function (f) {
            return f.t < 0.5;
          });
          if (t >= LIMIT) finish();
        },
        draw: function (ctx) {
          scene(ctx);
          var melt = clamp(t / LIMIT, 0, 1);
          timer(ctx, 1 - melt, 'Butter melts in ' + Math.max(0, Math.ceil(LIMIT - t)) + 's');
          // big flat bowl seen from above
          ctx.save();
          ctx.lineWidth = 5;
          ctx.strokeStyle = INK;
          ctx.fillStyle = '#7fc4ff';
          ctx.beginPath();
          ctx.ellipse(bowlX, bowlY + 10, 320, 180, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fbf3dd';
          ctx.beginPath();
          ctx.ellipse(bowlX, bowlY + 4, 290, 158, 0, 0, Math.PI * 2);
          ctx.fill();
          // flour specks
          ctx.fillStyle = '#efe2c0';
          for (var i = 0; i < 40; i++) {
            var a = i * 2.39;
            var rr2 = 30 + ((i * 37) % 240);
            ctx.beginPath();
            ctx.arc(bowlX + Math.cos(a) * rr2, bowlY + Math.sin(a) * rr2 * 0.52, 5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          poofs.forEach(function (f) {
            ctx.fillStyle = f.smush ? 'rgba(255,217,102,0.8)' : 'rgba(255,255,255,' + (1 - f.t * 2) + ')';
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.smush ? 22 : 10 + f.t * 60, 0, Math.PI * 2);
            ctx.fill();
          });
          pieces.forEach(function (p) {
            var s = SIZES[p.s];
            var bob = Math.sin(t * 3 + p.ph) * 2;
            ctx.save();
            ctx.translate(p.x, p.y + bob);
            rr(ctx, -s, -s * 0.85, s * 2, s * 1.7, s * 0.4);
            ctx.fillStyle = melt > 0.7 ? '#ffe28a' : C.butter;
            ctx.fill();
            ctx.lineWidth = p.s === 1 ? 2.5 : 3.5;
            ctx.strokeStyle = INK;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            rr(ctx, -s * 0.7, -s * 0.6, s * 0.6, s * 0.3, s * 0.15);
            ctx.fill();
            if (p.s > 1) face(ctx, 0, s * 0.12, s * 0.9, 0.85 - melt * 0.5, { sweat: melt > 0.5 });
            else face(ctx, 0, s * 0.1, s * 0.95, 0.9, {});
            ctx.restore();
          });
          var pc = peas();
          pill(ctx, 'Peas: ' + pc + ' / 24', 120, 450, '#ffffff', INK, 20);
          if (mush) pill(ctx, 'Smushed: ' + mush, 680, 450, C.butter, INK, 20);
        },
      };
    },
  };

  // ======================================================================
  // 3. Stir: tap when the spoon passes the green zone, 5 times
  // ======================================================================
  var stir = {
    id: 'stir',
    title: 'Stir in the buttermilk',
    how: 'The spoon goes round and round. Tap (or press Space) when it is inside the green zone. Five good stirs — then stop!',
    create: function (S, r) {
      var cx = 400;
      var cy = 250;
      var RX = 210;
      var RY = 120;
      var theta = -Math.PI / 2;
      var omega = 2.5;
      var zone = r() * Math.PI * 2;
      var HALF = 0.34;
      var hits = [];
      var cooldown = 0;
      var flash = null;
      var ended = false;
      var splash = 1;
      var t = 0;
      var LIMIT = 20;
      function angDiff(a, b) {
        var d = Math.abs(((a - b) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return d > Math.PI ? Math.PI * 2 - d : d;
      }
      function finish() {
        if (ended) return;
        ended = true;
        var sum = hits.reduce(function (a, b) {
          return a + b;
        }, 0);
        var score = sum / 5;
        var note = score >= 95 ? 'Just combined. Super tender!' : score >= 75 ? 'Nicely mixed' : score >= 50 ? 'A little lumpy' : 'Tough dough...';
        if (score >= 90) sfx.good();
        else sfx.bad();
        S.done(score, note, { tender: score / 100 });
      }
      return {
        down: function () {
          if (ended || cooldown > 0) return;
          cooldown = 0.22;
          var d = angDiff(theta, zone);
          var s = d < 0.09 ? 100 : Math.max(0, 100 - (d - 0.09) * 150);
          hits.push(s);
          flash = { s: s, t: 0, x: cx + Math.cos(theta) * RX, y: cy + Math.sin(theta) * RY };
          if (s >= 85) sfx.good();
          else if (s >= 50) sfx.tap();
          else sfx.bad();
          omega *= 1.14;
          zone = zone + 1.6 + r() * 2.6;
          if (hits.length >= 5) finish();
        },
        update: function (dt) {
          t += dt;
          theta += omega * dt;
          cooldown -= dt;
          splash = Math.max(0, splash - dt * 0.8);
          if (flash) flash.t += dt;
          if (t > LIMIT && !ended) {
            while (hits.length < 5) hits.push(0);
            finish();
          }
        },
        draw: function (ctx) {
          scene(ctx);
          var mix = hits.length / 5;
          // bowl back + dough
          ctx.save();
          ctx.lineWidth = 5;
          ctx.strokeStyle = INK;
          ctx.fillStyle = '#7fc4ff';
          ctx.beginPath();
          ctx.ellipse(cx, cy, RX + 60, RY + 45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = mix < 1 ? '#fbf3dd' : C.dough;
          ctx.beginPath();
          ctx.ellipse(cx, cy + 4, RX + 34, RY + 26, 0, 0, Math.PI * 2);
          ctx.fill();
          // buttermilk puddle shrinking as it mixes
          ctx.fillStyle = 'rgba(255,255,255,' + (0.9 - mix * 0.8) + ')';
          ctx.beginPath();
          ctx.ellipse(cx + 20, cy + 10, 130 * (1 - mix * 0.7), 60 * (1 - mix * 0.7), 0.2, 0, Math.PI * 2);
          ctx.fill();
          // shaggy lumps
          ctx.fillStyle = C.doughShade;
          for (var i = 0; i < 14; i++) {
            var a = i * 2.2;
            var rad = 50 + ((i * 53) % 150);
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.55, 14 - mix * 9, 0, Math.PI * 2);
            ctx.fill();
          }
          // the dough's face appears as it comes together
          if (mix > 0.3) face(ctx, cx, cy + 4, 46, 0.4 + mix * 0.5, {});
          ctx.restore();

          // green zone on the track
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineWidth = 26;
          ctx.strokeStyle = 'rgba(62,201,138,0.85)';
          ctx.beginPath();
          ctx.ellipse(cx, cy, RX, RY, 0, zone - HALF, zone + HALF);
          ctx.stroke();
          ctx.lineWidth = 3;
          ctx.strokeStyle = INK;
          ctx.setLineDash([4, 8]);
          ctx.beginPath();
          ctx.ellipse(cx, cy, RX, RY, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          // dead-center sweet spot
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(cx + Math.cos(zone) * RX, cy + Math.sin(zone) * RY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // spoon
          var sx = cx + Math.cos(theta) * RX;
          var sy = cy + Math.sin(theta) * RY;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.lineCap = 'round';
          ctx.strokeStyle = INK;
          ctx.lineWidth = 16;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(10, -110);
          ctx.stroke();
          ctx.strokeStyle = '#e8a35c';
          ctx.lineWidth = 10;
          ctx.stroke();
          ctx.fillStyle = '#e8a35c';
          ctx.lineWidth = 4;
          ctx.strokeStyle = INK;
          ctx.beginPath();
          ctx.ellipse(0, 0, 20, 26, 0.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          face(ctx, 0, 0, 20, 0.8, {});
          ctx.restore();

          // buttermilk jug pouring at the start
          if (splash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, splash * 2);
            ctx.translate(640, 90);
            ctx.rotate(-0.7);
            rr(ctx, -40, -50, 80, 100, 14);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = INK;
            ctx.stroke();
            label(ctx, 'MILK', 0, 25, 16, INK, 'center', 800);
            face(ctx, 0, -10, 26, 0.9, { open: true });
            ctx.restore();
          }

          if (flash && flash.t < 0.7) {
            var txt = flash.s >= 95 ? 'Perfect!' : flash.s >= 75 ? 'Good' : flash.s >= 40 ? 'Close' : 'Miss';
            label(ctx, txt, flash.x, flash.y - 50 - flash.t * 50, 28, flash.s >= 75 ? '#1f8f5f' : C.berry, 'center', 800);
          }
          // stir counter
          for (var k = 0; k < 5; k++) {
            ctx.beginPath();
            ctx.arc(320 + k * 40, 455, 13, 0, Math.PI * 2);
            ctx.fillStyle = k < hits.length ? (hits[k] >= 75 ? C.mint : hits[k] >= 40 ? C.butter : C.berry) : '#ffffff';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = INK;
            ctx.stroke();
          }
        },
      };
    },
  };

  // ======================================================================
  // 4. Fold the layers: match the arrow, fast
  // ======================================================================
  var fold = {
    id: 'fold',
    title: 'Fold the layers',
    how: 'An arrow pops up on the dough. Press the matching arrow key (or tap the arrow button) before the ring runs out. Every good fold = a flaky layer!',
    create: function (S, r) {
      var DIRS = ['L', 'U', 'R', 'D'];
      var seq = [];
      for (var i = 0; i < 6; i++) {
        var d;
        do {
          d = DIRS[Math.floor(r() * 4)];
        } while (seq.length && seq[seq.length - 1] === d);
        seq.push(d);
      }
      var idx = 0;
      var windowT = 1.7;
      var left = windowT;
      var gap = 0.8; // short "get ready"
      var scores = [];
      var layers = 0;
      var squish = null;
      var ended = false;
      var feedback = null;
      var BTN = { L: [205, 455], U: [335, 455], D: [465, 455], R: [595, 455] };

      function finish() {
        if (ended) return;
        ended = true;
        var score = scores.reduce(function (a, b) {
          return a + b;
        }, 0) / 6;
        var note = layers === 6 && score > 90 ? 'Six flaky layers!' : layers >= 5 ? layers + ' flaky layers' : layers >= 3 ? 'Some layers got squished' : 'More of a dough blob';
        if (score >= 90) sfx.good();
        else sfx.bad();
        S.done(score, note, { layers: layers });
      }
      function press(dir) {
        if (ended || gap > 0 || idx >= 6) return;
        var want = seq[idx];
        if (dir === want) {
          var s = 50 + 50 * clamp(left / windowT, 0, 1);
          scores.push(s);
          layers++;
          squish = { dir: dir, t: 0 };
          feedback = { ok: true, t: 0 };
          sfx.whoosh();
        } else {
          scores.push(0);
          squish = { dir: 'X', t: 0 };
          feedback = { ok: false, t: 0 };
          sfx.bad();
        }
        next();
      }
      function next() {
        idx++;
        windowT *= 0.88;
        left = windowT;
        gap = 0.35;
        if (idx >= 6) finish();
      }
      return {
        key: press,
        down: function (x, y) {
          if (x === null) return;
          for (var k in BTN) {
            if (Math.abs(x - BTN[k][0]) < 58 && Math.abs(y - BTN[k][1]) < 40) {
              press(k);
              return;
            }
          }
        },
        update: function (dt) {
          if (squish) squish.t += dt;
          if (feedback) feedback.t += dt;
          if (ended) return;
          if (gap > 0) {
            gap -= dt;
            return;
          }
          left -= dt;
          if (left <= 0) {
            scores.push(0);
            feedback = { ok: false, t: 0, late: true };
            sfx.bad();
            next();
          }
        },
        draw: function (ctx) {
          scene(ctx);
          // dough slab with visible layers
          var sx = 1;
          var sy = 1;
          var ox = 0;
          if (squish && squish.t < 0.3) {
            var k = Math.sin((squish.t / 0.3) * Math.PI);
            if (squish.dir === 'L' || squish.dir === 'R') {
              sx = 1 - 0.3 * k;
              ox = (squish.dir === 'L' ? -1 : 1) * 30 * k;
            } else if (squish.dir === 'U' || squish.dir === 'D') sy = 1 - 0.3 * k;
            else {
              sx = 1 + 0.15 * k;
              sy = 1 - 0.2 * k;
            }
          }
          ctx.save();
          ctx.translate(400 + ox, 250);
          ctx.scale(sx, sy);
          rr(ctx, -200, -110, 400, 220, 40);
          ctx.fillStyle = C.dough;
          ctx.fill();
          ctx.lineWidth = 5;
          ctx.strokeStyle = INK;
          ctx.stroke();
          ctx.strokeStyle = C.doughShade;
          ctx.lineWidth = 4;
          for (var i = 0; i < layers; i++) {
            var y = -80 + ((i + 1) * 160) / 7;
            ctx.beginPath();
            ctx.moveTo(-170, y);
            ctx.bezierCurveTo(-60, y - 8, 60, y + 8, 170, y);
            ctx.stroke();
          }
          var mood = feedback && feedback.t < 0.6 ? (feedback.ok ? 0.95 : 0.2) : 0.7;
          face(ctx, -120, 60, 34, mood, {});
          ctx.restore();

          // the prompt arrow
          if (!ended && gap <= 0 && idx < 6) {
            var dir = seq[idx];
            var ang = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 }[dir];
            ctx.save();
            ctx.translate(430, 240);
            // ring countdown
            ctx.lineWidth = 12;
            ctx.strokeStyle = 'rgba(47,43,107,0.15)';
            ctx.beginPath();
            ctx.arc(0, 0, 78, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = left / windowT > 0.35 ? C.mint : C.berry;
            ctx.beginPath();
            ctx.arc(0, 0, 78, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / windowT));
            ctx.stroke();
            ctx.rotate(ang);
            ctx.fillStyle = C.berry;
            ctx.strokeStyle = INK;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(-45, -18);
            ctx.lineTo(10, -18);
            ctx.lineTo(10, -42);
            ctx.lineTo(55, 0);
            ctx.lineTo(10, 42);
            ctx.lineTo(10, 18);
            ctx.lineTo(-45, 18);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          if (feedback && feedback.t < 0.5) {
            label(ctx, feedback.ok ? 'Fold!' : feedback.late ? 'Too slow' : 'Squish!', 650, 120, 32, feedback.ok ? '#1f8f5f' : C.berry, 'center', 800);
          }
          // buttons
          var glyph = { L: '←', U: '↑', D: '↓', R: '→' };
          for (var b in BTN) {
            rr(ctx, BTN[b][0] - 52, BTN[b][1] - 32, 104, 64, 18);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = INK;
            ctx.stroke();
            label(ctx, glyph[b], BTN[b][0], BTN[b][1] + 2, 40, INK, 'center', 800);
          }
          label(ctx, 'Fold ' + Math.min(6, idx + 1) + ' of 6', 400, 40, 22, INK);
        },
      };
    },
  };

  // ======================================================================
  // 5. Cut the biscuits: stamp the moving cutter over each circle
  // ======================================================================
  var cut = {
    id: 'cut',
    title: 'Cut the biscuits',
    how: 'The cutter slides back and forth. Tap (or press Space) to stamp it right on top of a dotted circle. Four biscuits. Straight down — no twisting!',
    create: function (S, r) {
      var targets = [175, 315, 485, 625].map(function (x) {
        return { x: x + (r() - 0.5) * 30, y: 285, done: false, at: null, s: 0 };
      });
      var cx = 120;
      var dir = 1;
      var speed = 300 + r() * 40;
      var stamping = 0;
      var ended = false;
      var flash = null;
      var t = 0;
      var LIMIT = 20;
      function finish() {
        if (ended) return;
        ended = true;
        var score = targets.reduce(function (a, b) {
          return a + b.s;
        }, 0) / 4;
        var note = score >= 95 ? 'Four perfect circles!' : score >= 75 ? 'Nice and round' : score >= 50 ? 'A little lopsided' : 'Wonky biscuits!';
        if (score >= 90) sfx.good();
        else sfx.bad();
        S.done(score, note, { round: score / 100 });
      }
      return {
        down: function () {
          if (ended || stamping > 0) return;
          var best = null;
          targets.forEach(function (tg) {
            if (tg.done) return;
            if (!best || Math.abs(tg.x - cx) < Math.abs(best.x - cx)) best = tg;
          });
          if (!best) return;
          var d = Math.abs(best.x - cx);
          var s = d < 5 ? 100 : Math.max(0, 100 - (d - 5) * 2.1);
          best.done = true;
          best.at = cx;
          best.s = s;
          stamping = 0.25;
          flash = { s: s, t: 0, x: cx };
          if (s >= 85) sfx.good();
          else if (s >= 50) sfx.tap();
          else sfx.bad();
          speed *= 1.17;
          if (targets.every(function (tg) {
            return tg.done;
          })) finish();
        },
        update: function (dt) {
          t += dt;
          if (stamping > 0) stamping -= dt;
          else {
            cx += dir * speed * dt;
            if (cx > 690) {
              cx = 690;
              dir = -1;
            }
            if (cx < 110) {
              cx = 110;
              dir = 1;
            }
          }
          if (flash) flash.t += dt;
          if (t > LIMIT) {
            targets.forEach(function (tg) {
              tg.done = true;
            });
            finish();
          }
        },
        draw: function (ctx) {
          scene(ctx);
          // rolled dough
          rr(ctx, 80, 200, 640, 170, 50);
          ctx.fillStyle = C.dough;
          ctx.fill();
          ctx.lineWidth = 5;
          ctx.strokeStyle = INK;
          ctx.stroke();
          // rolling pin resting at the bottom
          rr(ctx, 210, 400, 380, 34, 17);
          ctx.fillStyle = '#e8a35c';
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.stroke();
          rr(ctx, 150, 408, 66, 18, 9);
          ctx.fill();
          ctx.stroke();
          rr(ctx, 584, 408, 66, 18, 9);
          ctx.fill();
          ctx.stroke();
          face(ctx, 400, 417, 22, 0.8, {});
          targets.forEach(function (tg) {
            if (tg.done && tg.at !== null) {
              // the actual cut biscuit where you stamped
              ctx.fillStyle = C.doughShade;
              ctx.beginPath();
              ctx.arc(tg.at, tg.y, 52, 0, Math.PI * 2);
              ctx.fill();
              ctx.lineWidth = 4;
              ctx.strokeStyle = INK;
              ctx.stroke();
              face(ctx, tg.at, tg.y, 30, tg.s / 100, {});
            }
            ctx.save();
            ctx.setLineDash([8, 8]);
            ctx.lineWidth = 3;
            ctx.strokeStyle = tg.done ? 'rgba(47,43,107,0.25)' : C.berry;
            ctx.beginPath();
            ctx.arc(tg.x, tg.y, 52, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          });
          // cutter
          var drop = stamping > 0 ? Math.sin((1 - stamping / 0.25) * Math.PI) * 90 : 0;
          ctx.save();
          ctx.translate(cx, 120 + drop);
          ctx.fillStyle = '#d9dff5';
          ctx.strokeStyle = INK;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.ellipse(0, 40, 56, 18, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          rr(ctx, -56, -10, 112, 50, 10);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, -10, 56, 18, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#eef1fb';
          ctx.fill();
          ctx.stroke();
          rr(ctx, -10, -60, 20, 50, 8);
          ctx.fillStyle = C.berry;
          ctx.fill();
          ctx.stroke();
          face(ctx, 0, 18, 26, 0.85, {});
          ctx.restore();
          if (flash && flash.t < 0.7) {
            var txt = flash.s >= 95 ? 'Perfect!' : flash.s >= 75 ? 'Good' : flash.s >= 40 ? 'Wonky' : 'Way off';
            label(ctx, txt, flash.x, 80 - flash.t * 40, 28, flash.s >= 75 ? '#1f8f5f' : C.berry, 'center', 800);
          }
          if (!flash) label(ctx, 'Tap to stamp', 400, 470, 24, INK);
        },
      };
    },
  };

  // ======================================================================
  // 6. Bake: pull them out when they match the golden goal
  // ======================================================================
  var bake = {
    id: 'bake',
    title: 'Bake',
    how: 'Watch them brown. Tap (or press Space) to pull them out when they match the golden goal. Too early = pale and doughy. Too late = burnt!',
    create: function (S, r) {
      var b = 0;
      var k = 0.08 + r() * 0.04;
      var t = 0;
      var ended = false;
      var steam = [];
      for (var i = 0; i < 3; i++) steam.push({ at: 2.2 + r() * 5, dur: 0.8 + r() * 0.6, x: 300 + r() * 200 });
      var GOLD = 0.62;
      var pulled = 0;
      function finish(burnt) {
        if (ended) return;
        ended = true;
        var d = Math.abs(b - GOLD);
        var score = burnt ? 0 : d < 0.015 ? 100 : 100 - (d - 0.015) * 340;
        var note = burnt ? 'Burnt to a crisp!' : d < 0.03 ? 'Golden brown. Gorgeous!' : b < GOLD ? (b < 0.4 ? 'Pale and doughy' : 'A touch pale') : b > 0.82 ? 'Very dark...' : 'A little extra toasty';
        if (score >= 90) {
          sfx.ding();
        } else sfx.bad();
        S.done(score, note, { brown: b });
      }
      return {
        down: function () {
          if (ended) return;
          pulled = 0.001;
          finish(false);
        },
        update: function (dt) {
          t += dt;
          if (!ended) {
            b += k * (0.6 + 1.2 * b) * dt;
            if (b >= 1) {
              b = 1;
              finish(true);
            }
          } else if (pulled) pulled += dt;
        },
        draw: function (ctx) {
          scene(ctx);
          // oven
          rr(ctx, 160, 60, 480, 340, 30);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 5;
          ctx.strokeStyle = INK;
          ctx.stroke();
          // knobs
          for (var i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(230 + i * 50, 90, 13, 0, Math.PI * 2);
            ctx.fillStyle = i === 1 ? C.berry : '#d9dff5';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          label(ctx, '450°', 540, 90, 22, INK, 'center', 800);
          // window
          var slide = pulled ? Math.min(1, pulled * 3) * 140 : 0;
          rr(ctx, 200, 125, 400, 240, 22);
          ctx.fillStyle = ended ? '#2f2b6b' : 'rgb(' + Math.round(80 + 40 * Math.sin(t * 6) * 0.2 + 40) + ',58,70)';
          ctx.fill();
          ctx.lineWidth = 5;
          ctx.stroke();
          ctx.save();
          if (!pulled) {
            rr(ctx, 200, 125, 400, 240, 22);
            ctx.clip();
            // glow
            var g = ctx.createRadialGradient(400, 260, 20, 400, 260, 260);
            g.addColorStop(0, 'rgba(255,170,80,0.55)');
            g.addColorStop(1, 'rgba(255,120,60,0)');
            ctx.fillStyle = g;
            ctx.fillRect(200, 125, 400, 240);
          }
          // tray + biscuits
          ctx.translate(0, slide);
          rr(ctx, 230, 300, 340, 20, 8);
          ctx.fillStyle = '#c5cbe0';
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = INK;
          ctx.stroke();
          var rise = Math.min(1, b / 0.5);
          var mood = b < 0.3 ? 0.55 : b < 0.54 ? 0.6 : b <= 0.72 ? 0.95 : b <= 0.85 ? 0.4 : 0.1;
          [300, 400, 500].forEach(function (x, j) {
            var bh = 30 + rise * 32;
            ctx.save();
            rr(ctx, x - 42, 300 - bh, 84, bh + 4, 18);
            ctx.fillStyle = ART.crust(b);
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = INK;
            ctx.stroke();
            face(ctx, x, 300 - bh * 0.45, 26, mood, { sleepy: b < 0.3, sweat: b > 0.72 && b <= 0.85 });
            ctx.restore();
          });
          ctx.restore();
          // steam puffs that block the view for a moment
          if (!ended) {
            steam.forEach(function (s) {
              var p = (t - s.at) / s.dur;
              if (p > 0 && p < 1) {
                ctx.fillStyle = 'rgba(255,255,255,' + Math.sin(p * Math.PI) * 0.92 + ')';
                for (var q = 0; q < 5; q++) {
                  ctx.beginPath();
                  ctx.arc(s.x + q * 30 - 60, 240 + Math.sin(q * 2) * 30 - p * 30, 50, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
            });
          }
          // golden goal swatch
          rr(ctx, 660, 150, 120, 150, 20);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = INK;
          ctx.stroke();
          label(ctx, 'Golden goal', 720, 176, 18, INK);
          rr(ctx, 680, 205, 80, 62, 16);
          ctx.fillStyle = ART.crust(GOLD);
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.stroke();
          face(ctx, 720, 236, 24, 0.95, {});
          if (!ended) label(ctx, 'Tap to pull them out', 400, 455, 26, INK);
        },
      };
    },
  };

  var LIST = [flour, butter, stir, fold, cut, bake];

  // Turn the six station results into how the finished biscuit looks.
  function lookFrom(results, seed) {
    var s = results.map(function (x) {
      return x ? x.score : 0;
    });
    var d = function (i, key, dflt) {
      return results[i] && results[i].data && typeof results[i].data[key] === 'number' ? results[i].data[key] : dflt;
    };
    var total = s.reduce(function (a, b) {
      return a + b;
    }, 0);
    return {
      rise: clamp((s[1] * 0.45 + s[3] * 0.3 + s[0] * 0.25) / 100, 0, 1),
      layers: clamp(d(3, 'layers', 2) + 1, 0, 8),
      round: clamp(s[4] / 100, 0, 1),
      brown: clamp(d(5, 'brown', 0.62), 0, 1),
      tender: clamp((s[2] * 0.7 + s[0] * 0.3) / 100, 0, 1),
      mood: clamp(total / 600, 0, 1),
      seed: seed,
    };
  }

  function rating(points) {
    if (points >= 570) return { title: 'The Perfect Biscuit', line: 'Flaky, tall, golden. Frame it.' };
    if (points >= 510) return { title: 'Blue Ribbon Biscuit', line: 'The county fair judges are crying.' };
    if (points >= 420) return { title: 'Solid Southern Biscuit', line: 'Pass the honey butter.' };
    if (points >= 300) return { title: 'Hockey Puck-ish', line: 'Technically edible. Dunk it in gravy.' };
    return { title: 'Biscuit Disaster', line: "It's... a doorstop now." };
  }

  window.STATIONS = { Stage: Stage, LIST: LIST, lookFrom: lookFrom, rating: rating, W: W, H: H };
})();
