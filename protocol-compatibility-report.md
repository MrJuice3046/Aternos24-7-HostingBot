# Minecraft Java 26.3 Compatibility Report

**Repository:** `itsdazzyprince3-sudo/Aternos24-7-HostingBot`
**Audited commit:** native 26.3 implementation commit pending
**Audit date:** 2026-11-06
**Status:** **Experimental native 26.3 stack; local protocol/data/physics/chunk smoke tests pass; server integration not verified**

## Executive finding

The runtime continues to require a user-provided private `settings.json`, as intended. The implementation now uses an installable local wrapper around the official 26.3 data tree, the exact upstream Mineflayer 26.3 commit, the upstream protocol-777 branch, and minimal local Prismarine physics/chunk dispatch patches.

Native Minecraft Java 26.3 support is assembled from upstream development sources rather than stable npm releases. The local stack resolves protocol **777**, data version **5023**, physics, and chunk dispatch. No full native 26.3 claim is made until an authorized server completes login, configuration, chunk, entity, movement, and sustained-session tests.

## Repository audit

The repository contains seven tracked files: `.gitignore`, `LICENSE`, `README.md`, `dependabot.yml`, `index.js`, `package.json`, and `package-lock.json`. There are no tracked tests, no tracked configuration template, and no tags or additional branches. The history contains 40 commits from 2025-12-26 through 2026-11-06. The latest commit removes `settings.json` and `launcher_accounts.json`, changes SIGINT/SIGTERM to immediate process exit, and replaces `latest` dependency ranges with `mineflayer@^4.39.0` and `minecraft-data@^3.119.0`.

`index.js` preserves the dashboard routes (`/`, `/tutorial`, `/health`, `/ping`), Mineflayer connection and reconnection logic, pathfinder, movement, combat, bed, chat, Discord webhook, error handling, and shutdown handlers. It directly imports `settings.json`, reads `minecraft-data` after spawn, and delegates protocol parsing and serialization to Mineflayer’s transitive `minecraft-protocol` and Prismarine packages.

## Dependency and protocol surface

The direct protocol-related dependencies are:

- Mineflayer commit `78424bf5abf0f351b1a3751b2f8e0423ab54b350`;
- vendored official minecraft-data commit `e4cbec4b17815d6ce8d8ba991dd3b2d9d8f4a57d`;
- `mineflayer-pathfinder@2.4.5`.

The lockfile resolves the upstream `pc26_3` protocol branch transitively through Mineflayer. Local vendored physics and chunk packages add only the missing 26.3 dispatch/feature entries documented in the dependency matrix.

The published Mineflayer documentation still lists stable support only through 26.1. This project therefore labels the native 26.3 stack experimental, despite local protocol/data resolution passing. [2]

Minecraft Java 26.3 is protocol version **777**, data version **5023**, and Java version **25**. [1] [5] The upstream minecraft-data issue records the 26.3 support request as open and links pull request #1300. The upstream Mineflayer 26.3 branch is commit `78424bf5abf0f351b1a3751b2f8e0423ab54b350`; it adds 26.3 to tested versions and points `minecraft-protocol` at the unreleased `pc26_3` branch. The corresponding node-minecraft-protocol branch is commit `a3c018efbf1b8645f16427e7b4a8185ea4218ee2`.

A material 26.3 behavior change is documented in Mineflayer issue #4189: [3] vanilla 26.3 servers enforce one position-bearing movement packet per client tick and require the serverbound `client_tick_end` packet to reset the counter. Published Mineflayer 4.39.0 does not send that packet; the upstream development fix sends it on supported versions. This means changing `server.version` or the bot’s version string cannot establish compatibility.

## Compatibility matrix

| Area | Current repository | 26.3 assessment |
|---|---|---|
| Protocol version detection | Vendored data plus upstream protocol branch | Resolves native 26.3 / protocol 777 locally |
| Handshake/login/configuration | Upstream Mineflayer commit and protocol branch | Local construction passes; live login pending |
| Play-state packet schemas | Official 26.3 data and protocol branch | Local package loads; live packet test pending |
| Registries/items/blocks/entities | Official 26.3 data tree | Loader resolves 26.3; live entity/chunk test pending |
| Chunks/world parsing | Local prismarine-chunk 26.3 dispatch patch | Loader passes; real chunk decode pending |
| Encryption/compression/keep-alive | Upstream protocol branch | Not independently verified against the target server |
| Movement/tick handling | Upstream Mineflayer 26.3 commit | Client tick-end code is present; sustained movement test pending |
| Dashboard/reconnect/features | Project code, independent of protocol version | Preserved; startup is blocked by missing config |

