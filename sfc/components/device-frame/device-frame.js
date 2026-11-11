/* device-frame: a laptop or phone shell around a screen, with a 2D->3D tilt pop.
 * The device rises flat, leans back into 3D as it comes up (the "peak" label is the most tilted
 * moment, with a glare band crossing the glass), then pops forward and lands flat on expo.out while
 * its screen wakes up. With tilt:false it only rises and lands, never leaving 2D.
 * The screen is whatever markup the root already holds (a UI rebuilt in HTML), or an <img> when
 * opts.src is set. Every move is a GSAP tween on .sfc-device, so the CSS never sets its transform.
 * opts: device='laptop'|'phone', src=null, alt='', tilt=true.
 * Not ambient: it plays once and never repeats. Print and reduced motion show the flat device. */
(function () {
  'use strict';
  var PEAK = 0.85;   // seconds: end of the lean back, start of the pop
  var POP = 1.25;    // seconds the pop takes to land
  var REST = 0.5;
  var DEVICES = ['laptop', 'phone'];

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  SFC.define('device-frame', {
    duration: PEAK + POP + REST,
    build: function (root, tl, opts) {
      var device = DEVICES.indexOf(opts.device) < 0 ? 'laptop' : opts.device;
      var tilt = opts.tilt !== false;
      root.dataset.device = device;

      // Keep the author's markup: it moves into the screen untouched.
      var kids = Array.prototype.slice.call(root.childNodes);
      var stage = el('div', 'sfc-stage');
      var dev = el('div', 'sfc-device', stage);
      var shell = el('div', 'sfc-shell', dev);
      var screen = el('div', 'sfc-screen', shell);
      el('span', device === 'phone' ? 'sfc-island' : 'sfc-cam', shell).setAttribute('aria-hidden', 'true');
      var content = el('div', 'sfc-screen-content', screen);
      var glare = el('div', 'sfc-glare', screen);
      glare.setAttribute('aria-hidden', 'true');
      if (device === 'laptop') el('div', 'sfc-base', dev).setAttribute('aria-hidden', 'true');

      if (opts.src) {
        var img = document.createElement('img');
        img.src = String(opts.src);
        img.alt = opts.alt == null ? '' : String(opts.alt);
        img.decoding = 'async';
        content.appendChild(img);
      } else {
        kids.forEach(function (k) { content.appendChild(k); });
      }
      root.textContent = '';
      root.appendChild(stage);

      // Frame 0: flat, low and transparent. fromTo renders it at build, before any seek.
      tl.fromTo(dev, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power1.out' }, 0);
      if (tilt) {
        tl.fromTo(dev,
          { y: 48, scale: 0.94, rotationX: 0, rotationY: 0, z: 0 },
          { y: 0, scale: 0.9, rotationX: 22, rotationY: -10, z: -60, duration: PEAK, ease: 'power2.inOut' }, 0);
        tl.addLabel('peak', PEAK);
        tl.to(dev, { scale: 1, rotationX: 0, rotationY: 0, z: 0, duration: POP, ease: 'expo.out' }, PEAK);
        // The glare crosses the glass while it leans, then fades as the device lands.
        tl.fromTo(glare, { opacity: 0, backgroundPosition: '130% 0%' }, { opacity: 0.55, duration: PEAK - 0.2, ease: 'power1.out' }, 0.2);
        tl.to(glare, { backgroundPosition: '-30% 0%', duration: 1.3, ease: 'power1.inOut' }, 0.2);
        tl.to(glare, { opacity: 0, duration: 0.6, ease: 'power1.in' }, PEAK + 0.1);
      } else {
        tl.fromTo(dev,
          { y: 48, scale: 0.94, rotationX: 0, rotationY: 0, z: 0 },
          { y: 0, scale: 1, duration: PEAK + 0.4, ease: 'expo.out' }, 0);
        tl.addLabel('peak', PEAK);
        tl.set(glare, { opacity: 0 }, 0);
      }
      // The screen wakes as the device lands.
      tl.fromTo(content, { opacity: 0.35 }, { opacity: 1, duration: 0.6, ease: 'power2.out' }, PEAK + 0.1);
      tl.to({}, { duration: REST }, PEAK + POP);
      return tl;
    },
  });
})();
