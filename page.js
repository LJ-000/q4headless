/* The opening is a two-area one-take: SFC.oneTake builds one scrubbed master timeline over the hero and the
   "why headless" card, joined by one carry (data-carry="why"). It ends with no pull-back, so the sticky camera
   frame scrolls away and the stacked sections follow. SFC.mountAll mounts the components in those sections:
   each plays once in view and sits at its final frame under reduced motion and in print.

   The two selectors (starting point, then where the customers work) are plain buttons over panels that are all
   in the DOM. Without this script, or in print, every panel shows. window.__page resolves to
   { onetake, mounts } once both are built. */
(function () {
  'use strict';

  var take = SFC.oneTake({
    intensity: 3,
    areas: {
      hero: { x: 0, y: 0, rest: 0.8 },
      proof: { x: 2060, y: 180, w: 1500, h: 760, rest: 1.6 },
    },
  });
  var sections = SFC.mountAll(document.querySelector('.mx-sections'));
  window.__page = Promise.all([take, sections]).then(function (r) { return { onetake: r[0], mounts: r[1] }; });

  /* ---------- selectors ---------- */

  var root = document.documentElement;
  root.classList.add('js');

  var STARTS = {
    le: { name: 'Bring your MCP server', ask: 'Which tool are your customers calling today, and what do they get done with it?' },
    tr: { name: 'Expose your app to agents', ask: 'What is the first thing a customer has asked an agent to do on their behalf?' },
    cg: { name: 'Build a new experience', ask: 'Walk through your customer journey. At what point does someone need Salesforce data, or permission to take an action?' },
  };
  var SURFACES = {
    sf: { name: 'in Salesforce', then: 'Register your MCP server with Agentforce, or package agent actions in the org.' },
    ex: { name: 'in Slack, Claude, ChatGPT or Teams', then: 'Open the Headless MCP Server through an External Client App, then add HXL widgets.' },
    no: { name: 'outside Salesforce', then: 'Read about Embed first, then bring headless in under your own brand.' },
  };
  var state = { start: 'le', surface: 'sf' };
  var pathEl = document.getElementById('sel-path');

  function renderPath() {
    var s = STARTS[state.start], f = SURFACES[state.surface];
    pathEl.textContent = '';
    var a = document.createElement('b');
    a.textContent = 'Your path: ' + s.name + ', with customers ' + f.name + '. ';
    pathEl.appendChild(a);
    pathEl.appendChild(document.createTextNode('Start by asking: “' + s.ask + '” Then: ' + f.then));
  }

  function wire(row) {
    var group = row.getAttribute('data-sel');
    var prefix = group === 'start' ? 'p-' : 'q-';
    var panels = document.querySelector('[data-panels="' + group + '"]');
    var tabs = Array.prototype.slice.call(row.querySelectorAll('[data-pick]'));

    function pick(key, focus) {
      state[group] = key;
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-pick') === key;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      Array.prototype.forEach.call(panels.children, function (p) {
        p.classList.toggle('is-off', p.id !== prefix + key);
      });
      renderPath();
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { pick(t.getAttribute('data-pick'), false); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (n === null) return;
        e.preventDefault();
        pick(tabs[(n + tabs.length) % tabs.length].getAttribute('data-pick'), true);
      });
    });
    pick(state[group], false);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-sel]'), wire);
})();
