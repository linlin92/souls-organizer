// Fade the clip out at both ends so the restart (clear first frame, leftover particles on the last) is not a jump.
// The still underneath is that first frame, so the picture eases back to a quiet silhouette and in again.
(function () {
  var video = document.querySelector(".site-bg-video");
  if (!video) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    video.removeAttribute("autoplay");
    video.pause();
    video.remove();
    return;
  }
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  var FADE = 0.6;
  var raf = 0;
  function paint() {
    var d = video.duration;
    if (!d || !isFinite(d)) { video.style.opacity = "1"; return; }
    var edge = Math.min(video.currentTime, Math.max(0, d - video.currentTime));
    video.style.opacity = edge < FADE ? String(Math.max(0, edge / FADE)) : "1";
  }
  function frame() {
    paint();
    if (!video.paused && !video.ended) raf = requestAnimationFrame(frame);
  }
  video.addEventListener("play", function () { cancelAnimationFrame(raf); frame(); });
  video.addEventListener("pause", function () { cancelAnimationFrame(raf); });
  video.addEventListener("seeked", paint);
  video.addEventListener("loadedmetadata", paint);
  var started = video.play();
  if (started && started.catch) started.catch(function () {});
})();
