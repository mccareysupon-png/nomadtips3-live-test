export function addAssetVersion(html, assetPath, key, hash) {
  const normalized = String(assetPath).replace(/^\/+/, '');
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(String.raw`(["'])(\.?\/?${escaped})([?#][^"']*)?\1`, 'g');
  let matches = 0;
  const rewritten = html.replace(pattern, (_all, quote, path, suffix = '') => {
    matches++;
    const hashIndex = suffix.indexOf('#');
    const beforeFragment = hashIndex < 0 ? suffix : suffix.slice(0, hashIndex);
    const fragment = hashIndex < 0 ? '' : suffix.slice(hashIndex);
    const separator = beforeFragment.includes('?') ? '&' : '?';
    return quote + path + beforeFragment + separator + key + '=' + hash + fragment + quote;
  });
  return {html: rewritten, matches};
}
