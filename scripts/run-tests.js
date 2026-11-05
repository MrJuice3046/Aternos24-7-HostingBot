'use strict';

const fs = require('node:fs');
const path = require('node:path');

const testDir = path.resolve(__dirname, '..', 'test');
const testFiles = fs.readdirSync(testDir)
  .filter(file => file.endsWith('.test.js'))
  .sort();

for (const file of testFiles) {
  require(path.join(testDir, file));
}
