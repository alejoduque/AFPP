/*
 * The AFPP ticker: tiny 1-bit actors walking past along a dotted ground, frame
 * by frame (sprites from tools/make_ticker.py: ticker.png + ticker.json).
 *
 *   <canvas class="afpp-ticker" data-scale="2" aria-hidden="true"></canvas>
 *   <script src="…/ticker/ticker.js" defer></script>
 *
 * Every canvas.afpp-ticker on the page mounts itself; a page that adds one
 * later calls AfppTicker.mount(canvas). Drawn at the sprites' own resolution
 * and scaled by CSS (data-scale: 1 or 2), so pixels stay square. Holds still
 * for prefers-reduced-motion; pauses with the tab (requestAnimationFrame).
 */
(function () {
  'use strict';
  if (window.AfppTicker) return;

  var script = document.currentScript;
  var BASE = script ? script.src.replace(/ticker\.js(\?.*)?$/, '') : 'ticker/';
  var INK = '#9b4dff';
  var GAP = 14;         // sprite pixels between actors
  var SPEED = 9;        // sprite pixels per second
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ready = new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      fetch(BASE + 'ticker.json').then(function (r) { return r.json(); })
        .then(function (meta) { resolve({ img: img, meta: meta }); }, reject);
    };
    img.onerror = reject;
    img.src = BASE + 'ticker.png';
  });

  function mount(canvas) {
    if (!canvas || canvas.__afppTicker) return;
    canvas.__afppTicker = true;
    var scale = Number(canvas.getAttribute('data-scale')) || 2;
    var ctx = canvas.getContext('2d');
    ready.then(function (s) {
      var cw = s.meta.cell[0];
      var ch = s.meta.cell[1];
      var actors = s.meta.actors;
      var loop = actors.length * (cw + GAP);
      canvas.style.height = ch * scale + 'px';
      canvas.height = ch;

      function size() {
        var w = Math.max(cw, Math.round(canvas.clientWidth / scale));
        if (canvas.width !== w) canvas.width = w;
      }
      if (window.ResizeObserver) new ResizeObserver(size).observe(canvas);
      size();

      var t0 = performance.now();
      function draw(now) {
        var t = reduced ? 0 : (now - t0) / 1000;
        var w = canvas.width;
        ctx.clearRect(0, 0, w, ch);
        ctx.imageSmoothingEnabled = false;
        // The dotted ground.
        ctx.fillStyle = INK;
        for (var x = (Math.floor(t * SPEED) % 3); x < w; x += 3) ctx.fillRect(x, ch - 1, 1, 1);
        // The procession, left to right, wrapping round.
        var offset = (t * SPEED) % loop;
        for (var copy = -1; copy * loop < w + loop; copy++) {
          for (var i = 0; i < actors.length; i++) {
            var a = actors[i];
            var ax = Math.round(i * (cw + GAP) + offset + copy * loop - loop);
            if (ax < -cw || ax > w) continue;
            var f = reduced ? a.seq[a.seq.length - 1] : a.seq[Math.floor(t * a.fps) % a.seq.length];
            ctx.drawImage(s.img, f * cw, a.row * ch, cw, ch, ax, 0, cw, ch);
          }
        }
        if (!reduced) requestAnimationFrame(draw);
      }
      requestAnimationFrame(draw);
    }).catch(function () { canvas.style.display = 'none'; });
  }

  window.AfppTicker = { mount: mount };
  function all() {
    var list = document.querySelectorAll('canvas.afpp-ticker');
    for (var i = 0; i < list.length; i++) mount(list[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
  else all();
})();
