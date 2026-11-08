import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateProject } from '../site/model.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = validateProject(JSON.parse(readFileSync(resolve(root, 'site/data/project.json'), 'utf8')));
const html = readFileSync(resolve(root, 'site/index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
  if (!existsSync(resolve(root, 'site', match[1].split('?')[0]))) throw new Error('Missing asset: ' + match[1]);
}
for (const script of ['site/app.js', 'site/model.js']) execFileSync(process.execPath, ['--check', resolve(root, script)]);
for (const path of ['site/styles.css', 'site/.nojekyll', '.github/workflows/pages.yml']) {
  if (!existsSync(resolve(root, path))) throw new Error('Missing deployment file: ' + path);
}
console.log('PASS: ' + project.tasks.length + ' tasks, ' + project.coverage.length + ' benchmark mappings, ' + project.trials.length + ' actual trial records.');
