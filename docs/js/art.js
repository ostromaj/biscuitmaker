// Drawing helpers: little faces, the finished biscuit, chef hats.
(function () {
  'use strict';

  var INK = '#2f2b6b';

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // A tiny kawaii face. mood: 0 (miserable) .. 1 (delighted)
  function face(ctx, x, y, s, mood, opts) {
    opts = opts || {};
    var eyeGap = s * 0.42;
    var ey = y - s * 0.08;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = opts.ink || INK;
    ctx.fillStyle = opts.ink || INK;
    ctx.lineWidth = Math.max(1.5, s * 0.1);
    if (mood > 0.45) {
      ctx.globalAlpha = 0.45 + 0.3 * mood;
      ctx.fillStyle = '#ff7f9f';
      ctx.beginPath();
      ctx.ellipse(x - eyeGap * 1.25, y + s * 0.12, s * 0.17, s * 0.1, 0, 0, Math.PI * 2);
      ctx.ellipse(x + eyeGap * 1.25, y + s * 0.12, s * 0.17, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = opts.ink || INK;
    }
    if (opts.sleepy) {
      ctx.beginPath();
      ctx.moveTo(x - eyeGap - s * 0.12, ey);
      ctx.lineTo(x - eyeGap + s * 0.12, ey);
      ctx.moveTo(x + eyeGap - s * 0.12, ey);
      ctx.lineTo(x + eyeGap + s * 0.12, ey);
      ctx.stroke();
    } else if (mood < 0.18) {
      // dizzy X eyes
      var k = s * 0.1;
      [-1, 1].forEach(function (d) {
        var ex = x + d * eyeGap;
        ctx.beginPath();
        ctx.moveTo(ex - k, ey - k);
        ctx.lineTo(ex + k, ey + k);
        ctx.moveTo(ex + k, ey - k);
        ctx.lineTo(ex - k, ey + k);
        ctx.stroke();
      });
    } else if (mood > 0.8) {
      // happy closed ^ ^ eyes
      [-1, 1].forEach(function (d) {
        ctx.beginPath();
        ctx.arc(x + d * eyeGap, ey + s * 0.05, s * 0.12, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      });
    } else {
      [-1, 1].forEach(function (d) {
        ctx.beginPath();
        ctx.arc(x + d * eyeGap, ey, s * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x + d * eyeGap + s * 0.03, ey - s * 0.035, s * 0.03, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = opts.ink || INK;
      });
    }
    // mouth
    var my = y + s * 0.16;
    var curve = (mood - 0.45) * s * 0.5;
    if (opts.open || mood > 0.9) {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.16, my - s * 0.02);
      ctx.quadraticCurveTo(x, my + s * 0.34, x + s * 0.16, my - s * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff7f9f';
      ctx.beginPath();
      ctx.ellipse(x, my + s * 0.1, s * 0.07, s * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (opts.wobbly || (mood >= 0.18 && mood < 0.3)) {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.16, my);
      for (var i = 1; i <= 4; i++) {
        ctx.lineTo(x - s * 0.16 + i * s * 0.08, my + (i % 2 ? -1 : 1) * s * 0.04);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.15, my);
      ctx.quadraticCurveTo(x, my + curve, x + s * 0.15, my);
      ctx.stroke();
    }
    if (opts.sweat) {
      ctx.fillStyle = '#7fd3ff';
      ctx.beginPath();
      ctx.moveTo(x + s * 0.62, y - s * 0.4);
      ctx.quadraticCurveTo(x + s * 0.74, y - s * 0.18, x + s * 0.62, y - s * 0.12);
      ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.18, x + s * 0.62, y - s * 0.4);
      ctx.fill();
    }
    ctx.restore();
  }

  // pale -> golden -> brown -> burnt
  var STOPS = [
    [0, [246, 231, 193]],
    [0.35, [240, 207, 134]],
    [0.62, [224, 162, 74]],
    [0.8, [184, 106, 43]],
    [1, [62, 36, 20]],
  ];
  function crust(b, shade) {
    b = Math.max(0, Math.min(1, b));
    for (var i = 1; i < STOPS.length; i++) {
      if (b <= STOPS[i][0]) {
        var a = STOPS[i - 1];
        var c = STOPS[i];
        var t = (b - a[0]) / (c[0] - a[0]);
        var rgb = a[1].map(function (v, j) {
          return Math.round((v + (c[1][j] - v) * t) * (shade || 1));
        });
        return 'rgb(' + rgb.map(function (v) {
          return Math.max(0, Math.min(255, v));
        }).join(',') + ')';
      }
    }
    return 'rgb(62,36,20)';
  }

  // The finished biscuit, built from how the student actually played.
  // look: { rise, layers, round, brown, tender, mood, seed }
  function biscuit(ctx, cx, base, W, look) {
    look = look || { rise: 0.7, layers: 4, round: 0.8, brown: 0.62, tender: 0.8, mood: 0.8, seed: 1 };
    var r = BK.rng((look.seed || 7) + 99);
    var H = W * (0.17 + 0.3 * look.rise);
    var rx = W / 2;
    var ry = W * 0.17;
    var y0 = base - H;
    var wob = (1 - look.round) * 0.16;
    var ph = [r() * 6, r() * 6, r() * 6];
    function wx(a) {
      return 1 + wob * (Math.sin(a * 2 + ph[0]) * 0.6 + Math.sin(a * 3 + ph[1]) * 0.4 + Math.sin(a * 5 + ph[2]) * 0.25);
    }

    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(47,43,107,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, base + ry * 0.35, rx * 1.05, ry * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // body (side)
    ctx.beginPath();
    var N = 40;
    for (var i = 0; i <= N; i++) {
      var a = (i / N) * Math.PI;
      var x = cx + rx * Math.cos(a) * wx(a);
      var y = base + ry * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y0);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cx - rx * wx(Math.PI), y0);
    ctx.closePath();
    var sideGrad = ctx.createLinearGradient(0, y0, 0, base + ry);
    sideGrad.addColorStop(0, crust(look.brown * 0.55, 1.03));
    sideGrad.addColorStop(0.7, crust(look.brown * 0.45, 1.05));
    sideGrad.addColorStop(1, crust(look.brown * 0.95, 0.95));
    ctx.fillStyle = sideGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(47,43,107,0.55)';
    ctx.lineWidth = Math.max(2, W * 0.018);
    ctx.stroke();

    // flaky layers on the side
    ctx.save();
    ctx.clip();
    // a few soft, broken lines: flaky, not a pancake stack
    ctx.strokeStyle = 'rgba(190,120,50,0.45)';
    ctx.lineWidth = Math.max(1.2, W * 0.008);
    ctx.lineCap = 'round';
    var L = look.layers;
    var shown = Math.min(4, Math.ceil(L / 2));
    for (var k = 1; k <= shown; k++) {
      var yy = y0 + ((base - y0) * k) / (shown + 1) + ry * 0.15;
      for (var seg = 0; seg < 2; seg++) {
        var a0 = seg === 0 ? 0.08 + r() * 0.1 : 0.62 + r() * 0.1;
        var a1 = a0 + 0.22 + r() * 0.12;
        ctx.beginPath();
        for (var j = 0; j <= 10; j++) {
          var aa = (a0 + ((a1 - a0) * j) / 10) * Math.PI;
          var px = cx + rx * Math.cos(aa) * wx(aa) * 0.99;
          var py = yy + ry * Math.sin(aa) * 0.85;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // flakes poking out the sides
    for (var f = 0; f < Math.min(L, 6); f++) {
      var side = f % 2 ? 1 : -1;
      var fy = y0 + ((base - y0) * (f + 1)) / (L + 1) + ry * 0.4;
      var fx = cx + side * rx * wx(side > 0 ? 0 : Math.PI) * 0.99;
      ctx.fillStyle = crust(look.brown * 0.6, 1.02);
      ctx.beginPath();
      ctx.ellipse(fx + side * W * 0.012, fy, W * 0.028, W * 0.012, side * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // top
    ctx.beginPath();
    for (var t = 0; t <= N * 2; t++) {
      var a2 = (t / (N * 2)) * Math.PI * 2;
      var x2 = cx + rx * Math.cos(a2) * wx(a2);
      var y2 = y0 + ry * Math.sin(a2);
      if (t === 0) ctx.moveTo(x2, y2);
      else ctx.lineTo(x2, y2);
    }
    ctx.closePath();
    var topGrad = ctx.createRadialGradient(cx, y0, rx * 0.1, cx, y0, rx * 1.1);
    topGrad.addColorStop(0, crust(look.brown * 0.92));
    topGrad.addColorStop(1, crust(Math.min(1, look.brown * 1.08 + 0.03), 0.95));
    ctx.fillStyle = topGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(47,43,107,0.55)';
    ctx.stroke();

    // butter shine
    ctx.fillStyle = 'rgba(255,255,255,' + (0.18 + 0.25 * look.mood) + ')';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.35, y0 - ry * 0.25, rx * 0.22, ry * 0.22, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // tough dough = cracks and dense specks
    var cracks = Math.round((1 - look.tender) * 6);
    ctx.strokeStyle = 'rgba(70,40,20,0.45)';
    ctx.lineWidth = Math.max(1, W * 0.008);
    for (var c = 0; c < cracks; c++) {
      var sx = cx + (r() - 0.5) * rx * 1.2;
      var sy = y0 + (r() - 0.5) * ry * 1.1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (r() - 0.5) * W * 0.12, sy + (r() - 0.5) * W * 0.04);
      ctx.lineTo(sx + (r() - 0.5) * W * 0.16, sy + (r() - 0.5) * W * 0.05);
      ctx.stroke();
    }

    // face on the front
    var faceY = y0 + (base - y0) * 0.5 + ry * 0.62;
    face(ctx, cx, faceY, W * 0.26, look.mood, {
      sleepy: look.brown < 0.25,
      sweat: look.brown > 0.82 && look.brown <= 0.92,
    });

    // burnt = smoke
    if (look.brown > 0.88) {
      ctx.strokeStyle = 'rgba(90,90,110,0.5)';
      ctx.lineWidth = W * 0.03;
      ctx.lineCap = 'round';
      for (var s = -1; s <= 1; s++) {
        ctx.beginPath();
        var bx = cx + s * rx * 0.4;
        ctx.moveTo(bx, y0 - ry * 0.5);
        ctx.bezierCurveTo(bx - W * 0.06, y0 - W * 0.2, bx + W * 0.06, y0 - W * 0.3, bx, y0 - W * 0.42);
        ctx.stroke();
      }
    }
    // perfect = sparkles
    if (look.mood >= 0.95) {
      sparkle(ctx, cx + rx * 0.95, y0 - ry * 1.2, W * 0.08, '#ffd23f');
      sparkle(ctx, cx - rx * 0.9, y0 - ry * 0.6, W * 0.055, '#ffffff');
      sparkle(ctx, cx + rx * 0.55, y0 - ry * 2.2, W * 0.05, '#ffd23f');
    }
    ctx.restore();
  }

  function sparkle(ctx, x, y, s, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      var rad = i % 2 ? s * 0.32 : s;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Biscuit as a DOM canvas (for lists, podium, results).
  function biscuitCanvas(look, size) {
    var c = document.createElement('canvas');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    var ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    biscuit(ctx, size / 2, size * 0.74, size * 0.78, look);
    c.className = 'biscuit-canvas';
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', 'A biscuit');
    return c;
  }

  function hatSVG(color, size) {
    size = size || 40;
    return (
      '<svg class="hat" width="' + size + '" height="' + size + '" viewBox="0 0 40 40" aria-hidden="true">' +
      '<g stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round">' +
      '<path d="M10 26 C3 25 3 13 11 13 C11 5 22 3 24 10 C30 5 38 12 32 19 C36 23 33 27 30 26 Z" fill="' + color + '"/>' +
      '<rect x="10" y="25" width="20" height="9" rx="2.5" fill="' + color + '"/>' +
      '<path d="M15 26 V33 M20 26 V33 M25 26 V33" stroke-width="1.6" opacity=".5"/>' +
      '</g></svg>'
    );
  }

  window.ART = { rr: rr, face: face, crust: crust, biscuit: biscuit, sparkle: sparkle, biscuitCanvas: biscuitCanvas, hatSVG: hatSVG, INK: INK };
})();
