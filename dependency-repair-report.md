# Dependency Repair Report

## Scope

Restored the project to official npm dependencies, removing the experimental Git-based Mineflayer and transitive protocol resolution.

## Changes

- Changed `minecraft-data` from `file:vendor/minecraft-data` to `^3.119.0`.
- Changed `mineflayer` from the pinned Git commit to `^4.39.0`.
- Regenerated `package-lock.json` from scratch.
- Confirmed the lockfile contains no `git+` or `github:` dependency resolutions.
- Retained the vendored packages and attribution files, including:
  - `vendor/prismarine-chunk/LICENSE`
  - `vendor/prismarine-physics/LICENSE`
  - `vendor/minecraft-data/package.json` MIT metadata
- Updated unit-test expectations to reflect the approved official stack: Minecraft 26.1 is supported, while 26.3 falls back to 26.1 rather than claiming native 26.3 support.

## Verification

- `npm ci --ignore-scripts`: passed.
- `npm ls --all`: passed with no invalid or missing dependencies.
- `npm test`: passed; 8 tests passed, 0 failed.
- `npm install --package-lock-only --ignore-scripts`: passed after regeneration; lockfile remained consistent.
- Package metadata check: `minecraft-data@3.119.0`, `mineflayer@4.39.0`, and registry `minecraft-protocol@1.68.0` are installed.
- Vendor license checks: passed.

## Audit status

`npm audit` reports 13 vulnerabilities (1 low, 11 moderate, 1 high), including transitive issues in `diff`, `glob`, `minimatch`, `serialize-javascript`, and `uuid`. Some suggested fixes are breaking changes, including a forced Mineflayer downgrade. No `npm audit fix --force` was run, per the approved repair plan.

## Compatibility outcome

This repair intentionally restores reproducible official npm dependencies and stable support through Minecraft 26.1. Native Minecraft 26.3 support is not retained because no official npm release containing the required 26.3 data and protocol stack is available.
