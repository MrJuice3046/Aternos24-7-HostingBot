
## Runtime compatibility fix

The native stack was installed successfully, but Aternos was coalescing multiple protocol frames. The upstream parser path logged partial packets and discarded trailing bytes, causing login parsing failures. `lib/protocol-compat.js` now buffers split/coalesced frames before Mineflayer starts, preserving all native 26.3 packets.

The automated native protocol tests still pass after this patch. A full local bot startup smoke test requires the user’s untracked `settings.json`, which is intentionally not committed.
