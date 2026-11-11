/* bento-grid: a CSS grid of tiles that unfolds as one wave.
 * The author writes the tiles as direct children; data-sfc-span / data-sfc-rows set column and row spans.
 * Build measures each tile's centre once (fonts are ready by then) and orders the wave by distance from
 * an origin: the grid centre by default, or the first or last tile. Each tile rises and settles with
 * expo.out, then its own children follow a beat later, so the frame lands before the words do.
 * opts: cols=4, from='center'|'start'|'end', stagger=0.08 (seconds per tile-width of distance),
 *       pan={x, y} (px the whole grid glides over the timeline, for a video camera move; off by default).
 * Not ambient: it plays once and never repeats. Print and reduced motion show every tile in place. */
(function () {
  'use strict';
  var TILE = 0.7;        // seconds a tile takes to rise and settle
  var CONTENT_AT = 0.14; // its content starts this long after the tile
  var CONTENT = 0.55;
  var CONTENT_STEP = 0.06;

  var num = function (v, d) { v = Number(v); return Number.isFinite(v) ? v : d; };

  // Wave order: each tile's distance from the origin, in units of one average tile width, so the
  // same stagger reads the same on a 3-column and a 6-column grid.
  function delays(root, tiles, from, stagger) {
    var box = root.getBoundingClientRect();
    var centres = tiles.map(function (t) {
      var r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, w: r.width };
    });
    var unit = centres.reduce(function (s, c) { return s + c.w; }, 0) / centres.length || 1;
    var o;
    if (from === 'start') o = centres[0];
    else if (from === 'end') o = centres[centres.length - 1];
    else o = { x: box.width / 2, y: box.height / 2 };
    var d = centres.map(function (c) { return Math.hypot(c.x - o.x, c.y - o.y) / unit; });
    var min = Math.min.apply(null, d);
    return d.map(function (v) { return (v - min) * stagger; });
  }

  SFC.define('bento-grid', {
    duration: 1.4,
    build: function (root, tl, opts) {
      var cols = Math.max(1, Math.min(12, Math.round(num(opts.cols, 4))));
      var stagger = Math.max(0, num(opts.stagger, 0.08));
      var from = opts.from === 'start' || opts.from === 'end' ? opts.from : 'center';
      root.style.setProperty('--sfc-bento-cols', String(cols));

      var tiles = Array.prototype.filter.call(root.children, function (c) { return c.nodeType === 1; });
      if (!tiles.length) return tl.to({}, { duration: 0.01 });
      var at = delays(root, tiles, from, stagger);
      var end = 0;
      tiles.forEach(function (tile, i) {
        tl.fromTo(tile, { opacity: 0, y: 28, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: TILE, ease: 'expo.out' }, at[i]);
        var kids = Array.prototype.slice.call(tile.children);
        if (kids.length) {
          tl.fromTo(kids, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: CONTENT, ease: 'power3.out', stagger: CONTENT_STEP }, at[i] + CONTENT_AT);
        }
        end = Math.max(end, at[i] + TILE, at[i] + CONTENT_AT + CONTENT + CONTENT_STEP * Math.max(0, kids.length - 1));
      });

      // Pan: one slow glide of the whole grid over the length of the reveal, for a hero or a video
      // scene. The author clips it with an overflow:hidden frame around the grid.
      var pan = opts.pan && typeof opts.pan === 'object' ? opts.pan : null;
      if (pan) {
        tl.fromTo(root, { x: 0, y: 0 }, { x: num(pan.x, 0), y: num(pan.y, 0), duration: Math.max(end, num(pan.duration, end)), ease: 'sine.inOut' }, 0);
      }
      return tl;
    },
  });
})();
