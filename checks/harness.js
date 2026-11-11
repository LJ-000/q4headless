// Minimal in-page test harness. Globals: test(name, fn), assert.equal, assert.ok, done().
// done() runs every registered test in order (fn may be async), keeps going after a failure and writes
// "PASS n" or "FAIL k of n" plus one "- name: msg" line per failure into <output id="result">.
(function () {
  const queue = [];
  let pageError = null;
  let finished = false;

  window.addEventListener('error', (e) => { pageError = pageError || String(e.message || e.error); });
  window.addEventListener('unhandledrejection', (e) => {
    pageError = pageError || String((e.reason && e.reason.message) || e.reason);
  });

  window.assert = {
    equal(a, b, msg) {
      if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
    },
    ok(v, msg) {
      if (!v) throw new Error(msg || 'expected truthy, got ' + JSON.stringify(v));
    },
  };

  window.test = function test(name, fn) {
    queue.push({ name, fn });
  };

  function write(text) {
    let out = document.getElementById('result');
    if (!out) {
      out = document.createElement('output');
      out.id = 'result';
      document.body.appendChild(out);
    }
    out.textContent = text;
  }

  window.done = async function done() {
    if (finished) return;
    finished = true;
    const failures = [];
    for (const t of queue) {
      try {
        await t.fn();
      } catch (err) {
        failures.push(t.name + ': ' + ((err && err.message) || err));
      }
    }
    if (pageError) failures.push('page-error: ' + pageError);
    if (!queue.length) failures.push('no-tests: nothing registered');
    if (failures.length) {
      write('FAIL ' + failures.length + ' of ' + queue.length + '\n' + failures.map((f) => '- ' + f).join('\n'));
      return;
    }
    write('PASS ' + queue.length);
  };
})();
