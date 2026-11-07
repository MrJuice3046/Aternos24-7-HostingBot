'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskExecutor } = require('../lib/task-executor');

function makeComeBot({ failSafeRoute = false } = {}) {
  let calls = 0;
  const movementProfiles = [];
  const defaultMovements = { canDig: false, allow1by1towers: false };
  const bot = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    username: 'Bot',
    players: { Owner: { entity: { position: { x: 10, y: 64, z: 0 } } } },
    inventory: { items: () => [] },
    pathfinder: {
      setMovements: movement => movementProfiles.push(movement),
      setGoal() {},
      goto: async () => {
        calls++;
        if (failSafeRoute && calls === 1) throw Object.assign(new Error('No path'), { name: 'NoPath' });
      }
    },
    clearControlStates() {}
  };
  return { bot, calls: () => calls, movementProfiles, defaultMovements };
}

test('survival controller equips and eats suitable food when hunger is below threshold', async () => {
  const bread = { name: 'bread', type: 1, metadata: 0, count: 2 };
  const potato = { name: 'potato', type: 2, metadata: 0, count: 4 };
  let selected;
  let consumed = false;
  const bot = {
    entity: {},
    food: 5,
    inventory: { items: () => [bread, potato] },
    equip: async item => { selected = item; },
    consume: async () => { consumed = true; bot.food = 10; }
  };
  const executor = createTaskExecutor({
    bot,
    mcData: { foods: { 1: { foodPoints: 5 }, 2: { foodPoints: 1 } } },
    config: { combat: { 'auto-eat': true }, 'player-skills': { autoEatAtFood: 14 } }
  });
  await executor.survivalTick();
  assert.equal(selected, bread);
  assert.equal(consumed, true);
});

test('come uses a safe alternate path first and never edits terrain unless enabled', async () => {
  const { bot, calls, movementProfiles, defaultMovements } = makeComeBot({ failSafeRoute: true });
  let constructedFallback = false;
  const executor = createTaskExecutor({
    bot,
    config: { 'player-skills': { tasks: { allowDigFallback: false, allowScaffoldFallback: false } } },
    defaultMovements,
    Movements: class { constructor() { constructedFallback = true; } }
  });
  const result = await executor.start({ type: 'come' }, 'Owner');
  assert.equal(result, false);
  assert.equal(calls(), 1);
  assert.equal(constructedFallback, false);
  assert.ok(movementProfiles.every(movement => movement === defaultMovements));
});

test('configured terrain fallback is attempted only after the safe route fails', async () => {
  const { bot, calls, movementProfiles, defaultMovements } = makeComeBot({ failSafeRoute: true });
  const executor = createTaskExecutor({
    bot,
    config: { 'player-skills': { tasks: { allowDigFallback: true, allowScaffoldFallback: true } } },
    defaultMovements,
    Movements: class { constructor() { this.canDig = false; this.allow1by1towers = false; } }
  });
  const result = await executor.start({ type: 'come' }, 'Owner');
  assert.equal(result, true);
  assert.equal(calls(), 2);
  assert.equal(movementProfiles[0], defaultMovements);
  const fallback = movementProfiles.find(movement => movement !== defaultMovements);
  assert.equal(fallback.canDig, true);
  assert.equal(fallback.allow1by1towers, true);
});
