import {publicFile} from './production.mjs';
const t=(await publicFile('/statistics-next.js','javascript')).toString('utf8');
console.log(t);