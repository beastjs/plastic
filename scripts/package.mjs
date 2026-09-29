import { copyFile, cp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await rm('dist', { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
for (const file of ['manifest.json', 'popup.html']) {
  await copyFile(file, `dist/${file}`);
}
await cp('icons', 'dist/icons', { recursive: true });
