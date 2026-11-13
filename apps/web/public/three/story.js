/* Steuerung der Story-Szene auf der mobilen Startseite (statt Swift: postMessage vom Elternfenster). */
(function () {
  "use strict";
  if (!window.WR || !window.WR.boot) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.WR.boot({ scene: "story", params: { progress: 0 }, reduceMotion: reduce, interactive: true });
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || e.data.wr !== true) return;
    if (typeof e.data.progress === "number") window.WR.update({ progress: e.data.progress });
    if (typeof e.data.paused === "boolean") window.WR.pause(e.data.paused);
  });
  // Im Hintergrund nicht rechnen (Akku)
  document.addEventListener("visibilitychange", function () { window.WR.pause(document.visibilityState !== "visible"); });
})();
