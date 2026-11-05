'use strict';

const minecraftData = require('minecraft-data');
const minecraftProtocol = require('minecraft-protocol');

const NATIVE_FALLBACKS = new Map([
  ['26.3', '26.1']
]);

function supportedVersions() {
  const dataVersions = new Set(
    (minecraftData.versions?.pc || [])
      .map(version => version.minecraftVersion)
  );
  const protocolVersions = new Set(minecraftProtocol.supportedVersions || []);
  return [...dataVersions].filter(version => protocolVersions.has(version));
}

function resolveBotVersion(config = {}, env = process.env) {
  const configured = String(config.server?.version || '').trim();
  if (!configured) return { version: false, requested: '', fallback: false };

  const supported = new Set(supportedVersions());
  if (supported.has(configured)) {
    return { version: configured, requested: configured, fallback: false };
  }

  const fallback = String(
    env.MINECRAFT_VERSION_FALLBACK ||
    config.server?.['proxy-version-fallback'] ||
    NATIVE_FALLBACKS.get(configured) ||
    ''
  ).trim();

  if (fallback && supported.has(fallback)) {
    return { version: fallback, requested: configured, fallback: true };
  }

  const supportedList = [...supported].join(', ');
  throw new Error(
    `Minecraft version ${configured} is not supported by the installed protocol stack. ` +
    `Supported versions: ${supportedList || 'none'}. ` +
    'Install a compatible PrismarineJS release or configure a supported version.'
  );
}

module.exports = { resolveBotVersion, supportedVersions };
