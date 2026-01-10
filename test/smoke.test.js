import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
);

test('package metadata está configurado', () => {
  assert.equal(pkg.name, 'auto-copilot');
  assert.ok(pkg.bin?.['auto-copilot']);
});
