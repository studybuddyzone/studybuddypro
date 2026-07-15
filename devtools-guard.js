// Devtools-guard v2
// 3 layers:
// 1) Keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S) — kaam karta hai Firefox/Edge me.
//    Chrome me F12 ko keypress se pura block karna sambhav nahi (Chrome jaan-bujhkar
//    isse allow nahi karta), isliye layer 3 (detection loop) asli kaam karta hai Chrome me.
// 2) Right-click aur copy/cut/select block.
// 3) DevTools already khula ho (chahe kisi bhi tarike se — F12, browser menu, ya external
//    tool se) to lagataar detect karke turant due.html par redirect karta hai.
// Note: yeh sab deterrent hai, 100% foolproof nahi (JS disable karke ya extension se bypass
// ho sakta hai) — asli data-security backend/Firebase rules me hi hai.
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

  // ---- Layer 3: devtools-open detection (window-size gap trick) ----
  var gapThreshold = 160;
  setInterval(function () {
    var widthGap = window.outerWidth - window.innerWidth;
    var heightGap = window.outerHeight - window.innerHeight;
    if (widthGap > gapThreshold || heightGap > gapThreshold) {
      blockAndRedirect();
    }
  }, 800);

  // ---- Layer 3b: devtools-open detection (debugger timing trick) ----
  // Jab devtools khula hota hai, "debugger" line par execution ruk jaata hai — isse
  // time-gap measure karke pata chal jaata hai devtools khula hai, chahe kaise bhi khula ho.
  setInterval(function () {
    var start = performance.now();
    debugger;
    var end = performance.now();
    if (end - start > 100) {
      blockAndRedirect();
    }
  }, 1200);
})();
