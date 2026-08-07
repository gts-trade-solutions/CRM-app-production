// Runs `next build` against a separate output directory so it can execute
// while `npm run dev` keeps serving from .next. Exists because Windows locks
// the dev server's open files, which makes a shared-directory build fail.
// Set NEXT_DIST_DIR yourself to override the default target.

import { spawn } from 'node:child_process';

const distDir = process.env.NEXT_DIST_DIR || '.next-build';
console.log(`Building into ${distDir} (dev server keeps .next)\n`);

const child = spawn('next', ['build'], {
  stdio: 'inherit',
  shell: true, // resolves next.cmd on Windows
  env: { ...process.env, NEXT_DIST_DIR: distDir },
});

child.on('exit', (code) => process.exit(code ?? 1));
