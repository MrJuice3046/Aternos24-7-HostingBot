# Native Minecraft 26.3 Dependency Compatibility Matrix

**Status:** Experimental native protocol-777 implementation. Local component smoke tests pass; authorized server integration is still required for a full claim.

| Component | Resolved source | 26.3 role | Status |
|---|---|---|---|
| Mineflayer | `PrismarineJS/mineflayer` commit `78424bf5abf0f351b1a3751b2f8e0423ab54b350` | Client lifecycle, physics integration, movement tick-end behavior | Experimental upstream commit; local load and unit tests pass |
| minecraft-protocol | `PrismarineJS/node-minecraft-protocol#pc26_3`, commit `a3c018efbf1b8645f16427e7b4a8185ea4218ee2` | Protocol 777 packet serialization and state transitions | Experimental upstream branch; local protocol 777 resolution passes |
| minecraft-data | Official `PrismarineJS/minecraft-data#pc_26_3`, commit `e4cbec4b17815d6ce8d8ba991dd3b2d9d8f4a57d` | Blocks, items, entities, registries, protocol metadata | Vendored with the standard loader because the upstream data repository is not an installable npm package |
| prismarine-physics | Based on `1.11.1`, local patch adds `26.3` feature mappings | Liquid gravity and movement physics | Local loader smoke test passes; behavior still needs server integration testing |
| prismarine-chunk | Based on `1.41.0`, local patch maps `26.3` to the compatible 1.18 chunk implementation | Chunk decoding | Local loader smoke test passes; real chunk packets still need integration testing |
| mineflayer-pathfinder | `2.4.5` | Pathfinding and movement goals | Existing package; native 26.3 behavior not independently verified |

## Important distinction

This matrix records an experimental native stack, not a stable upstream release. Passing package and loader tests proves that protocol 777 definitions and local dispatch paths load. It does not prove a complete login, configuration-state transition, chunk stream, entity metadata stream, movement sequence, or long-running session. Those require an authorized native 26.3 server.
