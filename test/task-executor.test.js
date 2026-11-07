'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskExecutor } = require('../lib/task-executor');

function makeComeBot({ failTimes = 0 } = {}) {
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
        if (calls <= failTimes) throw Object.assign(new Error('No path'), { name: 'NoPath' });
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

test('a blocked safe route recovers on one retry without any terrain edits', async () => {
  const { bot, calls, movementProfiles, defaultMovements } = makeComeBot({ failTimes: 1 });
  let constructedFallback = false;
  const executor = createTaskExecutor({
    bot,
    config: { 'player-skills': { tasks: { allowDigFallback: false, allowScaffoldFallback: false } } },
    defaultMovements,
    Movements: class { constructor() { constructedFallback = true; } }
  });
  const result = await executor.start({ type: 'come' }, 'Owner');
  assert.equal(result, true);
  assert.equal(calls(), 2);
  assert.equal(constructedFallback, false);
  assert.ok(movementProfiles.every(movement => movement === defaultMovements));
});

test('without terrain fallback, persistent route failure ends the task safely', async () => {
  const { bot, calls, movementProfiles, defaultMovements } = makeComeBot({ failTimes: 2 });
  const executor = createTaskExecutor({
    bot,
    config: { 'player-skills': { tasks: { allowDigFallback: false, allowScaffoldFallback: false } } },
    defaultMovements
  });
  const result = await executor.start({ type: 'come' }, 'Owner');
  assert.equal(result, false);
  assert.equal(calls(), 2, 'one safe attempt plus one retry, nothing more');
  assert.ok(movementProfiles.every(movement => movement === defaultMovements));
});

test('configured terrain fallback is attempted only after safe retries fail', async () => {
  const { bot, calls, movementProfiles, defaultMovements } = makeComeBot({ failTimes: 2 });
  const executor = createTaskExecutor({
    bot,
    config: { 'player-skills': { tasks: { allowDigFallback: true, allowScaffoldFallback: true } } },
    defaultMovements,
    Movements: class { constructor() { this.canDig = false; this.allow1by1towers = false; } }
  });
  const result = await executor.start({ type: 'come' }, 'Owner');
  assert.equal(result, true);
  assert.equal(calls(), 3, 'safe attempt, safe retry, then fallback');
  assert.equal(movementProfiles[0], defaultMovements);
  assert.equal(movementProfiles[1], defaultMovements);
  const fallback = movementProfiles.find(movement => movement !== defaultMovements);
  assert.equal(fallback.canDig, true);
  assert.equal(fallback.allow1by1towers, true);
});

test('mining without a required pickaxe attempts to craft one from wood first', async () => {
  const crafted = [];
  const bot = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    username: 'Bot',
    players: { Owner: { entity: { position: { x: 10, y: 64, z: 0 } } } },
    registry: {
      itemsByName: {
        oak_planks: { id: 1 },
        stick: { id: 2 },
        crafting_table: { id: 3 },
        wooden_pickaxe: { id: 4 },
        stone_pickaxe: { id: 5 }
      }
    },
    inventory: { items: () => [{ name: 'oak_log', type: 9, metadata: 0, count: 3 }] },
    recipesFor: id => [{ id }],
    craft: async recipe => crafted.push(recipe.id),
    findBlock: () => ({ position: { x: 1, y: 64, z: 1 }, name: 'stone', diggable: true }),
    blockAt: () => ({ name: 'stone', diggable: true }),
    pathfinder: { setMovements() {}, setGoal() {}, goto: async () => {} },
    dig: async () => {},
    heldItem: null,
    equip: async () => {},
    clearControlStates() {}
  };
  const executor = createTaskExecutor({ bot, config: {} });
  const result = await executor.start({
    type: 'mine', resources: ['iron'], bonusResources: [], amount: 8, maxDistance: 32
  }, 'Owner');
  assert.equal(result, false, 'the task stops instead of mining without a proper tool');
  assert.deepEqual(crafted, [1, 2, 3, 4, 5], 'wood, table, and pickaxes are crafted in order before mining');
});

test('mining delivers the requested resources to the requester when asked', async () => {
  const tossed = [];
  const bot = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    username: 'Bot',
    players: { Owner: { entity: { position: { x: 10, y: 64, z: 0 } } } },
    inventory: { items: () => [
      { name: 'stone_pickaxe', type: 30, metadata: 0, count: 1 },
      { name: 'raw_iron', type: 21, metadata: 0, count: 5 }
    ] },
    findBlock: () => ({ position: { x: 1, y: 64, z: 1 }, name: 'iron_ore', diggable: true }),
    blockAt: () => ({ name: 'iron_ore', diggable: true }),
    dig: async () => {},
    toss: async (type, metadata, count) => tossed.push(count),
    equip: async () => {},
    pathfinder: { setMovements() {}, setGoal() {}, goto: async () => {} },
    clearControlStates() {}
  };
  const executor = createTaskExecutor({ bot, config: {}, sleep: async () => {} });
  const result = await executor.start({
    type: 'mine', resources: ['iron'], bonusResources: [], amount: 8, maxDistance: 32, deliverTo: 'Owner'
  }, 'Owner');
  assert.equal(result, true);
  assert.deepEqual(tossed, [5], 'the whole carried raw-iron stack is dropped for the requester');
});

test('tool selection skips nearly broken tools and uses a fresh one', async () => {
  const equipped = [];
  const bot = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    username: 'Bot',
    players: {},
    inventory: { items: () => [
      { name: 'stone_axe', type: 11, metadata: 0, count: 1, durabilityUsed: 58 },
      { name: 'iron_axe', type: 12, metadata: 0, count: 1, durabilityUsed: 0 }
    ] },
    findBlock: () => ({ position: { x: 1, y: 64, z: 1 }, name: 'oak_log', diggable: true }),
    blockAt: () => ({ name: 'oak_log', diggable: true }),
    dig: async () => {},
    equip: async item => { equipped.push(item.name); bot.heldItem = item; },
    pathfinder: { setMovements() {}, setGoal() {}, goto: async () => {} },
    clearControlStates() {}
  };
  const executor = createTaskExecutor({
    bot,
    mcData: { itemsByName: { stone_axe: { maxDurability: 60 }, iron_axe: { maxDurability: 250 } } },
    config: {},
    sleep: async () => {}
  });
  const result = await executor.start(
    { type: 'gather', resource: 'logs', resources: ['logs'], amount: 1, maxDistance: 32 },
    'Owner'
  );
  assert.equal(result, true);
  assert.deepEqual(equipped, ['iron_axe'], 'the nearly broken stone axe is never selected');
});
