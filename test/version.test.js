'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBotVersion, supportedVersions } = require('../lib/version');

const baseConfig = version => ({ server: { version } });

test('official stack supports Minecraft 26.1 but not experimental 26.3', () => {
  const versions = supportedVersions();
  assert.ok(versions.includes('26.1'));
  assert.ok(!versions.includes('26.3'));
});

test('blank version keeps Mineflayer auto-detection', () => {
  assert.deepEqual(resolveBotVersion(baseConfig('')), {
    version: false,
    requested: '',
    fallback: false
  });
});

test('supported configured version is passed through unchanged', () => {
  assert.deepEqual(resolveBotVersion(baseConfig('26.1')), {
    version: '26.1',
    requested: '26.1',
    fallback: false
  });
});

test('26.3 falls back to the supported 26.1 client', () => {
  assert.deepEqual(resolveBotVersion(baseConfig('26.3'), {}), {
    version: '26.1',
    requested: '26.3',
    fallback: true
  });
});

test('explicit fallback configuration overrides the default mapping', () => {
  const config = { server: { version: '99.99', 'proxy-version-fallback': '26.1' } };
  assert.deepEqual(resolveBotVersion(config, {}), {
    version: '26.1',
    requested: '99.99',
    fallback: true
  });
});

test('unknown versions fail with an actionable error', () => {
  assert.throws(
    () => resolveBotVersion(baseConfig('99.99'), {}),
    /Minecraft version 99\.99 is not supported.*Supported versions:/s
  );
});
