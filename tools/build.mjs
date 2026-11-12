import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Limit the native Go service used by esbuild on this Windows notebook.
// This affects compilation only; the installed application has no Go worker.
const env = { ...process.env, GOMAXPROCS: process.env.GOMAXPROCS ?? '1' };
for (const [script, args] of [
  ['typescript/bin/tsc', ['-b']],
  ['vite/bin/vite.js', ['build']],
]) {
  const result = spawnSync(process.execPath, [resolve('node_modules', script), ...args], { env, stdio: 'inherit' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
