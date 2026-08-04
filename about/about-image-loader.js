(()=>{
  'use strict';

  const image = document.querySelector('.info-hero__image');
  const status = document.querySelector('.info-hero__loading');
  if (!image) return;

  const parts = [
    './media-parts-v2/hero.part00.b64',
    './media-parts-v2/hero.part01.b64',
    './media-parts-v2/hero.part02.b64'
  ];

  let objectUrl = '';

  function base64ToBlob(base64, type) {
    const clean = base64.replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], {type});
  }

  async function loadHeroImage() {
    try {
      const responses = await Promise.all(parts.map(path => fetch(`${path}?v=202608041004`, {cache:'force-cache'})));
      if (responses.some(response => !response.ok)) throw new Error('Hero image part unavailable');

      const encodedParts = await Promise.all(responses.map(response => response.text()));
      const blob = base64ToBlob(encodedParts.join(''), 'image/webp');
      objectUrl = URL.createObjectURL(blob);

      image.addEventListener('load', () => {
        image.classList.add('is-ready');
        if (status) status.hidden = true;
      }, {once:true});

      image.src = objectUrl;
    } catch (error) {
      if (status) status.textContent = 'Image temporarily unavailable';
      console.error('About Us hero image could not be loaded.', error);
    }
  }

  loadHeroImage();

  window.addEventListener('pagehide', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, {once:true});
})();
