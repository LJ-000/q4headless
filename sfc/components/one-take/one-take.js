/* one-take: SFC.oneTake(config), one camera over one world, scrubbed by the scroll.
 *
 * The page is a list of areas (<section class="ot-area"> inside <main data-ot>) placed on a world plane.
 * One paused master timeline holds everything: the camera (camera-rig), every component in every area after
 * the first (each built paused with SFC.build and played through a tween of its own time), one carry per
 * seam (SFC.carry) and the hand that causes it. ScrollTrigger maps the scroll position to the master's
 * progress with scrub: true, so one scroll position always gives one frame, forwards or backwards. Nothing
 * here reads a clock or Math.random.
 *
 * A page is its markup plus a config:
 *
 *   SFC.oneTake({
 *     areas: { hero: { x: 0, y: 0, rest: 0.8 }, proof: { x: 2060, y: 180, w: 1400, h: 720 } },
 *     tagline: { x: 120, y: 1380 },
 *     extend: function (o) { o.tl.to('.spark', { autoAlpha: 0 }, o.T.dwellEnd[0]); },
 *   });
 *
 * Config (every key optional):
 *   root      selector or element of the <main>; default 'main[data-ot]'
 *   px        scroll pixels per timeline second; default 380 (or <main data-ot-px>)
 *   cursor    false drops the hand (or <main data-ot-cursor="off">)
 *   pullback  false drops the final pull-back over the whole world (or <main data-ot-pullback="off">)
 *   intensity 1 to 5; default the number in <meta name="sfc-intensity">, else 2. 3 and up adds one landing shake
 *   areas     { <area id>: { x, y, w, h, zoom, focus, rest, seam } }; wins over the data-ot-* attributes
 *   tagline   { x, y } for the [data-ot-tagline] line the pull-back lands on
 *   extend    function (o): add tweens to o.tl before the driver starts; o is the object oneTake resolves to
 *   maxStep   the speed limit in px per 1/60 s; default 80
 *
 * Markup contract (see README.md):
 *   <main class="ot" data-ot>
 *     <section class="ot-area" id="hero"
 *              data-ot-x="0" data-ot-y="0"          world position (required, here or in config)
 *              data-ot-w="1920" data-ot-h="1080"    size, default 1920 x 1080
 *              data-ot-zoom="1"                     camera zoom while the area is on screen
 *              data-ot-focus="#sel"                 frame this element instead of the area centre
 *              data-ot-rest="1.4"                   seconds of dead stillness after the area plays
 *              data-ot-seam="reset">                no carry into this area: a hard chapter reset
 *       <... data-carry="key">                      the same key in two neighbouring areas is a carry
 *       <div data-sfc="kinetic-type" data-ot-at="0.3" data-ot-hold="2.2,1;4,0.8">
 *     <p class="ot-tagline" data-ot-tagline><span>One</span> <span>line.</span></p>
 *
 * The first area is the page's first screen: its components play once when the page loads, on their own
 * clock, so the page opens finished and moving. Every other area plays on the scroll.
 *
 * Static page (no camera, no scroll listener): reduced motion, ?medium=print, or a window narrower than
 * 760 px. The areas stack and every component mounts the normal way (final frame under reduced motion
 * and print, played in view on a narrow screen).
 *
 * Speed: at build time every camera leg is checked against maxStep, using the real peak slope of its ease
 * (SFC.oneTake.easePeak). A leg over the limit is a warning in o.warnings and in the console.
 *
 * Test hooks: ?scroll=off builds the live world without ScrollTrigger; ?t=12.5 seeks to one moment;
 * ?motion=reduce answers the reduced-motion query as true; ?medium=print|web.
 * window.__onetake resolves to { mode, tl, T, keys, seams, rests, areas, comps, warnings, ... } once built.
 * Needs components/camera-rig, components/carry and vendor/Flip.min.js (vendor/ScrollTrigger.min.js to scrub). */
