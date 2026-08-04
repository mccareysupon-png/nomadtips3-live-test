(()=>{
  'use strict';

  const video = document.querySelector('.info-hero__video');
  const encoded = window.NOMAD_ABOUT_VIDEO_B64;
  if (!video || !encoded) return;

  let objectUrl = '';

  function base64ToBlob(base64, type) {
    const binary = atob(base64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], {type});
  }

  async function playVideo() {
    if (document.hidden) return;
    try {
      await video.play();
    } catch {
      // Some mobile browsers require one interaction before playback.
    }
  }

  try {
    const blob = base64ToBlob(encoded, 'video/mp4');
    objectUrl = URL.createObjectURL(blob);

    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.src = objectUrl;

    video.addEventListener('loadeddata', () => {
      video.classList.add('is-ready');
      playVideo();
    }, {once: true});

    video.addEventListener('canplay', playVideo, {once: true});
    video.load();
    playVideo();

    document.addEventListener('visibilitychange', playVideo);
    window.addEventListener('pageshow', playVideo);
    document.addEventListener('pointerdown', playVideo, {once: true, passive: true});
    document.addEventListener('touchstart', playVideo, {once: true, passive: true});
  } catch (error) {
    console.error('About video could not be initialized.', error);
  }

  window.addEventListener('pagehide', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, {once: true});
})();
