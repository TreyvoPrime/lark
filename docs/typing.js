/* Play the real IDE recording only when it is visible and motion is welcome. */
(() => {
  'use strict';
  const video = document.getElementById('typing-video');
  if (!video) return;
  const poster = document.getElementById('typing-poster');
  const controls = document.querySelector('.typing-controls');
  const pause = document.getElementById('typing-pause');
  const replay = document.getElementById('typing-replay');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let inView = false, userPaused = false, failed = false;
  video.muted = true;
  function render() {
    controls.hidden = motion.matches || failed;
    pause.disabled = video.ended;
    pause.textContent = video.paused ? 'Play' : 'Pause';
    pause.setAttribute('aria-label', video.paused ? 'Play IDE demonstration' : 'Pause IDE demonstration');
    replay.setAttribute('aria-label', 'Replay IDE demonstration');
  }
  function showPoster() {
    poster.hidden = false;
    video.hidden = true;
  }
  function play() {
    if (failed || motion.matches || document.hidden || !inView || userPaused || video.ended) return;
    if (!video.hasAttribute('src')) {
      video.src = video.dataset.src;
      video.load();
    }
    // Browsers may decline autoplay; the Play button remains available.
    video.play().catch(() => render());
  }
  function sync() {
    if (motion.matches) {
      video.pause();
      showPoster();
      if (video.hasAttribute('src')) {
        video.removeAttribute('src');
        video.load();
      }
    } else if (document.hidden || !inView || userPaused) video.pause();
    else play();
    render();
  }
  video.addEventListener('playing', () => {
    // A preference/visibility change can happen while play() is pending.
    if (motion.matches || document.hidden || !inView || userPaused) { sync(); return; }
    poster.hidden = true;
    video.hidden = false;
    render();
  });
  for (const event of ['play', 'pause', 'ended']) video.addEventListener(event, render);
  video.addEventListener('error', () => {
    failed = true;
    video.pause();
    showPoster();
    render();
  });
  pause.addEventListener('click', () => {
    userPaused = !video.paused;
    sync();
  });
  replay.addEventListener('click', () => {
    video.currentTime = 0;
    userPaused = false;
    sync();
  });
  motion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting && entries[0].intersectionRatio >= .15;
      sync();
    }, {threshold: [0, .15]}).observe(video.parentElement);
  } else inView = true;
  sync();
})();
