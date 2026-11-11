/* camera-rig: one camera over one world. The root is the viewport (overflow hidden) and wraps a
 * .sfc-stage, the world plane, which keeps its natural layout size. The camera is a list of keys.
 *
 * Key {t, x, y, zoom=1, rot=0, ease='sine.inOut'}: at time t the world point (W/2 + x, H/2 + y) of a
 * W x H stage sits at the centre of the viewport, scaled by zoom and turned by rot degrees. So
 * {x:0, y:0, zoom:1} is the stage as laid out (centred). A key can instead name an element to frame:
 * {t, target:'.selector', fill=0.7} centres it and zooms until it fills that share of the frame (an
 * explicit zoom wins). Missing x/y/zoom/rot carry over from the previous key.
 * Each leg uses the ease of the key it arrives at. Zoom is interpolated in log space, so a 1x to 2x push
 * and a 2x to 4x push feel like the same speed.
 *
 * Two operator layers sit on top, both screen space and both pure functions of the time:
 *  - hand {amp=6, period=3.1}: a slow float made of two incommensurate sines per axis, at most amp px
 *    on screen. Its envelope is sin(pi * leg progress) on moving legs, so it is exactly 0 at every key
 *    and through every hold (two equal keys in a row). Holds are dead still.
 *  - shakeOn [t | {t, amp=4}]: a short decaying shake that starts from zero at t and is gone by t + 0.4.
 * A faint far lattice (lattice=true) parallaxes at half depth, so a pan over empty ground still reads.
 *
 * The timeline only carries the duration. Drawing happens in render(t), which the runtime calls on the
 * timeline's update (web, deck, print) or from SFC.composeHF (HyperFrames): seek with events on.
 * No clock, no Math.random (phases come from SFC.rng(seed)). Reduced motion: the last key, no float, no shake. */
