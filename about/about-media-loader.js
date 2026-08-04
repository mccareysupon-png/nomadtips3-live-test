(()=>{
  'use strict';

  const video = document.querySelector('.info-hero__video');
  if (!video) return;

  const repoRaw = 'https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/';
  const videoPath = new URL('./media/about-loop.mp4', window.location.href).href;
  const posterPath = new URL('./media/about-poster.jpg', window.location.href).href;
  const videoParts = Array.from({length:7}, (_, index) =>
    `${repoRaw}.media-upload/about-loop.part${String(index).padStart(2,'0')}.b64`
  );
  const posterFallback = `${repoRaw}.media-upload/about-poster.b64`;
  const objectUrls = [];

  async function fetchBlob(url, type) {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, {cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Empty media response');
    return type && blob.type !== type ? new Blob([blob], {type}) : blob;
  }

  function base64ToBlob(base64, type) {
    const clean = base64.replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let index=0; index<binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], {type});
  }

  async function fetchBase64Blob(urls, type) {
    const texts = await Promise.all(urls.map(async url => {
      const response = await fetch(`${url}?v=${Date.now()}`, {cache:'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    }));
    return base64ToBlob(texts.join(''), type);
  }

  function useObjectUrl(blob) {
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    return url;
  }

  async function loadPoster() {
    try {
      const posterBlob = await fetchBlob(posterPath, 'image/jpeg');
      video.poster = useObjectUrl(posterBlob);
      return;
    } catch {}

    try {
      const posterBlob = await fetchBase64Blob([posterFallback], 'image/jpeg');
      video.poster = useObjectUrl(posterBlob);
    } catch (error) {
      console.warn('About poster fallback unavailable.', error);
    }
  }

  async function loadVideo() {
    let mediaBlob;
    try {
      mediaBlob = await fetchBlob(videoPath, 'video/mp4');
    } catch {
      mediaBlob = await fetchBase64Blob(videoParts, 'video/mp4');
    }

    video.src = useObjectUrl(mediaBlob);
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.load();

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      try { await video.play(); } catch {}
    }
  }

  Promise.allSettled([loadPoster(), loadVideo()]);

  window.addEventListener('pagehide', () => {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
  }, {once:true});
})();
