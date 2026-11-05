# Dependency Repair Report

## Current configuration

The project now uses the experimental PrismarineJS development stack required for native Minecraft 26.3 support. This is intentional because the target Aternos server is running Fabric 26.3 (protocol 777).

## Changes

- Restored `minecraft-data` from `file:vendor/minecraft-data`, which contains the 26.3 data set.
- Restored Mineflayer at commit `78424bf5abf0f351b1a3751b2f8e0423ab54b350`.
- Restored the matching `minecraft-protocol` `pc26_3` Git dependency in `package-lock.json`.
- Retained the Termux-safe shell test launcher at `scripts/run-tests.sh`.
- Preserved the vendored license and attribution files.

## Verification

In the validation environment:

- `npm ci --ignore-scripts`: passed.
- `npm test`: passed; 8 tests passed, 0 failed.
- Native data check: Minecraft 26.3 resolves to protocol 777 and data version 5023.
- Native protocol check: `minecraft-protocol` reports 26.3 as supported.
- Native physics and chunk loading checks: passed.

The native 26.3 path is now selected by the existing version resolver, so the bot should report `Spawned on server (version: 26.3)` rather than falling back to 26.1.

## Installation note

This configuration intentionally uses Git dependencies rather than official npm-only releases. If Termux blocks Git dependencies, configure Git access for npm or install the dependencies in an environment that permits Git-based npm packages. Do not run `npm audit fix --force`, because it can replace the native 26.3 stack with incompatible versions.
