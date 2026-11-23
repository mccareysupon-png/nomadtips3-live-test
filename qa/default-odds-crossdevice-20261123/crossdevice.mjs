import {oddsMovementStyles,oddsMovementScript} from '../odds-movement-20261121/odds-movement.mjs';
const OLD_MEDIA='@media (min-width:1024px) and (hover:hover) and (pointer:fine) {';
const NEW_MEDIA='@media (prefers-reduced-motion: no-preference) {';
const OLD_SELECTOR='html:root[data-theme=\\\"dark\\\"] body';
const NEW_SELECTOR='html:root body';
const OLD_ACTIVE="const active=()=>matchMedia('(min-width:1024px) and (hover:hover) and (pointer:fine)').matches&&document.documentElement.getAttribute('data-theme')==='dark'&&!matchMedia('(prefers-reduced-motion:reduce)').matches;";
const NEW_ACTIVE="const active=()=>!matchMedia('(prefers-reduced-motion:reduce)').matches;";
const assertOnce=(value,needle,label)=>{if(value.split(needle).length!==2)throw Error('SOURCE_DRIFT_'+label);return value};
assertOnce(oddsMovementStyles,OLD_MEDIA,'CSS_MEDIA');
assertOnce(oddsMovementScript,OLD_ACTIVE,'JS_ACTIVE');
export const crossDeviceOddsStyles=oddsMovementStyles.replace(OLD_MEDIA,NEW_MEDIA).replaceAll(OLD_SELECTOR,NEW_SELECTOR).replaceAll('TEST ONLY: separated','TEST CROSS DEVICE: separated');
export const crossDeviceOddsScript=oddsMovementScript.replace(OLD_ACTIVE,NEW_ACTIVE)
 .replaceAll('__b46OddsMovementV1','__b46OddsCrossDeviceTestV1')
 .replaceAll('__b46OddsMovementStats','__b46OddsCrossDeviceStats')
 .replace('function boot(){','function boot(){\n if(matchMedia(\'(min-width:1024px) and (hover:hover) and (pointer:fine)\').matches&&document.documentElement.getAttribute(\'data-theme\')===\'dark\')return; // native owns the already-supported desktop-dark mode');
if(crossDeviceOddsStyles.includes('html:root[data-theme=\\\"dark\\\"] body'))throw Error('DARK_ONLY_CSS_REMAINS');
if(crossDeviceOddsScript.includes(OLD_ACTIVE))throw Error('DEVICE_RESTRICTED_ACTIVE_REMAINS');
