/* arch-flow: an architecture diagram that builds itself, then shows data moving through it.
 * 1. Build: source nodes pop in; every other node grows out of the node that feeds it, travelling
 *    from its parent to its own spot while the connector draws alongside it.
 * 2. Flow: short pulses run along the connectors in two waves. A pulse leaving a node starts the
 *    moment the pulse into that node arrives, and each arrival lights the node's ring.
 * 3. Meter (optional): a plain-type figure with meter.to fades in just before the pulses run.
 * Layout is computed once from the graph, never from the clock: layers left to right (a source sits
 * one layer before the first node it feeds), nodes spread evenly down each layer, connectors are
 * cubic curves between the facing sides. Nodes are HTML on solid fills; connectors are one SVG.
 * Dash offsets are tweened as SVG attributes: GSAP's CSS tween of stroke-dashoffset on a path with
 * pathLength does not interpolate (it holds the start value until the end).
 * A node may carry pos={x, y}, fractions 0..1 of the diagram's width and height (its centre). Such a
 * node stays where it is put; the rest keep the computed layout. A connector touching a placed node
 * leaves the side that faces the other node, so a path may run right to left or top to bottom.
 * opts: nodes=[{id, label, product?, pos?}], edges=[{from, to}], meter?={to, label, prefix, suffix,
 *       decimals, locale}. All text goes in through textContent.
 * Not ambient: it plays once and never repeats. Print and reduced motion show the built diagram with
 * the meter visible. */
