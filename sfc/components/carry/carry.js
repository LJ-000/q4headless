/* carry: "A becomes B". SFC.carry(fromEl, toEl, {duration=0.8, ease='expo.inOut', content=true})
 * returns a gsap timeline that moves one box from A's rect to B's layout rect, so the seam between two
 * beats is one object changing instead of a cut.
 *
 * How: GSAP Flip measures both elements once, at build time (Flip.fit with scale, so it also works inside
 * a CSS-scaled deck). B starts on A's rect, painted in A's color with A's corner radius, and A hands over
 * to it in the first tenth of the move. B then travels and grows back to its own layout box. B's children
 * stay hidden while the box is scaled and fade in late, so no text is ever seen stretched.
 * Everything is a tween on fixed values (transform, opacity, background, border-radius keyframes), so a
 * plain seek renders the right frame, forward or backward, with events on or off. No callbacks, no clock.
 *
 * Reduced motion: no travel. A fades out and B fades in where it already is.
 * Measure after fonts load (SFC.mount already waits) and with both elements laid out: a display:none
 * element has no box, and carry throws instead of guessing.
 *
 * The same file defines a small declarative component, data-sfc="carry": a root holding one
 * [data-carry-from] and one [data-carry-to]. It presses the from-element, holds, carries, then rests.
 * opts: at=0.6 (seconds before the carry starts), duration, ease, content, press=true. */
