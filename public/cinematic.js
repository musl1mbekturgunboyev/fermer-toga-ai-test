/* Presentation only. Routes, forms, stored data and API calls stay in the application. */
(() => {
  const root = document.getElementById('root');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let mountedVideo = null;

  function updateScene() {
    frame = 0;
    const landing = document.body.classList.contains('cinema-landing');
    const shift = motion.matches ? 0 : Math.min(window.scrollY * (landing ? .065 : .02), 95);
    document.body.style.setProperty('--scene-y', `${-shift}px`);
  }
  function onScroll() {
    if (!frame) frame = requestAnimationFrame(updateScene);
  }
  function mount() {
    const isLanding = !!root.querySelector('.valley-landing');
    const isApp = !!root.querySelector('.app');
    document.body.classList.toggle('cinema-landing', isLanding);
    document.body.classList.toggle('cinema-app', isApp);
    document.body.classList.toggle('cinema-public', !isLanding && !isApp);
    updateScene();
    const video = root.querySelector('[data-cloud-intro]');
    if (video === mountedVideo) return;
    mountedVideo?.pause();
    mountedVideo = video;
    if (!video || motion.matches || navigator.connection?.saveData) return;
    video.muted = true;
    video.play().then(() => {
      if (!video.isConnected) return video.pause();
      const mist = video.closest('.valley-mist');
      mist.classList.add('is-playing');
      mist.addEventListener('animationend', () => video.pause(), { once: true });
    }).catch(() => { /* The static landscape is visible when autoplay is unavailable. */ });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  motion.addEventListener('change', () => {
    if (motion.matches) {
      mountedVideo?.pause();
      root.querySelector('.valley-mist')?.classList.remove('is-playing');
    }
    updateScene();
  });
  new MutationObserver(mount).observe(root, { childList: true });
  mount();
})();
