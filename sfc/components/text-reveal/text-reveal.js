/* text-reveal: a headline or paragraph that reveals in reading order, by word, character or line.
 * Build replaces the root's content with two copies of the same plain text: an aria-hidden copy that
 * SplitText cuts into units, and a visually hidden copy for screen readers. The root also gets
 * aria-label = the original text. Every unit is one fromTo on the timeline, so a seek renders the
 * right frame and nothing runs a loop of its own.
 *   words (default): each word brightens from a dim ghost to full ink and settles a hair upward. The
 *     ghost shows the whole sentence from frame 0, so the eye knows where the light is going.
 *     Derived from Magic UI's Text Reveal (MIT, see THIRD-PARTY-LICENSE.md): per-word opacity
 *     driven by one progress value, re-expressed as a GSAP stagger.
 *   chars: letters fade up 0.4 em, 40 ms apart. Words stay whole across line breaks.
 *   lines: each line rises out of its own clipping mask, like type coming up from a baseline.
 * opts: mode='words'|'chars'|'lines', stagger=0.04 (seconds between units; lines default to 0.12),
 *       text (defaults to the root's text).
 * With data-sfc-scrub on the root, the runtime ties the same timeline to scroll (the Magic UI feel).
 * Not ambient: it plays once and never repeats. Print and reduced motion show the finished text. */
(function () {
  'use strict';
  var MODES = {
    words: { type: 'words', unit: 0.6, from: { opacity: 0.16, y: '0.12em' }, to: { opacity: 1, y: 0, ease: 'power2.out' } },
    chars: { type: 'words,chars', unit: 0.5, from: { opacity: 0, y: '0.4em' }, to: { opacity: 1, y: 0, ease: 'power3.out' } },
    lines: { type: 'lines', unit: 0.9, mask: 'lines', from: { opacity: 0, yPercent: 105 }, to: { opacity: 1, yPercent: 0, ease: 'expo.out' } },
  };
  var DEFAULT_STAGGER = { words: 0.04, chars: 0.04, lines: 0.12 };

  var num = function (v, d) { v = Number(v); return Number.isFinite(v) ? v : d; };

  function span(cls, text) {
    var e = document.createElement('span');
    e.className = cls;
    e.textContent = text;
    return e;
  }

  SFC.define('text-reveal', {
    duration: 1.2,
    build: function (root, tl, opts) {
      if (!window.SplitText) throw new Error('text-reveal needs vendor/SplitText.min.js loaded before it');
      gsap.registerPlugin(SplitText);
      var mode = MODES[opts.mode] ? opts.mode : 'words';
      var cfg = MODES[mode];
      var stagger = Math.max(0, num(opts.stagger, DEFAULT_STAGGER[mode]));
      var text = String(opts.text == null ? root.textContent : opts.text).replace(/\s+/g, ' ').trim();

      var visual = span('sfc-tr-text', text);
      visual.setAttribute('aria-hidden', 'true');
      root.textContent = '';
      root.append(visual, span('sfc-sr', text));
      root.setAttribute('aria-label', text);
      root.dataset.sfcMode = mode;

      var split = SplitText.create(visual, {
        type: cfg.type,
        tag: 'span',
        aria: 'none', // the visual copy is aria-hidden as a whole; the sr copy carries the text
        mask: cfg.mask,
        wordsClass: mode === 'words' ? 'sfc-tr-unit' : 'sfc-tr-word',
        charsClass: 'sfc-tr-unit',
        linesClass: 'sfc-tr-unit',
      });
      var units = mode === 'words' ? split.words : mode === 'chars' ? split.chars : split.lines;
      // A line below its mask is the effect, not a layout bug: tell HyperFrames check, on the masks only.
      (split.masks || []).forEach(function (m) { m.setAttribute('data-layout-allow-overflow', ''); });

      var to = Object.assign({ duration: cfg.unit, stagger: stagger }, cfg.to);
      if (units.length) tl.fromTo(units, cfg.from, to, 0);
      return tl;
    },
  });
})();