(function () {
  'use strict';
  if (!window.SFC) throw new Error('one-take: load sfc.js first');
  var FW = 1920, FH = 1080;   // the frame the camera films
  var NARROW = 760;
  var CARRY = 0.8;            // every carry, seconds
  var EASE = 'power1.inOut';  // the carry and the camera share it: a quad S-curve peaks at twice the average speed
  var HAND_IN = 0.5, PRESS = 0.2;
  var PULL = 2.2;             // the final pull-back
  var MAX_STEP = 80;          // px per 1/60 s: the fastest thing on screen

  var num = function (v, d) { v = Number(v); return v === v && v !== Infinity && v !== -Infinity && String(v) !== '' ? v : d; };
  var all = function (sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); };
  var div = function (cls) { var e = document.createElement('div'); e.className = cls; return e; };
  var optsOf = function (el) { return JSON.parse(el.dataset.sfcOpts || '{}'); };

  // ---------------------------------------------------------------------------------------------------
  // speed

  // The largest slope of an ease (1 = the average speed). power1.inOut is 2, power2.inOut 3, sine.inOut
  // about 1.57, expo.inOut about 6.9. Sampled from GSAP's own ease, so any ease name works.
  var peaks = {};
  function easePeak(name) {
    name = name || 'none';
    if (peaks[name] != null) return peaks[name];
    var f = window.gsap && gsap.parseEase(name), best = 1;
    if (typeof f === 'function') {
      for (var i = 0, n = 400, prev = f(0); i < n; i++) {
        var v = f((i + 1) / n);
        best = Math.max(best, (v - prev) * n);
        prev = v;
      }
    }
    peaks[name] = Math.round(best * 100) / 100;
    return peaks[name];
  }

  // Camera keys -> a warning per leg whose fastest point passes maxStep px per 1/60 s. A key arrives with
  // its own ease; a key marked cut is a deliberate hard cut and is skipped.
  function checkKeys(keys, maxStep) {
    var limit = maxStep || MAX_STEP, out = [];
    for (var j = 1; j < keys.length; j++) {
      var a = keys[j - 1], b = keys[j], dt = b.t - a.t;
      if (b.cut || !(dt > 0)) continue;
      var d = Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0)) * Math.max(b.zoom || 1, a.zoom || 1);
      var peak = d * easePeak(b.ease) / dt / 60;
      if (peak > limit) {
        out.push('camera leg ' + a.t.toFixed(2) + '-' + b.t.toFixed(2) + ' s runs at ' + Math.round(peak) + ' px per frame (limit ' + limit + '); move the areas closer or lengthen the leg');
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------
  // geometry

  // Box of el in world coordinates, from layout offsets, so transforms are ignored.
  function wbox(el, world) {
    var x = 0, y = 0;
    for (var n = el; n && n !== world; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight, cx: x + el.offsetWidth / 2, cy: y + el.offsetHeight / 2 };
  }

  // A smooth path through the points (Catmull-Rom as cubic Beziers).
  function smooth(p) {
    var d = 'M' + p[0][0] + ' ' + p[0][1];
    for (var i = 0; i < p.length - 1; i++) {
      var a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      var c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
      d += ' C' + c1.map(Math.round).join(' ') + ' ' + c2.map(Math.round).join(' ') + ' ' + c.map(Math.round).join(' ');
    }
    return d;
  }

  // "2.2,1;4,0.8" -> [[2.2, 1], [4, 0.8]]: stop the component at 2.2 s of its own time for 1 s, then at 4 s for 0.8 s.
  function parseHolds(s) {
    return String(s || '').split(';').map(function (p) { return p.split(',').map(Number); })
      .filter(function (h) { return h.length === 2 && h[0] >= 0 && h[1] > 0; }).sort(function (a, b) { return a[0] - b[0]; });
  }

  // ---------------------------------------------------------------------------------------------------

  function oneTake(cfg) {
    cfg = cfg || {};
    var q = new URLSearchParams(location.search);
    var html = document.documentElement;
    var main = typeof cfg.root === 'string' ? document.querySelector(cfg.root) : (cfg.root || document.querySelector('main[data-ot]'));
    var resolveReady;
    var ready = new Promise(function (r) { resolveReady = r; });
    window.__onetake = ready;
    if (!main) { resolveReady({ mode: 'none' }); return ready; }

    // Test hooks. They run before anything asks SFC for the medium or the motion preference.
    (function () {
      var m = q.get('medium');
      if (m === 'print' || m === 'web') html.dataset.sfcMedium = m;
      if (q.get('motion') === 'reduce' && window.matchMedia) {
        var real = window.matchMedia.bind(window);
        window.matchMedia = function (query) {
          if (/prefers-reduced-motion:\s*reduce/.test(query)) {
            return { matches: true, media: query, onchange: null, addListener: function () {}, removeListener: function () {},
              addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return false; } };
          }
          return real(query);
        };
      }
    })();

    var staticPage = SFC.reduced() || SFC.medium() === 'print' || (SFC.medium() === 'web' && window.innerWidth < NARROW);
    if (staticPage) {
      html.classList.add('ot-static');
      SFC.mountAll().then(function (mounts) {
        resolveReady({ mode: 'static', mounts: mounts, areas: all(':scope > .ot-area', main) });
      }).catch(fail);
      return ready;
    }

    html.classList.add('ot-live');
    Promise.resolve(document.fonts && document.fonts.ready).then(build).catch(fail);
    return ready;

    function fail(e) {
      console.error(e);
      html.classList.add('ot-ready');
      resolveReady({ mode: 'error', error: String((e && e.message) || e) });
    }

    function build() {
      if (!SFC.carry) throw new Error('one-take: load components/carry/carry.js before calling SFC.oneTake');
      gsap.registerPlugin(window.Flip);
      var warnings = [];
      var maxStep = num(cfg.maxStep, MAX_STEP);
      var px = num(cfg.px != null ? cfg.px : main.dataset.otPx, 380);
      var useHand = cfg.cursor != null ? cfg.cursor !== false : main.dataset.otCursor !== 'off';
      var pullback = cfg.pullback != null ? cfg.pullback !== false : main.dataset.otPullback !== 'off';
      var meta = document.querySelector('meta[name="sfc-intensity"]');
      var intensity = num(cfg.intensity != null ? cfg.intensity : meta && meta.content, 2);
      var byId = cfg.areas || {};

      // 1. The shell: view (sticky) > root (the 1920 x 1080 frame) > ground, rig > world, hand.
      var view = div('ot-view'), rootEl = div('ot-root'), ground = div('ot-ground'), rig = div('ot-rig'), world = div('ot-world sfc-stage');
      ground.setAttribute('aria-hidden', 'true');
      var NS = 'http://www.w3.org/2000/svg';
      var routeSvg = document.createElementNS(NS, 'svg');
      routeSvg.setAttribute('class', 'ot-route');
      routeSvg.setAttribute('aria-hidden', 'true');
      routeSvg.setAttribute('focusable', 'false');
      var route = document.createElementNS(NS, 'path');
      route.setAttribute('pathLength', '1');
      routeSvg.appendChild(route);
      var cursor = document.createElementNS(NS, 'svg');
      cursor.setAttribute('class', 'ot-cursor');
      cursor.setAttribute('viewBox', '0 0 28 36');
      cursor.setAttribute('aria-hidden', 'true');
      cursor.setAttribute('focusable', 'false');
      cursor.innerHTML = '<path d="M3 2 L3 29 L10 22.5 L14.5 33 L19 31 L14.6 20.8 L24 20.8 Z"></path>';

      var areaEls = all(':scope > .ot-area', main);
      var tagEls = all(':scope > [data-ot-tagline]', main);
      if (!areaEls.length) throw new Error('one-take: no <section class="ot-area"> in <main data-ot>');
      world.style.width = world.style.height = '24000px'; // roomy while measuring; trimmed below
      world.appendChild(routeSvg);
      areaEls.concat(tagEls).forEach(function (n) { world.appendChild(n); });
      rig.appendChild(world);
      rootEl.appendChild(ground);
      rootEl.appendChild(rig);
      rootEl.appendChild(cursor);
      view.appendChild(rootEl);
      main.appendChild(view);

      // 2. Place the areas and the tagline lines on the world. Config wins over the data-ot-* attributes.
      var areas = areaEls.map(function (el, i) {
        var c = byId[el.id] || {};
        var pick = function (k, attr) { return c[k] != null ? c[k] : el.dataset[attr]; };
        var g = { el: el, id: el.id || ('area-' + (i + 1)), x: num(pick('x', 'otX'), NaN), y: num(pick('y', 'otY'), NaN),
          w: num(pick('w', 'otW'), FW), h: num(pick('h', 'otH'), FH), zoom: num(pick('zoom', 'otZoom'), 1),
          rest: num(pick('rest', 'otRest'), i === 0 ? 0.8 : 1.4), focus: pick('focus', 'otFocus'), seam: pick('seam', 'otSeam') };
        if (!(g.x === g.x) || !(g.y === g.y)) throw new Error('one-take: area "' + g.id + '" needs x and y (config areas.' + g.id + ' or data-ot-x and data-ot-y)');
        el.style.left = g.x + 'px'; el.style.top = g.y + 'px'; el.style.width = g.w + 'px'; el.style.height = g.h + 'px';
        return g;
      });
      Object.keys(byId).forEach(function (id) {
        if (!areas.some(function (g) { return g.id === id; })) warnings.push('config.areas names "' + id + '", which is not an area id on the page');
      });
      var tag = cfg.tagline || {};
      tagEls.forEach(function (el) {
        el.style.left = num(tag.x != null ? tag.x : el.dataset.otX, 0) + 'px'; el.style.top = num(tag.y != null ? tag.y : el.dataset.otY, 0) + 'px';
      });
      var bb = { x0: 1e9, y0: 1e9, x1: 0, y1: 0 };
      areas.forEach(function (g) {
        bb.x0 = Math.min(bb.x0, g.x); bb.y0 = Math.min(bb.y0, g.y); bb.x1 = Math.max(bb.x1, g.x + g.w); bb.y1 = Math.max(bb.y1, g.y + g.h);
      });
      tagEls.forEach(function (el) {
        var b = wbox(el, world);
        bb.x0 = Math.min(bb.x0, b.x); bb.y0 = Math.min(bb.y0, b.y); bb.x1 = Math.max(bb.x1, b.x + b.w); bb.y1 = Math.max(bb.y1, b.y + b.h);
      });
      var W = Math.max(FW, Math.ceil(bb.x1 + 160)), H = Math.max(FH, Math.ceil(bb.y1 + 160));
      world.style.width = W + 'px'; world.style.height = H + 'px';
      routeSvg.style.width = W + 'px'; routeSvg.style.height = H + 'px';
      var key = function (t, cx, cy, zoom, ease) { return { t: t, x: cx - W / 2, y: cy - H / 2, zoom: zoom, ease: ease || EASE }; };

      // 3. Components, each on its own paused timeline. Layout is final from here on.
      var comps = [];
      areas.forEach(function (g, ai) {
        all('[data-sfc]', g.el).forEach(function (el) {
          var id = el.dataset.sfc;
          if (id === 'carry' || id === 'camera-rig' || (el.parentElement && el.parentElement.closest('[data-sfc]'))) return;
          var tl = SFC.build(id, el, optsOf(el));
          comps.push({ el: el, id: id, area: ai, tl: tl, dur: tl.duration(), at: num(el.dataset.otAt, 0), holds: parseHolds(el.dataset.otHold) });
        });
      });
      var span = function (c) { return c.dur + c.holds.reduce(function (s, h) { return s + h[1]; }, 0); };

      // 4. The seams: a key shared by two neighbouring areas is a carry from the first to the second.
      var seams = [];
      for (var i = 0; i < areas.length - 1; i++) {
        var s = { i: i, name: areas[i].id + ' > ' + areas[i + 1].id, from: null, to: null, kind: 'cut' };
        var carryKeys = all('[data-carry]', areas[i + 1].el).map(function (e) { return e.getAttribute('data-carry'); });
        for (var k = 0; k < carryKeys.length && !s.from; k++) {
          var f = areas[i].el.querySelector('[data-carry="' + carryKeys[k] + '"]');
          if (f) { s.from = f; s.to = areas[i + 1].el.querySelector('[data-carry="' + carryKeys[k] + '"]'); s.kind = 'carry'; }
        }
        if (s.kind === 'cut' && areas[i + 1].seam !== 'reset') {
          warnings.push('seam ' + s.name + ' has no data-carry pair; add one, or mark the next area as a reset (data-ot-seam="reset")');
        }
        seams.push(s);
      }

      // 5. Times on the master (seconds). Every carry is 0.8 s; the rests are literal gaps.
      var T = { start: [0], dwellEnd: [], c: [], compEnd: [] };
      T.compEnd[0] = 0;
      T.dwellEnd[0] = areas[0].rest;
      seams.forEach(function (s, i) {
        var c = s.kind === 'carry' ? T.dwellEnd[i] + (useHand ? HAND_IN : 0) + PRESS : T.dwellEnd[i];
        T.c[i] = c;
        T.start[i + 1] = s.kind === 'carry' ? c + CARRY - 0.15 : c + CARRY;
        var end = T.start[i + 1];
        comps.filter(function (cp) { return cp.area === i + 1; }).forEach(function (cp) {
          end = Math.max(end, T.start[i + 1] + cp.at + span(cp));
        });
        T.compEnd[i + 1] = end;
        T.dwellEnd[i + 1] = end + areas[i + 1].rest;
      });
      var last = areas.length - 1;
      T.pull = T.dwellEnd[last];
      T.pullEnd = pullback ? T.pull + PULL : T.pull;
      T.endRest = pullback ? [T.pullEnd + 0.75, T.pullEnd + 0.75 + 2.6] : [T.pull, T.pull];
      T.total = pullback ? T.endRest[1] : T.pull;

      // 6. The camera. Holds are pairs of equal keys, so the float is exactly zero in them.
      var focusOf = function (g) {
        var f = g.focus && g.el.querySelector(g.focus);
        if (f) { var b = wbox(f, world); return { x: b.cx, y: b.cy }; }
        return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
      };
      var cam = [];
      areas.forEach(function (g, i) { cam[i] = focusOf(g); });
      var keys = [key(0, cam[0].x, cam[0].y, areas[0].zoom)];
      seams.forEach(function (s, i) {
        var c = T.c[i], a = areas[i], b = areas[i + 1];
        if (s.kind === 'carry') {
          // The camera rides the carry: same window, same ease, so the carried box glides across the frame
          // instead of being outrun by the camera and whipped back.
          keys.push(key(c, cam[i].x, cam[i].y, a.zoom));
          keys.push(key(c + CARRY, cam[i + 1].x, cam[i + 1].y, b.zoom, EASE));
        } else {
          keys.push(key(c, cam[i].x, cam[i].y, a.zoom));
          var cut = key(c + 0.7, cam[i + 1].x, cam[i + 1].y, b.zoom, 'expo.inOut');
          cut.cut = true; // a reset is a deliberate hard cut; the speed check skips it
          keys.push(cut);
        }
      });
      keys.push(key(T.pull, cam[last].x, cam[last].y, areas[last].zoom));
      var map = null;
      if (pullback) {
        var pad = 260, bw = bb.x1 - bb.x0 + 2 * pad, bh = bb.y1 - bb.y0 + 2 * pad;
        map = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2, zoom: Math.floor(Math.min(FW / bw, FH / bh) * 100) / 100 };
        keys.push(key(T.pullEnd, map.x, map.y, map.zoom, 'power2.inOut'));
        keys.push(key(T.total, map.x, map.y, map.zoom));
      }
      checkKeys(keys, maxStep).forEach(function (w) { warnings.push(w); });
      var shake = intensity >= 3 && seams.length && seams[0].kind === 'carry' ? [{ t: T.c[0] + CARRY, amp: 3 }] : [];
      var rigTl = SFC.build('camera-rig', rig, { keys: keys, hand: { amp: intensity >= 3 ? 4 : 3, period: 3.1 }, shakeOn: shake, lattice: true, seed: 3 });

      // 7. The carries, measured with every component at its final frame. Built last-first: a carry
      //    source that sits inside the previous carry's target is measured before that target moves.
      comps.forEach(function (c) { c.tl.progress(1); });
      seams.slice().reverse().forEach(function (s) {
        if (s.kind !== 'carry') return;
        s.tl = SFC.carry(s.from, s.to, { duration: CARRY, ease: EASE, content: s.to.getAttribute('data-carry-content') !== 'false' });
      });
      comps.forEach(function (c) { c.tl.progress(0); });

      // 8. The master.
      var tl = gsap.timeline({ paused: true });
      tl.add(rigTl.paused(false), 0);
      var rests = [[0, T.dwellEnd[0]]];
      var seg = function (sub, a, b, at) {
        if (b > a) tl.fromTo(sub, { time: a }, { time: b, duration: b - a, ease: 'none', immediateRender: false }, at);
      };
      var heroComps = comps.filter(function (c) { return c.area === 0; });
      comps.filter(function (c) { return c.area > 0; }).forEach(function (c) {
        var t = T.start[c.area] + c.at, from = 0;
        c.holds.forEach(function (h) {
          seg(c.tl, from, h[0], t);
          t += h[0] - from;
          rests.push([t, t + h[1]]);
          t += h[1];
          from = h[0];
        });
        seg(c.tl, from, c.dur, t);
      });
      for (var a = 1; a < areas.length; a++) rests.push([T.compEnd[a], T.dwellEnd[a]]);
      if (pullback) rests.push(T.endRest);

      // Seams: the hand presses the outgoing element, then it becomes the incoming one.
      seams.forEach(function (s, i) {
        if (s.kind !== 'carry') return;
        var c = T.c[i];
        tl.fromTo(s.from, { scale: 1 }, { scale: 0.95, duration: 0.1, ease: 'power2.out' }, c - 0.2);
        tl.to(s.from, { scale: 1, duration: 0.1, ease: 'power2.inOut' }, c - 0.1);
        tl.add(s.tl, c);
      });

      // The pull-back: the route draws on as the camera rises over the whole world, then the tagline lands.
      if (pullback) {
        route.setAttribute('d', smooth(cam.map(function (p) { return [Math.round(p.x), Math.round(p.y)]; })));
        tl.fromTo(route, { attr: { 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dashoffset': 0 }, duration: PULL - 0.3, ease: 'power2.inOut' }, T.pull + 0.2);
        var rand = SFC.rng(11);
        all('[data-ot-tagline] span', main).forEach(function (w, n) {
          var r = Math.round((rand() - 0.5) * 600) / 100; // two decimals, so GSAP writes the same string on every path
          tl.fromTo(w, { autoAlpha: 0, y: 90, scale: 0.94, rotation: r }, { autoAlpha: 1, y: 0, scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.7)' }, T.pullEnd - 0.35 + n * 0.12);
        });
      }

      // 9. The hand: a world-space path, drawn in screen space after the camera has moved.
      var hand = { x: 0, y: 0, s: 1, o: 0 };
      if (useHand) {
        seams.forEach(function (s, i) {
          if (s.kind !== 'carry') return;
          var c = T.c[i], bf = wbox(s.from, world), bt = wbox(s.to, world);
          var enter = { x: bf.cx + 110, y: bf.cy + 150 }, onIt = { x: bf.x + bf.w * 0.55, y: bf.y + bf.h * 0.6 };
          var land = { x: bt.x + bt.w * 0.86, y: bt.y + bt.h * 0.84 };
          tl.fromTo(hand, { o: 0, x: enter.x, y: enter.y }, { o: 1, x: onIt.x, y: onIt.y, duration: HAND_IN, ease: 'sine.inOut', immediateRender: false }, c - PRESS - HAND_IN);
          tl.fromTo(hand, { s: 1 }, { s: 0.85, duration: 0.08, ease: 'power2.out', immediateRender: false }, c - 0.2);
          tl.fromTo(hand, { s: 0.85 }, { s: 1, duration: 0.12, ease: 'power2.out', immediateRender: false }, c - 0.12);
          tl.fromTo(hand, { x: onIt.x, y: onIt.y }, { x: land.x, y: land.y, duration: CARRY, ease: EASE, immediateRender: false }, c);
          tl.fromTo(hand, { o: 1 }, { o: 0, duration: 0.25, ease: 'power1.in', immediateRender: false }, c + CARRY + 0.15);
        });
      }
      tl.to({}, { duration: 0.01 }, T.total - 0.01); // pins the length

      var drawHand = function () {
        var m = new DOMMatrix(world.style.transform || 'none');
        var p = m.transformPoint(new DOMPoint(hand.x, hand.y));
        var x = world.offsetLeft + p.x, y = world.offsetTop + p.y;
        cursor.style.transform = 'translate(' + (x - 3).toFixed(2) + 'px, ' + (y - 2).toFixed(2) + 'px) scale(' + hand.s.toFixed(3) + ')';
        cursor.style.opacity = String(Math.round(hand.o * 1000) / 1000);
        // Off frame is hidden, never left far off-screen.
        cursor.style.visibility = hand.o > 0 && x > -60 && y > -60 && x < FW + 60 && y < FH + 60 ? 'visible' : 'hidden';
      };

      var arriveAt = function (idx) { return idx === 0 ? 0 : T.c[idx - 1] + CARRY + 0.1; };
      var info = {
        mode: 'live', tl: tl, T: T, keys: keys, areas: areas, comps: comps, rests: rests, map: map, hand: hand, cursor: cursor,
        world: world, root: rootEl, px: px, warnings: warnings, maxStep: maxStep,
        seams: seams.map(function (s) {
          return { name: s.name, kind: s.kind, from: s.from, to: s.to, t0: T.c[s.i], t1: T.c[s.i] + CARRY };
        }),
      };

      // The page's own tweens, on the same scrubbed timeline. Keep them out of the rests.
      if (typeof cfg.extend === 'function') cfg.extend(info);

      tl.eventCallback('onUpdate', drawHand);
      tl.seek(0, false);
      drawHand();

      // 10. The driver.
      var fit = function () { rootEl.style.setProperty('--ot-scale', String(Math.min(window.innerWidth / FW, window.innerHeight / FH))); };
      fit();
      var wide = window.innerWidth >= NARROW;
      var resizeTimer = 0;
      window.addEventListener('resize', function () {
        fit();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { if ((window.innerWidth >= NARROW) !== wide && !q.has('t')) location.reload(); }, 250);
      });
      main.style.height = 'calc(' + Math.round(T.total * px) + 'px + 100vh)';
      var seekTo = Number(q.get('t'));
      var still = q.get('scroll') === 'off' || (q.has('t') && seekTo === seekTo);
      if (q.has('t') && seekTo === seekTo) tl.seek(seekTo, false); // ?t=12.3: a still for review
      else if (!still && window.ScrollTrigger) {
        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.create({ trigger: main, start: 'top top', end: 'bottom bottom', animation: tl, scrub: true });
      } else if (!still) warnings.push('vendor/ScrollTrigger.min.js is not loaded, so the scroll does not move the camera');

      // The first area plays once on the page clock; under a test hook it sits at its final frame.
      heroComps.forEach(function (c) {
        if (still) c.tl.progress(1);
        else gsap.delayedCall(0.2, function () { c.tl.play(0); });
      });

      // A link to an area (href="#id") scrolls the camera there; the browser's own jump would do nothing here.
      main.addEventListener('click', function (e) {
        var link = e.target.closest && e.target.closest('a[href^="#"]');
        if (!link) return;
        var idx = areas.findIndex(function (g) { return g.id === link.getAttribute('href').slice(1); });
        if (idx < 0) return;
        e.preventDefault();
        window.scrollTo({ top: Math.round(arriveAt(idx) * px), behavior: 'smooth' });
      });

      // Tabbing into another area moves the camera there. The browser would otherwise scroll the clipped frame itself.
      main.addEventListener('focusin', function (e) {
        [view, rootEl, rig].forEach(function (n) { n.scrollLeft = 0; n.scrollTop = 0; });
        var idx = areas.findIndex(function (g) { return g.el.contains(e.target); });
        if (idx < 0 || still) return;
        var t = tl.time();
        if (t < arriveAt(idx) - 0.05 || t > (idx === last ? T.total : T.dwellEnd[idx])) {
          window.scrollTo({ top: Math.round(arriveAt(idx) * px) });
        }
      });

      warnings.forEach(function (w) { console.warn('one-take: ' + w); });
      html.classList.add('ot-ready');
      resolveReady(info);
    }
  }

  oneTake.easePeak = easePeak;
  oneTake.checkKeys = checkKeys;
  SFC.oneTake = oneTake;
})();
