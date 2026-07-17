// Devtools-guard v3
// Layers:
// 1) Keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S) — desktop browsers ke liye.
// 2) Right-click aur copy/cut/select block — sab devices par.
// 3) DevTools-open detection (sirf DESKTOP par) — mobile par yeh heuristics
//    unreliable hain (browser toolbar collapse/expand, background tab lag, etc.
//    se false-positive aata hai), isliye mobile/touch devices par yeh layer
//    poori tarah skip hoti hai.
// Note: yeh sab deterrent hai, 100% foolproof nahi — asli data-security
// backend/Firebase rules me hi hai.
(function () {
  var redirected = false;
  function blockAndRedirect(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (redirected) return;
    redirected = true;
    window.location.href = "due.html";
  }

  var isMobile = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) ||
                 (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);

  // ---- Layer 1: keyboard shortcuts ----
  document.addEventListener("keydown", function (e) {
    var key = (e.key || "").toUpperCase();

    if (e.keyCode === 123 || key === "F12") {
      return blockAndRedirect(e);
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].indexOf(key) !== -1) {
      return blockAndRedirect(e);
    }
    if ((e.ctrlKey || e.metaKey) && (key === "U" || key === "S")) {
      return blockAndRedirect(e);
    }
  });

  // ---- Layer 2: right-click + copy/cut/select block ----
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("copy", function (e) { e.preventDefault(); });
  document.addEventListener("cut", function (e) { e.preventDefault(); });

  document.addEventListener("DOMContentLoaded", function () {
    var style = document.createElement("style");
    style.textContent =
      "body{-webkit-user-select:none;-moz-user-select:none;user-select:none;}" +
      "input,textarea,[contenteditable='true']{-webkit-user-select:text;-moz-user-select:text;user-select:text;}";
    document.head.appendChild(style);
  });

  // ---- Layer 3: devtools-open detection — SIRF DESKTOP par, aur debounce ke saath ----
  if (!isMobile) {
    var gapThreshold = 250;
    var debuggerThreshold = 200;
    var consecutiveHits = 0;
    var HITS_NEEDED = 3; // lagataar 3 baar shak hone par hi redirect — random ek-baar ka spike ignore

    setInterval(function () {
      var widthGap = window.outerWidth - window.innerWidth;
      var heightGap = window.outerHeight - window.innerHeight;

      var start = performance.now();
      debugger;
      var end = performance.now();

      var suspicious = (widthGap > gapThreshold || heightGap > gapThreshold) || (end - start > debuggerThreshold);

      consecutiveHits = suspicious ? (consecutiveHits + 1) : 0;

      if (consecutiveHits >= HITS_NEEDED) {
        blockAndRedirect();
      }
    }, 1000);
  }
})();