(function () {
  'use strict';
  var SHAKE_LEN = 0.4, SHAKE_DECAY = 0.08, LATTICE_DEPTH = 0.5;
  var states = new WeakMap();
  var TAU = Math.PI * 2;

  var num = function (v, d) { v = Number(v); return Number.isFinite(v) ? v : d; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  // Box of el in the stage's own (untransformed) coordinates, from layout offsets.
  function localBox(el, stage) {
    var x = 0, y = 0;
    for (var n = el; n && n !== stage; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }

  function normalize(list, s) {
    var prev = { t: 0, x: 0, y: 0, zoom: 1, rot: 0 };
    var keys = (Array.isArray(list) ? list : []).filter(function (k) { return k && typeof k === 'object'; })
      .map(function (k) {
        var key = {
          t: Math.max(0, num(k.t, prev.t)),
          x: num(k.x, prev.x), y: num(k.y, prev.y), zoom: num(k.zoom, NaN), rot: num(k.rot, prev.rot),
          ease: typeof k.ease === 'string' ? k.ease : 'sine.inOut',
        };
        if (k.target) {
          var el = s.stage.querySelector(k.target);
          if (!el) throw new Error('camera-rig: key target "' + k.target + '" is not inside .sfc-stage');
          var b = localBox(el, s.stage);
          var fill = Math.min(1, Math.max(0.05, num(k.fill, 0.7)));
          key.x = b.x + b.w / 2 - s.W / 2;
          key.y = b.y + b.h / 2 - s.H / 2;
          if (!(key.zoom > 0)) key.zoom = Math.min(s.Vw * fill / Math.max(1, b.w), s.Vh * fill / Math.max(1, b.h));
        }
        if (!(key.zoom > 0)) key.zoom = prev.zoom;
        prev = key;
        return key;
      });
    keys.sort(function (a, b) { return a.t - b.t; });
    return keys.length ? keys : [{ t: 0, x: 0, y: 0, zoom: 1, rot: 0, ease: 'none' }];
  }

  var equalKeys = function (a, b) { return a.x === b.x && a.y === b.y && a.zoom === b.zoom && a.rot === b.rot; };

  // Camera state at time t, before the operator layers. env is the hand-float envelope.
  function camAt(keys, t) {
    var first = keys[0], last = keys[keys.length - 1];
    if (t <= first.t) return { x: first.x, y: first.y, zoom: first.zoom, rot: first.rot, env: 0 };
    if (t >= last.t) return { x: last.x, y: last.y, zoom: last.zoom, rot: last.rot, env: 0 };
    var i = 0;
    while (keys[i + 1].t <= t) i++;
    var a = keys[i], b = keys[i + 1];
    var p = (t - a.t) / (b.t - a.t);
    var e = gsap.parseEase(b.ease)(p);
    return {
      x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e),
      zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), e)),
      rot: lerp(a.rot, b.rot, e),
      env: equalKeys(a, b) ? 0 : Math.sin(Math.PI * p),
    };
  }

  function shakeAt(s, t) {
    var out = { x: 0, y: 0, r: 0 };
    s.shakes.forEach(function (h) {
      var dt = t - h.t;
      if (!(dt > 0 && dt < SHAKE_LEN)) return;
      var k = h.amp * Math.exp(-dt / SHAKE_DECAY) * (1 - dt / SHAKE_LEN);
      out.x += k * Math.sin(TAU * h.f1 * dt);
      out.y += 0.6 * k * Math.sin(TAU * h.f2 * dt);
      out.r += 0.03 * k * Math.sin(TAU * h.f3 * dt);
    });
    return out;
  }

  function draw(s, t) {
    var c = camAt(s.keys, t);
    var hx = 0, hy = 0, sh = { x: 0, y: 0, r: 0 };
    if (!s.still) {
      if (s.amp > 0 && c.env > 0) {
        var P = s.period, ph = s.phase;
        hx = s.amp * c.env * 0.78 * (0.62 * Math.sin(TAU * t / P + ph[0]) + 0.38 * Math.sin(TAU * t / (P * 1.618) + ph[1]));
        hy = s.amp * c.env * 0.62 * (0.6 * Math.sin(TAU * t / (P * 1.27) + ph[2]) + 0.4 * Math.sin(TAU * t / (P * 0.77) + ph[3]));
      }
      sh = shakeAt(s, t);
    }
    var ox = hx + sh.x, oy = hy + sh.y;
    s.stage.style.transform = 'translate(' + (s.Vw / 2 - s.sx + ox) + 'px, ' + (s.Vh / 2 - s.sy + oy) + 'px) rotate(' +
      (c.rot + sh.r) + 'deg) scale(' + c.zoom + ') translate(' + -(s.W / 2 + c.x) + 'px, ' + -(s.H / 2 + c.y) + 'px)';
    if (s.lattice) {
      var L = s.lat, d = LATTICE_DEPTH;
      s.lattice.style.transform = 'translate(' + (s.Vw / 2 - L.x + ox * d) + 'px, ' + (s.Vh / 2 - L.y + oy * d) + 'px) rotate(' +
        (c.rot + sh.r) * d + 'deg) scale(' + Math.pow(c.zoom, d) + ') translate(' + -(L.w / 2 + c.x * d) + 'px, ' + -(L.h / 2 + c.y * d) + 'px)';
    }
  }

  SFC.define('camera-rig', {
    duration: 4,
    build: function (root, tl, opts) {
      var stage = root.querySelector(':scope > .sfc-stage');
      if (!stage) throw new Error('camera-rig: the root needs a direct child .sfc-stage (the world plane)');
      var old = root.querySelector(':scope > .sfc-camera-lattice');
      if (old) old.remove();
      var lattice = null;
      if (opts.lattice !== false) {
        lattice = document.createElement('div');
        lattice.className = 'sfc-camera-lattice';
        lattice.setAttribute('aria-hidden', 'true');
        lattice.setAttribute('data-layout-ignore', ''); // HyperFrames layout audit: decoration, never audited
        root.insertBefore(lattice, stage);
      }
      // HyperFrames layout audit: a camera frames past the canvas edges on purpose (pushes, travels).
      // allowOverflow:false keeps the audit on, for gentle cameras that should never crop content.
      if (opts.allowOverflow === false) stage.removeAttribute('data-layout-allow-overflow');
      else stage.setAttribute('data-layout-allow-overflow', '');
      var hand = opts.hand && typeof opts.hand === 'object' ? opts.hand : {};
      var rand = SFC.rng(num(opts.seed, 1));
      var s = {
        stage: stage, lattice: lattice,
        Vw: root.clientWidth, Vh: root.clientHeight,
        W: stage.offsetWidth, H: stage.offsetHeight, sx: stage.offsetLeft, sy: stage.offsetTop,
        amp: Math.max(0, num(hand.amp, 6)), period: Math.max(0.2, num(hand.period, 3.1)),
        phase: [rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU],
        still: SFC.reduced(),
      };
      if (lattice) s.lat = { x: lattice.offsetLeft, y: lattice.offsetTop, w: lattice.offsetWidth, h: lattice.offsetHeight };
      s.keys = normalize(opts.keys, s);
      s.shakes = (Array.isArray(opts.shakeOn) ? opts.shakeOn : []).map(function (h) {
        var o = typeof h === 'object' && h ? h : { t: h };
        return { t: num(o.t, NaN), amp: Math.max(0, num(o.amp, 4)), f1: 15 + 4 * rand(), f2: 12 + 4 * rand(), f3: 9 + 3 * rand() };
      }).filter(function (h) { return Number.isFinite(h.t); });
      states.set(root, s);

      var end = s.keys[s.keys.length - 1].t;
      s.shakes.forEach(function (h) { end = Math.max(end, h.t + SHAKE_LEN); });
      tl.to({}, { duration: Math.max(0.1, end), ease: 'none' }, 0);
      draw(s, 0); // frame 0, painted before any seek
      return tl;
    },
    render: function (t, root) {
      var s = states.get(root);
      if (s) draw(s, t);
    },
  });
})();
