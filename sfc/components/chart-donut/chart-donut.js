/* chart-donut: a ring of segments drawn by one clockwise sweep from 12 o'clock, a center total in
 * plain type, and a legend whose rows appear as the sweep reaches their segment.
 * Each segment is an SVG circle with pathLength=100: its dash is the part the sweep has covered and its
 * offset is where it starts, so one plain-object tween (state.at, 0..100) paints the whole ring.
 * The center is plain text showing the total from the first frame (it does not count).
 * opts: segments=[{label, value}], title='', centerLabel='Total', centerValue=sum, prefix='', suffix='',
 *       decimals=0, locale='en-US', duration=1.8 (seconds the sweep takes).
 * Not ambient: it plays once and never repeats. Print and reduced motion show the full ring. */
(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var GAP = 0.8; // ring units (of 100) left open after each segment when there are two or more
  var COLORS = ['var(--sfc-accent)', 'var(--sfc-accent-2)', 'var(--sfc-ink-muted)', 'var(--sfc-good)', 'var(--sfc-warn)'];
  var SWEEP_AT = 0.2;

  var num = function (v, d) { v = Number(v); return Number.isFinite(v) ? v : d; };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var str = function (v) { return v == null ? '' : String(v); };

  function formatter(opts) {
    var d = Math.max(0, Math.min(20, Math.round(num(opts.decimals, 0))));
    var o = { minimumFractionDigits: d, maximumFractionDigits: d };
    var f;
    try { f = new Intl.NumberFormat(opts.locale || 'en-US', o); } catch (e) { f = new Intl.NumberFormat('en-US', o); }
    return function (v) { return str(opts.prefix) + f.format(v) + str(opts.suffix); };
  }
  function el(tag, cls, text, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function circle(cls, parent) {
    var c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', '100');
    c.setAttribute('cy', '100');
    c.setAttribute('r', '80');
    c.setAttribute('pathLength', '100');
    c.setAttribute('transform', 'rotate(-90 100 100)');
    c.setAttribute('class', cls);
    parent.appendChild(c);
    return c;
  }

  SFC.define('chart-donut', {
    duration: 2.6,
    build: function (root, tl, opts) {
      var list = (Array.isArray(opts.segments) ? opts.segments : []).filter(function (s) {
        return s && typeof s === 'object' && num(s.value, 0) > 0;
      });
      var sum = list.reduce(function (a, s) { return a + num(s.value, 0); }, 0);
      var total = num(opts.centerValue, sum);
      var title = str(opts.title);
      var centerLabel = opts.centerLabel == null ? 'Total' : str(opts.centerLabel);
      var fmt = formatter(opts);
      var fmtPlain = formatter({ decimals: opts.decimals, locale: opts.locale });
      var sweep = Math.max(0.2, num(opts.duration, 1.8));
      var gap = list.length > 1 ? GAP : 0;

      var start = 0;
      var parts = list.map(function (s, i) {
        var share = (num(s.value, 0) / sum) * 100;
        var p = { label: str(s.label), value: num(s.value, 0), share: share, start: start, len: Math.max(0, share - gap), color: COLORS[i % COLORS.length] };
        start += share;
        return p;
      });

      root.textContent = '';
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', (title ? title + ': ' : '') + (fmt(total) + ' ' + centerLabel).trim() + '.' +
        (parts.length ? ' ' : '') + parts.map(function (p) {
          return (p.label + ' ' + fmtPlain(p.value) + ' (' + Math.round(p.share) + '%)').trim();
        }).join(', '));
      root.__sfcDonut = { gap: gap };

      if (title) el('div', 'sfc-title', title, root);
      var body = el('div', 'sfc-body', null, root);
      var ring = el('div', 'sfc-ring', null, body);
      var s = document.createElementNS(SVGNS, 'svg');
      s.setAttribute('viewBox', '0 0 200 200');
      s.setAttribute('aria-hidden', 'true');
      s.setAttribute('focusable', 'false');
      ring.appendChild(s);
      var track = circle('sfc-track', s);
      var arcs = parts.map(function (p) {
        var c = circle('sfc-seg', s);
        c.style.stroke = p.color;
        c.style.strokeDashoffset = String(-p.start);
        return c;
      });

      // The center: the total as plain text, visible from the first frame.
      var center = el('div', 'sfc-center', null, ring);
      el('b', 'sfc-num', fmt(total), center);
      el('span', 'sfc-label', centerLabel, center);

      var legend = el('ul', 'sfc-legend', null, body);
      legend.setAttribute('aria-hidden', 'true');
      var rows = parts.map(function (p) {
        var li = el('li', null, null, legend);
        var sw = el('span', 'sfc-swatch', null, li);
        sw.style.background = p.color;
        el('span', 'sfc-name', p.label, li);
        el('span', 'sfc-pct', Math.round(p.share) + '%', li);
        return li;
      });

      var state = { at: 0 };
      var paint = function () {
        var at = clamp(state.at, 0, 100);
        parts.forEach(function (p, i) {
          var vis = at >= 100 ? p.len : clamp(at - p.start, 0, p.len);
          arcs[i].style.strokeDasharray = vis + ' 100';
          var k = at >= 100 ? 1 : clamp((at - p.start) / 8, 0, 1);
          rows[i].style.opacity = String(k);
          rows[i].style.transform = 'translateY(' + Math.round((1 - k) * 600) / 100 + 'px)';
        });
      };
      paint(); // frame 0, before any seek

      tl.fromTo(track, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power1.out' }, 0);
      tl.to(state, { at: 100, duration: sweep, ease: 'power3.inOut', onUpdate: paint }, SWEEP_AT);
      tl.to({}, { duration: 0.6 }); // rest on the full ring
      return tl;
    },
  });
})();
