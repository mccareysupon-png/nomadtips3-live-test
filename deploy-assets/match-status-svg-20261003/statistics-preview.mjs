import { publicFile } from './production.mjs';
import { route, statisticsCss } from './statistics-patch.mjs';
import { statisticsUiCheck } from './statistics-qa.mjs';

const beforeCss = (await publicFile(route, 'css')).toString('utf8');
await statisticsUiCheck({ beforeCss, afterCss: beforeCss + statisticsCss, phase: 'preview' });
