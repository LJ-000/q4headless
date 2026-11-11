/* agent-chat: a conversation in bubbles, with a typing indicator before each agent reply and an
 * optional stat card inside an agent bubble.
 * Build writes every message into the root up front, so screen readers and print get all the text.
 * The timeline only reveals: each bubble is a fromTo on opacity and y, so what is visible is a pure
 * function of the timeline position and a plain seek renders the right frame.
 * opts: agentName='Agentforce', messages=[{from:'user'|'agent', text, at?, widget?:{type:'stat', value, label}}],
 *       typingMs=600, gap=0.5 (seconds between one bubble finishing and the next message starting).
 * at (seconds on the component's own timeline) pins the moment a bubble lands, so a message can be
 * timed to a voice-over beat. The typing dots run in the typingMs just before it, shortened if the
 * previous message ends later, and the messages after it follow in sequence. Without at, nothing changes.
 * All text goes in through textContent, never as HTML.
 * Not ambient: it plays once and never repeats. Print and reduced motion show the full transcript. */
(function () {
  'use strict';
  var REVEAL = 0.3;     // seconds a bubble takes to fade and rise in
  var WIDGET_AT = 0.25; // the stat card lands this long after its bubble starts
  var WIDGET_DUR = 0.3;
  var FADE = 0.15;      // typing indicator fade in and out
  var DOT_STEP = 0.12;  // delay between the three dots
  var DOT_CYCLE = 0.3;  // preferred length of one up or one down move of a dot
  var MIN_DOTS_WINDOW = 0.3; // shorter typing windows show still dots

  var num = function (v, d) { v = Number(v); return Number.isFinite(v) ? v : d; };
  var str = function (v) { return v == null ? '' : String(v); };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // The nearest data-sfc-surface decides which text color sits on the user bubble (see the CSS).
  function surfaceOf(root) {
    var s = root.closest('[data-sfc-surface]');
    return s && s.dataset.sfcSurface === 'light' ? 'light' : 'dark';
  }

  SFC.define('agent-chat', {
    duration: 4.5,
    build: function (root, tl, opts) {
      var agentName = str(opts.agentName) || 'Agentforce';
      var typing = Math.max(0, num(opts.typingMs, 600)) / 1000;
      var gap = Math.max(0, num(opts.gap, 0.5));
      var list = Array.isArray(opts.messages) ? opts.messages : [];

      root.textContent = '';
      root.setAttribute('role', 'log');
      root.setAttribute('aria-label', 'Conversation with ' + agentName);
      root.dataset.chatSurface = surfaceOf(root);

      var t = 0;
      var lastEnd = 0;
      list.forEach(function (msg) {
        if (!msg || typeof msg !== 'object') return;
        var isUser = msg.from === 'user';
        var row = el('div', 'sfc-row ' + (isUser ? 'sfc-row-user' : 'sfc-row-agent'));
        var bubble = el('div', 'sfc-bubble ' + (isUser ? 'sfc-user' : 'sfc-agent'));
        if (!isUser) bubble.appendChild(el('span', 'sfc-who', agentName));
        bubble.appendChild(el('span', 'sfc-text', str(msg.text)));

        var widget = null;
        if (!isUser && msg.widget && typeof msg.widget === 'object' && (msg.widget.type || 'stat') === 'stat') {
          widget = el('div', 'sfc-widget');
          widget.appendChild(el('b', 'sfc-widget-value', str(msg.widget.value)));
          widget.appendChild(el('span', 'sfc-widget-label', str(msg.widget.label)));
          bubble.appendChild(widget);
        }

        // A pinned message lands at its own time; the dots take what is free before it.
        var win = isUser ? 0 : typing;
        if (msg.at != null && Number.isFinite(Number(msg.at)) && Number(msg.at) >= 0) {
          var land = Number(msg.at);
          var from = Math.max(lastEnd, land - win);
          win = isUser ? 0 : Math.max(0, land - from);
          t = land - win;
        }
        var showTyping = win > 0;
        var ind = null;
        if (showTyping) {
          ind = el('div', 'sfc-typing');
          ind.setAttribute('aria-hidden', 'true');
          var dots = [];
          for (var i = 0; i < 3; i++) { var d = el('span', 'sfc-dot'); dots.push(d); ind.appendChild(d); }
          row.appendChild(ind);
        }
        row.appendChild(bubble);
        root.appendChild(row);

        // The indicator fades in, bounces its dots, then fades out as the bubble fades in.
        if (showTyping) {
          var fade = Math.min(FADE, win / 2);
          tl.fromTo(ind, { opacity: 0 }, { opacity: 1, duration: fade, ease: 'none' }, t);
          tl.fromTo(ind, { opacity: 1 }, { opacity: 0, duration: fade, ease: 'none', immediateRender: false }, t + win);
          // The window holds a whole number n of up-and-back bounces, so every dot is home at the end.
          // The stagger shrinks with a short window and the half-bounce c is fitted to what is left, so
          // any window of MIN_DOTS_WINDOW or more gets at least one visible bounce. Dot k ends at
          // t + k * step + avail, which is inside the window for k <= 2.
          if (win >= MIN_DOTS_WINDOW) {
            var step = Math.min(DOT_STEP, win / 6);
            var avail = win - 2 * step;
            var n = Math.max(1, Math.floor(avail / (2 * DOT_CYCLE)));
            var c = avail / (2 * n);
            dots.forEach(function (dot, k) {
              tl.fromTo(dot, { y: 0 }, { y: -5, duration: c, ease: 'sine.inOut', repeat: n * 2 - 1, yoyo: true }, t + k * step);
            });
          }
          t += win;
        }

        tl.fromTo(bubble, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: REVEAL, ease: 'power2.out' }, t);
        var end = t + REVEAL;
        if (widget) {
          tl.fromTo(widget, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: WIDGET_DUR, ease: 'power2.out' }, t + WIDGET_AT);
          end = Math.max(end, t + WIDGET_AT + WIDGET_DUR);
        }
        lastEnd = end;
        t = end + gap;
      });
      return tl;
    },
  });
})();