(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var VW = 1000;
  var NODE_IN = 0.6;   // a source node popping in
  var GROW = 0.6;      // a node travelling out of its parent, and its connector drawing
  var STEP = 0.55;     // between one layer starting to grow and the next
  var STAGGER = 0.1;   // between nodes of one layer
  var PULSE = 0.55;    // one pulse along one connector
  var DASH = 0.2;      // pulse length as a share of the connector
  var START_SCALE = 0.45; // a growing node's size as it leaves its parent
  var WAVES = 2;
  var WAVE_GAP = 0.75;
  var REST = 0.6;
  var NH = 70;         // the height the connectors assume for a node, only where a placed node faces up or down

  var num = function (v, d) { v = Number(v); return Number.isFinite(v) ? v : d; };
  var str = function (v) { return v == null ? '' : String(v); };
  var pct = function (v) { return Math.round(v * 10000) / 100 + '%'; };
  var r1 = function (v) { return Math.round(v * 10) / 10; };

  function formatter(o) {
    var d = Math.max(0, Math.min(20, Math.round(num(o.decimals, 0))));
    var f;
    try { f = new Intl.NumberFormat(o.locale || 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); } catch (e) {
      f = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    return function (v) { return str(o.prefix) + f.format(v) + str(o.suffix); };
  }
  function el(tag, cls, text, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function path(cls, d, parent) {
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('d', d);
    p.setAttribute('pathLength', '1');
    parent.appendChild(p);
    return p;
  }

  // Layers: longest path from the sources over forward edges (a cycle is cut where it closes), then
  // each source is pulled right to sit one layer before the nearest node it feeds.
  function layout(nodes, edges) {
    var byId = {}, depth = {}, ins = {}, outs = {};
    nodes.forEach(function (n) { byId[n.id] = n; depth[n.id] = 0; ins[n.id] = []; outs[n.id] = []; });
    edges.forEach(function (e) { ins[e.to].push(e); outs[e.from].push(e); });
    var order = [], state = {};
    function visit(id) { // DFS post-order; edges back into the current path are ignored
      state[id] = 1;
      outs[id].forEach(function (e) { if (!state[e.to]) visit(e.to); else if (state[e.to] === 1) e.back = true; });
      state[id] = 2;
      order.push(id);
    }
    nodes.forEach(function (n) { if (!state[n.id] && !ins[n.id].length) visit(n.id); });
    nodes.forEach(function (n) { if (!state[n.id]) visit(n.id); });
    order.reverse(); // topological over forward edges
    order.forEach(function (id) {
      outs[id].forEach(function (e) { if (!e.back) depth[e.to] = Math.max(depth[e.to], depth[id] + 1); });
    });
    nodes.forEach(function (n) {
      var fwdIn = ins[n.id].filter(function (e) { return !e.back; });
      var fwdOut = outs[n.id].filter(function (e) { return !e.back; });
      if (!fwdIn.length && fwdOut.length) {
        depth[n.id] = Math.min.apply(null, fwdOut.map(function (e) { return depth[e.to]; })) - 1;
      }
    });
    // Number the used layers 0, 1, 2... so pulling sources right never leaves an empty column.
    var used = Object.keys(depth).map(function (id) { return depth[id]; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var cols = used.map(function () { return []; });
    nodes.forEach(function (n) { depth[n.id] = used.indexOf(depth[n.id]); cols[depth[n.id]].push(n.id); });
    return { depth: depth, cols: cols, ins: ins, outs: outs, order: order, byId: byId };
  }

  SFC.define('arch-flow', {
    duration: 6,
    build: function (root, tl, opts) {
      var seen = {};
      var nodes = (Array.isArray(opts.nodes) ? opts.nodes : []).filter(function (n) {
        if (!n || typeof n !== 'object' || n.id == null || seen[n.id]) return false;
        seen[n.id] = true;
        return true;
      }).map(function (n) {
        var q = n.pos && typeof n.pos === 'object' && n.pos.x != null && n.pos.y != null ? { x: Number(n.pos.x), y: Number(n.pos.y) } : null;
        if (q && !(Number.isFinite(q.x) && Number.isFinite(q.y))) q = null;
        if (q) q = { x: Math.min(1, Math.max(0, q.x)), y: Math.min(1, Math.max(0, q.y)) };
        return { id: String(n.id), label: str(n.label), product: n.product == null ? '' : str(n.product), fixed: q };
      });
      var edges = (Array.isArray(opts.edges) ? opts.edges : []).filter(function (e) {
        return e && seen[e.from] && seen[e.to] && e.from !== e.to;
      }).map(function (e) { return { from: String(e.from), to: String(e.to) }; });
      var meterOpts = opts.meter && typeof opts.meter === 'object' ? opts.meter : null;

      var L = layout(nodes, edges);
      var cols = L.cols.length || 1;
      var rowsMax = Math.max.apply(null, L.cols.map(function (c) { return c.length; }).concat(1));
      var VH = Math.max(300, rowsMax * 130);
      var NW = Math.min(230, (VW / cols) * 0.66);
      var pos = {};
      L.cols.forEach(function (ids, d) {
        ids.forEach(function (id, j) { pos[id] = { x: ((d + 0.5) / cols) * VW, y: ((j + 0.5) / ids.length) * VH, row: j }; });
      });

      nodes.forEach(function (n) { if (n.fixed) pos[n.id] = { x: n.fixed.x * VW, y: n.fixed.y * VH, row: pos[n.id].row, fixed: true }; });

      // Where a connector leaves and arrives, and where the arriving node starts its growth. Without a placed
      // node the old rule holds: the right side of the source to the left side of the target.
      var route = function (a, b) {
        var x1, y1, x2, y2, c1x, c1y, c2x, c2y, sx, sy;
        var dx = b.x - a.x, dy = b.y - a.y;
        var free = !a.fixed && !b.fixed;
        if (free || Math.abs(dx) >= NW + 8) {
          var dir = free || dx > 0 ? 1 : -1;
          x1 = a.x + dir * NW / 2; x2 = b.x - dir * NW / 2; y1 = a.y; y2 = b.y;
          var mx = (x1 + x2) / 2;
          c1x = mx; c1y = y1; c2x = mx; c2y = y2;
          sx = x1 + dir * (NW * START_SCALE / 2 + 4); sy = y1;
        } else {
          var v = dy >= 0 ? 1 : -1;
          x1 = a.x; x2 = b.x; y1 = a.y + v * NH / 2; y2 = b.y - v * NH / 2;
          var my = (y1 + y2) / 2;
          c1x = x1; c1y = my; c2x = x2; c2y = my;
          sx = x1; sy = y1 + v * (NH * START_SCALE / 2 + 4);
        }
        return {
          d: 'M' + r1(x1) + ' ' + r1(y1) + ' C' + r1(c1x) + ' ' + r1(c1y) + ' ' + r1(c2x) + ' ' + r1(c2y) + ' ' + r1(x2) + ' ' + r1(y2),
          sx: sx, sy: sy,
        };
      };
      var routes = {};
      edges.forEach(function (e) { routes[e.from + '>' + e.to] = route(pos[e.from], pos[e.to]); });

      var name = function (id) { var n = L.byId[id]; return n.label + (n.product ? ' (' + n.product + ')' : ''); };
      var fmt = meterOpts ? formatter(meterOpts) : null;
      root.textContent = '';
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', edges.map(function (e) { return name(e.from) + ' to ' + name(e.to) + '.'; })
        .concat(meterOpts ? [(fmt(num(meterOpts.to, 0)) + ' ' + str(meterOpts.label)).trim() + '.'] : []).join(' '));

      var stage = el('div', 'sfc-arch', null, root);
      stage.style.aspectRatio = VW + ' / ' + VH;
      var svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'sfc-wires');
      svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      stage.appendChild(svg);

      var edgeEl = edges.map(function (e) {
        var d = routes[e.from + '>' + e.to].d;
        var p = path('sfc-edge', d, svg);
        p.dataset.from = e.from;
        p.dataset.to = e.to;
        return { e: e, line: p, d: d };
      });

      var nodeEl = {};
      nodes.forEach(function (n) {
        var box = el('div', 'sfc-node', null, stage);
        box.dataset.node = n.id;
        if (n.product) box.dataset.product = n.product;
        box.style.left = pct(pos[n.id].x / VW);
        box.style.top = pct(pos[n.id].y / VH);
        box.style.width = pct(NW / VW);
        el('span', 'sfc-node-label', n.label, box);
        if (n.product) el('span', 'sfc-node-product', n.product, box);
        el('span', 'sfc-node-ring', null, box).setAttribute('aria-hidden', 'true');
        nodeEl[n.id] = box;
      });
      gsap.set(stage.querySelectorAll('.sfc-node'), { xPercent: -50, yPercent: -50 });

      // ---- 1. build ----
      var growAt = {}, appearAt = {}, end = 0;
      var colStart = [];
      L.cols.forEach(function (ids, d) {
        colStart[d] = d === 0 ? 0 : colStart[d - 1] + STEP + (L.cols[d - 1].length - 1) * STAGGER;
        ids.forEach(function (id, j) {
          var at = colStart[d] + j * STAGGER;
          var box = nodeEl[id];
          var parentEdge = L.ins[id].filter(function (e) { return !e.back && L.depth[e.from] < d; })[0];
          appearAt[id] = at;
          if (parentEdge) {
            var rt = routes[parentEdge.from + '>' + id];
            growAt[id] = at;
            // It leaves from the parent's facing side, where the connector starts, and begins just
            // clear of the parent's box (at start scale), so it never covers the parent's text.
            tl.fromTo(box, { left: pct(rt.sx / VW), top: pct(rt.sy / VH) },
              { left: box.style.left, top: box.style.top, duration: GROW, ease: 'power2.inOut' }, at);
            tl.fromTo(box, { opacity: 0, scale: START_SCALE }, { opacity: 1, scale: 1, duration: GROW * 0.75, ease: 'power2.out' }, at);
            end = Math.max(end, at + GROW);
          } else {
            tl.fromTo(box, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: NODE_IN, ease: 'expo.out' }, at);
            end = Math.max(end, at + NODE_IN);
          }
        });
      });
      // A connector draws with the node it grows; one that closes a cycle draws after both are on screen.
      edgeEl.forEach(function (x) {
        var e = x.e;
        var at = e.back ? Math.max(appearAt[e.from], appearAt[e.to]) + GROW : appearAt[e.to];
        tl.fromTo(x.line, { attr: { 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dashoffset': 0 }, duration: GROW, ease: 'power2.inOut' }, at);
        end = Math.max(end, at + GROW);
      });

      // ---- 2. pulses ----
      var pulseAt = end + 0.3;
      var reach = {}; // when a pulse of wave 0 reaches each node, relative to pulseAt
      L.order.forEach(function (id) {
        var fwd = L.ins[id].filter(function (e) { return !e.back; });
        reach[id] = fwd.length ? Math.max.apply(null, fwd.map(function (e) { return reach[e.from] + PULSE; })) : 0;
      });
      var pulseList = [];
      var pulseEnd = pulseAt;
      for (var w = 0; w < WAVES; w++) {
        edgeEl.forEach(function (x) {
          var p = path('sfc-pulse', x.d, svg);
          p.setAttribute('stroke-dasharray', DASH + ' 2'); // one dash, then a gap longer than the path
          gsap.set(p, { opacity: 0, attr: { 'stroke-dashoffset': DASH } });
          var at = pulseAt + w * WAVE_GAP + reach[x.e.from];
          tl.fromTo(p, { attr: { 'stroke-dashoffset': DASH } }, { attr: { 'stroke-dashoffset': -1 }, duration: PULSE, ease: 'power1.inOut', immediateRender: false }, at);
          tl.fromTo(p, { opacity: 0 }, { opacity: 1, duration: 0.08, ease: 'none', immediateRender: false }, at);
          tl.to(p, { opacity: 0, duration: 0.12, ease: 'none' }, at + PULSE - 0.12);
          var ring = nodeEl[x.e.to].querySelector('.sfc-node-ring');
          tl.to(ring, { opacity: 1, duration: 0.08, ease: 'none' }, at + PULSE);
          tl.to(ring, { opacity: 0, duration: 0.5, ease: 'power1.out' }, at + PULSE + 0.08);
          pulseList.push({ from: x.e.from, to: x.e.to, wave: w, at: at, dur: PULSE });
          pulseEnd = Math.max(pulseEnd, at + PULSE + 0.58);
        });
      }
      gsap.set(stage.querySelectorAll('.sfc-node-ring'), { opacity: 0 });

      // ---- 3. meter ----
      if (meterOpts) {
        var meter = el('div', 'sfc-meter', null, root);
        el('b', 'sfc-num', fmt(num(meterOpts.to, 0)), meter);
        el('span', 'sfc-label', str(meterOpts.label), meter);
        tl.fromTo(meter, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out' }, Math.max(0, pulseAt - 0.3));
      }
      tl.to({}, { duration: REST }, Math.max(pulseEnd, tl.duration()));

      root.__sfcFlow = { growAt: growAt, pulseAt: pulseAt, pulses: pulseList };
      return tl;
    },
  });
})();