## Changes made after the read-only audit

- Added `settings.example.json` containing the historical configuration shape with placeholders and no credentials.
- Added this report.
- Updated `README.md` with the status, setup, and testing limitations.
- Added `test-results/compatibility-tests.txt` and `test-results/post-fix-tests.txt` with reproducible command output.
- Restored graceful SIGINT/SIGTERM shutdown so the bot closes timers, listeners, sockets, and the HTTP server cleanly.
- Corrected Discord webhook port selection for explicit HTTP/HTTPS URLs.
- Added `lib/version.js` to validate the installed protocol/data version intersection.
- Added the official 26.3 data tree under `vendor/minecraft-data` with the standard loader wrapper.
- Added local 26.3 mappings for `prismarine-physics` and `prismarine-chunk`.
- Added native protocol/data/physics/chunk smoke tests.

This remains experimental because the upstream 26.3 work is not a stable end-to-end release and a full authorized server integration test is still pending.

## Test results

- `npm install --ignore-scripts`: **passed**; experimental native stack installed.
- `node --check index.js`: **passed**.
- `npm test`: **passed**; eight tests covering native data/protocol resolution, physics/chunk loading, version selection, fallback behavior, and invalid configuration.
- `npm ls --depth=0`: **passed**; direct dependencies match the lockfile.
- Native data/protocol smoke test: **passed**; protocol 777 and data version 5023 resolve.
- Native physics/chunk loader smoke test: **passed** after local 26.3 dispatch patches.
- Native 26.3 login/handshake test: **not verified**; the authorized smoke test received `socketClosed` before spawn and did not prove a protocol failure.
- Packet serialization/deserialization against 26.3: **not verified** against the live target.
- Dashboard regression test: **passed after the fix** using a temporary ignored configuration; `/ping` returned `pong` and `/health` returned JSON.
- Graceful shutdown regression test: **passed**; SIGTERM logged the shutdown path and exited cleanly.
- Discord webhook port logic: **syntax-reviewed**; HTTP uses port 80 by default and HTTPS uses port 443 by default, with explicit URL ports honored. No live webhook request was made.
- `npm ci` reported 18 dependency vulnerabilities (3 low, 10 moderate, 4 high, 1 critical). No automatic audit fix was applied because it could introduce unrelated or breaking dependency changes.

## Remaining blockers and next step

A genuine stable native 26.3 delivery still requires an authorized vanilla or Paper 26.3 server to verify login, configuration, chunk/entity decoding, movement ordering, tick-end behavior, and graceful disconnect. Until those tests pass, the project must be labeled experimental native 26.3, not stable compatibility.

A proxy path such as ViaVersion/ViaProxy may allow a 26.1 client to reach a 26.3 server, but that is proxy-translated compatibility and does not satisfy native 26.3 support. It must be documented and tested separately.

## Sources

[1]: https://www.minecraft.net/en-us/article/minecraft-26-3-release-candidate-2 "Official Minecraft 26.3 release-candidate announcement"
[2]: https://prismarinejs.github.io/mineflayer/ "Mineflayer documentation and supported versions"
[3]: https://github.com/PrismarineJS/mineflayer/issues/4189 "Mineflayer 26.3 movement and client_tick_end issue"
[4]: https://github.com/PrismarineJS/mineflayer/discussions/4190 "Mineflayer 26.3 support discussion"
[5]: https://github.com/PrismarineJS/minecraft-data/issues/1299 "minecraft-data 26.3 support issue"
[6]: https://github.com/PrismarineJS/node-minecraft-protocol/tree/pc26_3 "node-minecraft-protocol 26.3 development branch"
[7]: https://github.com/PrismarineJS/mineflayer/tree/26.3 "Mineflayer 26.3 development branch"
