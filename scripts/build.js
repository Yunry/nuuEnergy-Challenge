import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const dist = path.join(ROOT, 'dist');

fs.mkdirSync(path.join(dist, 'src', 'browser'), { recursive: true });
for (const file of ['index.html', 'live.html', 'evaluation.html']) {
  fs.copyFileSync(path.join(ROOT, file), path.join(dist, file));
}
for (const file of fs.readdirSync(path.join(ROOT, 'src', 'browser'))) {
  if (file.endsWith('.js') || file.endsWith('.css')) {
    fs.copyFileSync(path.join(ROOT, 'src', 'browser', file), path.join(dist, 'src', 'browser', file));
  }
}
console.log('Built static frontend to ' + dist);
