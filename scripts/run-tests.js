'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const testDir = path.resolve(__dirname, '..', 'test');
const projectRoot = path.resolve(__dirname, '..');
const testFiles = fs.readdirSync(testDir)
  .filter(file => file.endsWith('.test.js'))
  .sort()
  .map(file => path.join(testDir, file));

const env = { ...process.env };
delete env.NODE_OPTIONS;
delete env.NODE_TEST_CONTEXT;

const syntaxCheck = spawnSync(process.execPath, ['--check', path.join(projectRoot, 'index.js')], {
  cwd: projectRoot,
  env,
  stdio: 'inherit'
});

if (syntaxCheck.error || syntaxCheck.status !== 0) {
  if (syntaxCheck.error) console.error(syntaxCheck.error.message);
  process.exit(syntaxCheck.status ?? 1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: projectRoot,
  env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
