'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBotVersion, supportedVersions } = require('../lib/version');

const baseConfig = version => ({ server: { version } });

test('native stack includes protocol 777 for 26.3', () => {
  const versions = supportedVersions();
  assert.ok(versions.includes('26.1'));
  assert.ok(versions.includes('26.3'));
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

test('26.3 uses the native 26.3 client when protocol 777 is installed', () => {
  assert.deepEqual(resolveBotVersion(baseConfig('26.3'), {}), {
    version: '26.3',
    requested: '26.3',
    fallback: false
  });
});

test('explicit fallback configuration overrides the default mapping', () => {
  const config = { server: { version: '99.99', 'proxy-version-fallback': '26.3' } };
  assert.deepEqual(resolveBotVersion(config, {}), {
    version: '26.3',
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
