// Empaqueta la demo en un solo HTML (CSS y JS en línea), listo para publicar
// como página: node build-demo.mjs  →  dist-demo/bellum-gentium.html
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, GENTIUM_DEMO: '1' } });
const dir = 'dist-demo';
const read = (file) => readFileSync(join(dir, file), 'utf8');
let html = read('index.html');

const cssFile = html.match(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"[^>]*>/);
const jsFile = html.match(/<script type="module"[^>]*src="\/(assets\/[^"]+\.js)"[^>]*><\/script>/);
html = html.replace(cssFile[0], () => `<style>${read(cssFile[1])}</style>`).replace(jsFile[0], '');
// El script va al final del body para que el DOM ya exista al ejecutarse.
const js = read(jsFile[1]).replaceAll('</script', '<\\/script');
html = html.replace('</body>', () => `<script type="module">${js}</script></body>`);

// La página publicada ya trae doctype, <html>, <head> y <body>: se quitan.
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>/g, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const out = `${head.trim()}\n${body.trim()}\n`;
writeFileSync(join(dir, 'bellum-gentium.html'), out);
console.log(`dist-demo/bellum-gentium.html (${Math.round(out.length / 1024)} KB)`);
