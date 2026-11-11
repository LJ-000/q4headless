/* chart-area: a line chart whose line draws left to right while the area under it fills in behind
 * the head. A dot rides the head with a value chip, each point pops as the head reaches it, and each
 * x label fades in as the head gets close. One plain-object tween (state.p, the head's x progress)
 * drives everything through paint(), so any seek gives the same frame and there is no rAF loop.
 * The curve is a monotone cubic through the points, so it never swings above or below the data.
 * opts: series=number[], labels=string[], title='', prefix='', suffix='', decimals=0, locale='en-US',
 *       duration=2.2 (seconds the line takes to draw).
 * Not ambient: it plays once and never repeats. Print and reduced motion show the drawn chart. */
(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var VW = 600, VH = 260;
  var PAD = { t: 48, r: 12, b: 10, l: 12 };
  var SAMPLES = 240;
  var POINT_R = 4;
  var uid = 0;
  var popEase = gsapEase('back.out(2.2)');

  function gsapEase(name) {
    return function (k) { return window.gsap ? gsap.parseEase(name)(k) : k; };
  }
  var num = function (v, d) { v = Number(v); return Number.isFinite(v) ? v : d; };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var r2 = function (v) { return Math.round(v * 100) / 100; };

  function formatter(opts) {
    var d = Math.max(0, Math.min(20, Math.round(num(opts.decimals, 0))));
    var o = { minimumFractionDigits: d, maximumFractionDigits: d };
    var f;
    try { f = new Intl.NumberFormat(opts.locale || 'en-US', o); } catch (e) { f = new Intl.NumberFormat('en-US', o); }
    var pre = opts.prefix == null ? '' : String(opts.prefix);
    var suf = opts.suffix == null ? '' : String(opts.suffix);
    return function (v) { return pre + f.format(v) + suf; };
  }

  function svg(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function html(tag, cls, text, parent) {
    var e = document.createElement(tag);
    e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  // Fritsch-Carlson tangents: a cubic Hermite curve with these slopes stays inside each pair's range.
  function monotonePath(pts) {
    var n = pts.length;
    var h = pts[1].x - pts[0].x;
    var d = [], m = [], i;
    for (i = 0; i < n - 1; i++) d.push((pts[i + 1].y - pts[i].y) / h);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { var t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    var out = 'M' + r2(pts[0].x) + ' ' + r2(pts[0].y);
    for (i = 0; i < n - 1; i++) {
      out += ' C' + r2(pts[i].x + h / 3) + ' ' + r2(pts[i].y + m[i] * h / 3) + ' ' +
        r2(pts[i + 1].x - h / 3) + ' ' + r2(pts[i + 1].y - m[i + 1] * h / 3) + ' ' +
        r2(pts[i + 1].x) + ' ' + r2(pts[i + 1].y);
    }
    return out;
  }

  // Arc length against x, sampled once. The curve's x only grows along its length, so this inverts.
  function sampler(path) {
    var total = path.getTotalLength();
    var xs = [], ys = [], ls = [];
    for (var k = 0; k <= SAMPLES; k++) {
      var l = (k / SAMPLES) * total;
      var p = path.getPointAtLength(l);
      xs.push(p.x); ys.push(p.y); ls.push(l);
    }
    return function (x) {
      if (!(total > 0)) return { len: 0, y: ys[0], total: 0 };
      var lo = 0, hi = SAMPLES;
      if (x <= xs[0]) return { len: 0, y: ys[0], total: total };
      if (x >= xs[hi]) return { len: total, y: ys[hi], total: total };
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
      var f = (x - xs[lo]) / ((xs[hi] - xs[lo]) || 1);
      return { len: ls[lo] + (ls[hi] - ls[lo]) * f, y: ys[lo] + (ys[hi] - ys[lo]) * f, total: total };
    };
  }

  SFC.define('chart-area', {
    duration: 3.05,
    build: function (root, tl, opts) {
      var series = (Array.isArray(opts.series) ? opts.series : []).map(function (v) { return num(v, 0); });
      if (!series.length) series = [0];
      var labels = Array.isArray(opts.labels) ? opts.labels : [];
      var title = opts.title == null ? '' : String(opts.title);
      var fmt = formatter(opts);
      var drawDur = Math.max(0.2, num(opts.duration, 2.2));
      var id = 'sfc-ca-' + (++uid);

      // A single value draws as a flat line across the plot, labelled at its right end.
      var values = series.length === 1 ? [series[0], series[0]] : series.slice();
      var n = values.length;
      var lo = Math.min(0, Math.min.apply(null, values));
      var hi = Math.max.apply(null, values);
      hi = hi > lo ? lo + (hi - lo) * 1.08 : lo + 1;
      var x0 = PAD.l, x1 = VW - PAD.r, yTop = PAD.t, yBase = VH - PAD.b;
      var step = (x1 - x0) / (n - 1);
      var points = values.map(function (v, i) {
        return { x: x0 + i * step, y: yBase - ((v - lo) / (hi - lo)) * (yBase - yTop), v: v };
      });
      var shown = series.length === 1 ? [points[1]] : points; // the points that carry a label and a marker
      var labelOf = function (i) { return labels[i] == null ? '' : String(labels[i]); };

      root.textContent = '';
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', (title ? title + ': ' : '') + series.map(function (v, i) {
        return (labelOf(i) + ' ' + fmt(v)).trim();
      }).join(', '));
      root.__sfcChart = { points: points };

      if (title) html('div', 'sfc-title', title, root);
      var plot = html('div', 'sfc-plot', null, root);
      var s = svg('svg', { viewBox: '0 0 ' + VW + ' ' + VH, 'aria-hidden': 'true', focusable: 'false' }, plot);
      var defs = svg('defs', {}, s);
      var grad = svg('linearGradient', { id: id + '-fill', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
      svg('stop', { offset: '0', class: 'sfc-stop-top' }, grad);
      svg('stop', { offset: '1', class: 'sfc-stop-bottom' }, grad);
      var clip = svg('clipPath', { id: id + '-clip' }, defs);
      var clipRect = svg('rect', { x: '0', y: '0', width: String(x0), height: String(VH) }, clip);

      var grid = svg('g', { class: 'sfc-grid' }, s);
      for (var g = 0; g < 4; g++) {
        var gy = r2(yTop + (g / 3) * (yBase - yTop));
        svg('line', { x1: String(x0), x2: String(x1), y1: String(gy), y2: String(gy), class: g === 3 ? 'sfc-base' : '' }, grid);
      }

      var d = monotonePath(points);
      svg('path', {
        d: d + ' L' + r2(x1) + ' ' + yBase + ' L' + r2(x0) + ' ' + yBase + ' Z',
        class: 'sfc-area', fill: 'url(#' + id + '-fill)', 'clip-path': 'url(#' + id + '-clip)',
      }, s);
      var line = svg('path', { d: d, class: 'sfc-line', pathLength: '1' }, s);
      var marks = shown.map(function (p) { return svg('circle', { cx: r2(p.x), cy: r2(p.y), r: '0', class: 'sfc-point' }, s); });
      var headDot = svg('circle', { cx: String(x0), cy: r2(points[0].y), r: '6', class: 'sfc-head' }, s);

      var chip = html('span', 'sfc-head-label', fmt(values[0]), plot);
      chip.setAttribute('aria-hidden', 'true');
      var row = html('div', 'sfc-labels', null, root);
      row.setAttribute('aria-hidden', 'true');
      var labelEls = shown.map(function (p, i) {
        var l = html('span', 'sfc-label', labelOf(series.length === 1 ? 0 : i), row);
        var f = (p.x - x0) / (x1 - x0);
        l.style.left = r2((p.x / VW) * 100) + '%';
        l.style.transform = 'translateX(' + r2(-f * 100) + '%)';
        return l;
      });

      var at = sampler(line);
      var state = { p: 0 };
      var paint = function () {
        var p = clamp(state.p, 0, 1);
        var x = x0 + p * (x1 - x0);
        var hit = at(x);
        line.style.strokeDashoffset = p >= 1 ? '0' : String(1 - hit.len / (hit.total || 1));
        clipRect.setAttribute('width', String(x));
        headDot.setAttribute('cx', String(x));
        headDot.setAttribute('cy', String(hit.y));
        var seg = Math.min(n - 2, Math.floor((x - x0) / step));
        var t = (x - x0 - seg * step) / step;
        chip.textContent = fmt(p >= 1 ? values[n - 1] : values[seg] + (values[seg + 1] - values[seg]) * t);
        chip.style.left = r2((x / VW) * 100) + '%';
        chip.style.top = r2((hit.y / VH) * 100) + '%';
        chip.style.transform = 'translate(' + r2(-p * 100) + '%, calc(-100% - 14px))';
        shown.forEach(function (pt, i) {
          // Each point pops over the last third of a step before the head reaches it.
          var k = p >= 1 ? 1 : clamp((x - pt.x) / (step * 0.35) + 1, 0, 1);
          marks[i].setAttribute('r', String(k >= 1 ? POINT_R : k <= 0 ? 0 : r2(POINT_R * popEase(k))));
          labelEls[i].style.opacity = String(p >= 1 ? 1 : clamp((x - (pt.x - step * 0.6)) / (step * 0.4), 0, 1));
        });
      };
      paint(); // frame 0, before any seek

      tl.fromTo(grid, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.out' }, 0);
      tl.fromTo(chip, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out' }, 0.25);
      tl.fromTo(headDot, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' }, 0.25);
      tl.to(state, { p: 1, duration: drawDur, ease: 'power2.inOut', onUpdate: paint }, 0.25);
      tl.to({}, { duration: 0.6 }); // rest on the drawn chart
      return tl;
    },
  });
})();