(function () {
  'use strict';
  var DURATION = 0.8;
  var EASE = 'expo.inOut';
  var HANDOVER = 0.1;   // share of the move in which A fades and B takes over its box
  var CONTENT_AT = 0.55; // B's children start to fade in here (share of the move)
  var CONTENT_DUR = 0.3;
  var CONTENT_STAGGER = 0.1; // total stagger across B's children, as a share of the move
  var COLOR_DUR = 0.55;  // B's background goes from A's color to its own over this share
  var RADIUS_STEPS = 10; // keyframes for the scale-corrected corner radius
  var REST = 0.6;        // component: still frames after the carry lands

  var num = function (v, d) { v = Number(v); return Number.isFinite(v) ? v : d; };
  var isEl = function (e) { return !!e && e.nodeType === 1; };
  var hasBox = function (e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var px3 = function (v) { return String(Math.round(v * 1000) / 1000); };

  // HyperFrames rule: never tween visibility on a .clip, so clips only get opacity.
  function fade(el, from, to) {
    var key = el.classList.contains('clip') ? 'opacity' : 'autoAlpha';
    var a = {}, b = {};
    a[key] = from;
    b[key] = to;
    return [a, b];
  }

  // One px value when all four corners match, else null (then the radius is left alone).
  function radius(el) {
    var cs = getComputedStyle(el);
    var c = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
    if (c.some(function (v) { return v !== c[0] || !/^[\d.]+px$/.test(v); })) return null;
    // CSS clamps a radius to half the shorter side (a 999px pill is really h/2), so use what is drawn.
    return Math.min(parseFloat(c[0]), el.offsetWidth / 2, el.offsetHeight / 2);
  }

  function opaqueBg(el) {
    var c = getComputedStyle(el).backgroundColor;
    var m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    var p = m[1].split(/[ ,/]+/).map(Number);
    return p.length > 3 && p[3] === 0 ? null : c;
  }

  function carry(fromEl, toEl, o) {
    if (!isEl(fromEl) || !isEl(toEl)) throw new TypeError('SFC.carry(fromEl, toEl): both arguments must be elements');
    if (!hasBox(fromEl) || !hasBox(toEl)) {
      throw new Error('SFC.carry: both elements need a layout box; one is display:none or has zero size');
    }
    if (!window.Flip) throw new Error('SFC.carry: load vendor/Flip.min.js before carry.js runs a carry');
    gsap.registerPlugin(window.Flip);
    o = o || {};
    var d = Math.max(0.05, num(o.duration, DURATION));
    var ease = o.ease || EASE;
    var tl = gsap.timeline();
    var out = fade(fromEl, 1, 0), inn = fade(toEl, 0, 1);

    // A's fade never renders at build: A may still be waiting for its own entrance earlier in the parent
    // timeline, and only B (hidden until the carry) needs its start state painted up front.
    if (SFC.reduced()) {
      tl.fromTo(fromEl, out[0], Object.assign(out[1], { duration: d * 0.6, ease: 'power1.inOut', immediateRender: false }), 0);
      tl.fromTo(toEl, inn[0], Object.assign(inn[1], { duration: d, ease: 'power1.inOut' }), 0);
      return tl;
    }

    // Measure before touching anything: B's own transform is where it must land.
    var end = {
      x: gsap.getProperty(toEl, 'x'), y: gsap.getProperty(toEl, 'y'),
      scaleX: gsap.getProperty(toEl, 'scaleX'), scaleY: gsap.getProperty(toEl, 'scaleY'),
      rotation: gsap.getProperty(toEl, 'rotation'),
    };
    var fit = window.Flip.fit(toEl, fromEl, { scale: true, getVars: true });
    var start = { x: fit.x, y: fit.y, scaleX: fit.scaleX, scaleY: fit.scaleY, rotation: fit.rotation || 0 };
    var rFrom = radius(fromEl), rTo = radius(toEl);
    var bgFrom = opaqueBg(fromEl), bgTo = opaqueBg(toEl);
    var kids = o.content === false ? [] : Array.prototype.slice.call(toEl.children);

    // Handover: B appears on A's box while A fades, so the viewer sees one box.
    tl.fromTo(fromEl, out[0], Object.assign(out[1], { duration: d * HANDOVER, ease: 'power1.out', immediateRender: false }), 0);
    tl.fromTo(toEl, inn[0], Object.assign(inn[1], { duration: d * HANDOVER, ease: 'power1.out' }), 0);

    // The move. Transforms only, so layout never reflows mid-carry.
    tl.fromTo(toEl, start, Object.assign({}, end, { duration: d, ease: ease }), 0);

    // Corner radius as seen on screen goes from A's to B's. B is scaled, so its CSS radius is divided by
    // its scale on each axis; sampled into keyframes on the move's own ease (eased progress e = k/N).
    if (rFrom != null && rTo != null) {
      var frames = [], kf = { easeEach: 'none' };
      for (var k = 0; k <= RADIUS_STEPS; k++) {
        var e = k / RADIUS_STEPS;
        var r = lerp(rFrom, rTo, e);
        var sx = lerp(start.scaleX, end.scaleX, e), sy = lerp(start.scaleY, end.scaleY, e);
        // Corner longhands with "horizontal vertical": GSAP rounds and mangles the "a / b" shorthand.
        // Plain numbers, never toFixed: GSAP misreads trailing zeros in a two-value string ("41.350px
        // 79.701px" blends to hundreds of px mid-step, "16.000px 16.000px" never blends at all).
        var v = px3(r / sx) + 'px ' + px3(r / sy) + 'px';
        frames.push({ borderTopLeftRadius: v, borderTopRightRadius: v, borderBottomRightRadius: v, borderBottomLeftRadius: v });
        kf[(100 * e) + '%'] = frames[k];
      }
      // Percent keyframes: the move's ease runs across the whole set, each step is linear.
      gsap.set(toEl, frames[0]);
      tl.to(toEl, { keyframes: kf, duration: d, ease: ease, immediateRender: false }, 0);
    }

    // Color: B starts in A's color, so the handover is invisible, and turns into its own.
    if (bgFrom && bgTo && bgFrom !== bgTo) {
      tl.fromTo(toEl, { backgroundColor: bgFrom }, { backgroundColor: bgTo, duration: d * COLOR_DUR, ease: 'power1.inOut' }, 0);
    }

    // B's content: hidden while the box is scaled, fades in once it is nearly home.
    if (kids.length) {
      tl.fromTo(kids, { opacity: 0 }, {
        opacity: 1, duration: d * CONTENT_DUR, ease: 'power2.out',
        stagger: kids.length > 1 ? { amount: d * CONTENT_STAGGER } : 0,
      }, d * CONTENT_AT);
    }
    // Pin the length to d exactly, whatever the stagger rounding.
    if (tl.duration() < d) tl.to({}, { duration: d - tl.duration() }, tl.duration());
    return tl;
  }

  SFC.carry = carry;

  SFC.define('carry', {
    duration: 2,
    build: function (root, tl, opts) {
      var from = root.querySelector('[data-carry-from]');
      var to = root.querySelector('[data-carry-to]');
      if (!from || !to) throw new Error('carry: the root needs one [data-carry-from] and one [data-carry-to] element');
      var at = Math.max(0, num(opts.at, 0.6));
      // The visible cause: the from-element is pressed just before it travels.
      if (opts.press !== false && !SFC.reduced() && at >= 0.24) {
        tl.fromTo(from, { scale: 1 }, { scale: 0.95, duration: 0.12, ease: 'power2.out' }, at - 0.24);
        tl.to(from, { scale: 1, duration: 0.12, ease: 'power2.inOut' }, at - 0.12);
      }
      tl.add(carry(from, to, { duration: opts.duration, ease: opts.ease, content: opts.content }), at);
      tl.to({}, { duration: REST }, '>');
      return tl;
    },
  });
})();
