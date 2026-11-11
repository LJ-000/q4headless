/* border-beam: a short streak of light that travels around a card's border.
 * Technique adapted from Magic UI's BorderBeam (MIT, see THIRD-PARTY-LICENSE.md): a layer the size of
 * the card is masked down to its border ring (two mask layers, the padding box excluded from the border box),
 * and inside it a square with a linear-gradient tail rides offset-path: rect(). Here the position is
 * written from the timeline's time instead of a CSS or Motion loop, so any seek draws the right frame.
 * opts: duration=6 (seconds per lap), beams=1|2 (the second runs half a lap behind in the second
 *       accent), offset=0.15 (where the lap starts, 0-1), reverse=false, size=200 (streak length, px),
 *       loop=true (repeat forever in web and deck; hf, print and reduced motion never repeat).
 * Ambient: every lap closes on its first frame. Print and reduced motion park the streak at `offset`. */
(function () {
  'use strict';
  var DURATION = 6;

  var num = function (v, d) { v = Number(v); return Number.isFinite(v) ? v : d; };
  var lap = function (opts) { return Math.max(0.5, num(opts.duration, DURATION)); };
  var round = function (v) { return Math.round(v * 1e4) / 1e4; };

  function paint(root, t, opts) {
    var streaks = root.querySelectorAll(':scope > .sfc-beam > .sfc-beam-streak');
    var p = t / lap(opts);
    var start = num(opts.offset, 0.15);
    var dir = opts.reverse ? -1 : 1;
    for (var i = 0; i < streaks.length; i++) {
      var d = start + dir * (p + i / streaks.length);
      d -= Math.floor(d); // 0 <= d < 1, so the end of a lap is exactly its start
      streaks[i].style.offsetDistance = round(d * 100) + '%';
    }
  }

  SFC.define('border-beam', {
    duration: DURATION,
    build: function (root, tl, opts) {
      var beams = Math.round(num(opts.beams, 1)) === 2 ? 2 : 1;
      var layer = root.querySelector(':scope > .sfc-beam');
      if (!layer) {
        layer = document.createElement('span');
        layer.className = 'sfc-beam';
        layer.setAttribute('aria-hidden', 'true');
        root.insertBefore(layer, root.firstChild);
      }
      layer.textContent = '';
      for (var i = 0; i < beams; i++) {
        var s = document.createElement('span');
        s.className = 'sfc-beam-streak' + (i ? ' sfc-beam-streak-2' : '');
        // The streak's box is centred on the border path, so at a corner it pokes past the ring; the
        // ring's mask clips it. This tells the HyperFrames layout audit the overflow is intended.
        s.setAttribute('data-layout-allow-overflow', '');
        layer.appendChild(s);
      }
      if (opts.size != null) root.style.setProperty('--sfc-beam-size', Math.max(16, num(opts.size, 200)) + 'px');
      paint(root, 0, opts);
      // The tween only gives the timeline its length; render() draws from the timeline's time.
      tl.to({ t: 0 }, { t: 1, duration: lap(opts), ease: 'none' }, 0);
      var m = SFC.medium();
      if (opts.loop !== false && (m === 'web' || m === 'deck') && !SFC.reduced() && !('sfcScrub' in root.dataset)) tl.repeat(-1);
      return tl;
    },
    render: function (t, root, opts) { paint(root, t, opts); },
  });
})();
