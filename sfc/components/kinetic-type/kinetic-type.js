/* kinetic-type: one line of display type with one of four entrances.
 *   blur-in: words come into focus one after another: blur 12px -> 0, opacity 0 -> 1, a 0.4 em rise.
 *     Each word lands with expo.out over 0.7 s, so most of the move happens in the first ~0.2 s.
 *     At the end filter is set to none, so the type is not left on a blurred compositing layer.
 *   word-swap: a sentence with a slot ("Answers in {word}"). Words roll up through the slot, the old
 *     one leaving up with a little blur while the new one rises in, and the slot's width eases to the
 *     new word in the same move. It holds on each word and ends on the last one.
 *   scramble: letters appear left to right as glyphs, flicker, and resolve into the text. Every glyph
 *     is looked up from a table built once from SFC.rng(seed), indexed by letter and by tick, so the
 *     frame at any time is a pure function of that time. Letter boxes keep their final width, so
 *     the line never jumps while it decodes.
 *   tracking-collapse: the whole line starts at 0.6 em letter-spacing and closes to 0, fading in.
 *     A matching negative margin-right cancels the trailing space, so centered type stays centered.
 * Build replaces the root's content with an aria-hidden visual copy plus a visually hidden copy of
 * the final sentence, and sets aria-label on the root to that sentence.
 * opts: effect='blur-in', text (defaults to the root's text), words (word-swap), seed=1 (scramble),
 *       hold=1.1 (word-swap seconds on each word).
 * Ideas from Motion Video Director's kinetic type notes (idea only, no code). No own rAF loop,
 * no Math.random, no clock reads. Not ambient: plays once. Print and reduced motion show the end. */
(function () {
  'use strict';
  var EFFECTS = ['blur-in', 'word-swap', 'scramble', 'tracking-collapse'];
  // Scramble glyphs come from the same family as the letter they stand in for, so a lowercase word
  // decodes through lowercase shapes instead of a wall of capitals.
  var POOLS = {
    upper: 'ABCDEFGHJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijkmnopqrstuvwxyz',
    digit: '0123456789',
    other: '#%&*+=<>/?!:;',
  };
  var NARROW = 'il1I|!:;.,'; // fallback for letters too thin for anything in their pool
  var TICK = 14;  // glyph changes per second while scrambling: lively, not strobing
  var SWAP = 0.7; // seconds one word-swap takes

  var num = function (v, d) { v = Number(v); return Number.isFinite(v) ? v : d; };
  var clean = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };

  function span(cls, text) {
    var e = document.createElement('span');
    e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function blurIn(visual, tl, text) {
    visual.textContent = text;
    if (!window.SplitText) throw new Error('kinetic-type blur-in needs vendor/SplitText.min.js loaded before it');
    gsap.registerPlugin(SplitText);
    var words = SplitText.create(visual, { type: 'words', tag: 'span', aria: 'none', wordsClass: 'sfc-kt-word' }).words;
    if (!words.length) return;
    tl.fromTo(words, { filter: 'blur(12px)', opacity: 0, y: '0.4em' },
      { filter: 'blur(0px)', opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.08 }, 0);
    tl.set(words, { filter: 'none' });
  }

  function wordSwap(visual, tl, skeleton, words, hold) {
    var parts = skeleton.indexOf('{word}') >= 0 ? skeleton.split('{word}') : [skeleton ? skeleton + ' ' : '', ''];
    var slot = span('sfc-kt-slot');
    slot.setAttribute('data-layout-allow-overflow', ''); // the roll through the clipped slot is the effect
    var els = words.map(function (w) { return slot.appendChild(span('sfc-kt-slot-word', w)); });
    visual.append(parts[0], slot, parts.slice(1).join(''));

    // Measured in em, so the slot keeps fitting if the root's font-size changes with the viewport.
    var fs = parseFloat(getComputedStyle(slot).fontSize) || 16;
    var widths = els.map(function (e) { return e.getBoundingClientRect().width / fs; });
    var sized = widths.every(function (w) { return w > 0; });
    // The width lives in a unitless custom property (CSS turns it into em). Tweening width in em
    // directly made GSAP convert units mid-tween and overshoot by about 10x.
    var em = function (i) { return Number(widths[i].toFixed(4)); };
    if (sized) { slot.style.setProperty('--sfc-kt-w', em(0)); slot.classList.add('is-sized'); }
    els.forEach(function (e, i) { if (i) gsap.set(e, { yPercent: 100, opacity: 0 }); });

    var t = 0;
    for (var i = 1; i < els.length; i++) {
      t += hold;
      var move = { duration: SWAP, ease: 'expo.inOut', immediateRender: false };
      tl.fromTo(els[i - 1], { yPercent: 0, opacity: 1, filter: 'blur(0px)' }, Object.assign({ yPercent: -100, opacity: 0, filter: 'blur(6px)' }, move), t);
      tl.fromTo(els[i], { yPercent: 100, opacity: 0, filter: 'blur(6px)' }, Object.assign({ yPercent: 0, opacity: 1, filter: 'blur(0px)' }, move), t);
      if (sized) tl.fromTo(slot, { '--sfc-kt-w': em(i - 1) }, Object.assign({ '--sfc-kt-w': em(i) }, move), t);
      t += SWAP;
      tl.addLabel('word' + i, t);
    }
    tl.set(els[els.length - 1], { filter: 'none' }, t);
    return parts[0] + words[words.length - 1] + parts.slice(1).join('');
  }

  function scramble(visual, tl, text, seed) {
    var chars = [];
    text.split(' ').forEach(function (word, w) {
      if (w) chars.push(visual.appendChild(span('sfc-kt-char sfc-kt-space', ' ')));
      var wrap = visual.appendChild(span('sfc-kt-wordwrap'));
      Array.from(word).forEach(function (ch) { chars.push(wrap.appendChild(span('sfc-kt-char', ch))); });
    });
    var n = chars.length;
    var finals = chars.map(function (c) { return c.textContent; });

    // Lock each letter box to the width of its final glyph, in em, so decoding never moves the line.
    var fs = parseFloat(getComputedStyle(visual).fontSize) || 16;
    var boxes = chars.map(function (c) {
      if (c.classList.contains('sfc-kt-space')) return 0;
      var w = c.getBoundingClientRect().width;
      if (w > 0) c.style.width = (w / fs).toFixed(4) + 'em';
      return w;
    });

    // Every glyph's own width, measured once in the same font, so a stand-in never spills over its
    // neighbours: an "i" flickers through thin shapes, an "m" through wide ones.
    var probe = visual.appendChild(span('sfc-kt-char'));
    var widthOf = {};
    Object.keys(POOLS).map(function (k) { return POOLS[k]; }).concat(NARROW).join('').split('').forEach(function (g) {
      if (widthOf[g] != null) return;
      probe.textContent = g;
      widthOf[g] = probe.getBoundingClientRect().width;
    });
    probe.remove();
    var candidates = function (ch, box) {
      var pool = /[A-Z]/.test(ch) ? POOLS.upper : /[a-z]/.test(ch) ? POOLS.lower : /[0-9]/.test(ch) ? POOLS.digit : POOLS.other;
      if (!(box > 0)) return pool.split('');
      var fit = pool.split('').filter(function (g) { return widthOf[g] <= box * 1.08; });
      if (fit.length >= 3) return fit;
      return (pool + NARROW).split('').sort(function (a, b) { return widthOf[a] - widthOf[b]; }).slice(0, 3);
    };

    var duration = Math.min(2.4, Math.max(1.2, 1.2 + n * 0.02));
    var steps = Math.ceil(duration * TICK) + 1;
    var rand = SFC.rng(seed);
    var span01 = function (i) { return n > 1 ? i / (n - 1) : 0; };
    var plan = chars.map(function (c, i) {
      // The random draws do not depend on the font, so a seed always walks the same sequence.
      var cand = candidates(finals[i], boxes[i]);
      var table = [];
      for (var s = 0; s < steps; s++) table.push(cand[Math.floor(rand() * cand.length)]);
      var jitter = rand();
      return {
        appear: 0.02 + 0.23 * span01(i),                                // a typing-on wave; frame 0 is empty
        resolve: Math.min(1, 0.3 + 0.6 * span01(i) + 0.1 * jitter),     // then a decode wave, a little uneven
        table: table,
      };
    });

    var state = { p: 0 };
    var draw = function () {
      var p = state.p;
      var step = Math.min(steps - 1, Math.floor(p * duration * TICK));
      for (var i = 0; i < n; i++) {
        var c = chars[i];
        if (finals[i] === ' ') continue;
        var done = p >= plan[i].resolve;
        c.textContent = done ? finals[i] : plan[i].table[step];
        c.style.opacity = p >= plan[i].appear || done ? '1' : '0';
        c.classList.toggle('is-glyph', !done);
      }
    };
    draw(); // frame 0, painted before any seek
    tl.fromTo(state, { p: 0 }, { p: 1, duration: duration, ease: 'none', onUpdate: draw }, 0);
  }

  function trackingCollapse(visual, tl, text) {
    var line = visual.appendChild(span('sfc-kt-line', text));
    // At 0.6 em the line is wider than at rest and may spill past its column for a moment: the effect.
    line.setAttribute('data-layout-allow-overflow', '');
    tl.fromTo(line, { letterSpacing: '0.6em', marginRight: '-0.6em' }, { letterSpacing: '0em', marginRight: '0em', duration: 1.4, ease: 'expo.out' }, 0);
    tl.fromTo(line, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out' }, 0);
  }

  SFC.define('kinetic-type', {
    duration: 1.6,
    build: function (root, tl, opts) {
      var effect = EFFECTS.indexOf(opts.effect) >= 0 ? opts.effect : 'blur-in';
      var text = clean(opts.text == null ? root.textContent : opts.text);
      var words = (Array.isArray(opts.words) ? opts.words : []).map(clean).filter(Boolean);
      if (effect === 'word-swap' && !words.length) effect = 'blur-in';

      var visual = span('sfc-kt-text');
      visual.setAttribute('aria-hidden', 'true');
      var sr = span('sfc-sr');
      root.textContent = '';
      root.append(visual, sr);
      root.dataset.sfcEffect = effect;

      var final = text;
      if (effect === 'blur-in') blurIn(visual, tl, text);
      else if (effect === 'word-swap') final = wordSwap(visual, tl, text, words, Math.max(0, num(opts.hold, 1.1)));
      else if (effect === 'scramble') scramble(visual, tl, text, num(opts.seed, 1));
      else trackingCollapse(visual, tl, text);

      final = clean(final);
      sr.textContent = final;
      root.setAttribute('aria-label', final);
      return tl;
    },
  });
})();
