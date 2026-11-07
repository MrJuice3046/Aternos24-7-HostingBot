'use strict';

const { Vec3 } = require('vec3');
const { GoalGetToBlock, GoalNear } = require('mineflayer-pathfinder').goals;

const RESOURCE_SPECS = {
  logs: { blocks: name => name.endsWith('_log'), items: name => name.endsWith('_log'), tool: 'axe', minToolTier: 5, requiredTool: false },
  iron: { blocks: name => /^(?:deepslate_)?iron_ore$/.test(name), items: name => ['raw_iron', 'iron_ore', 'deepslate_iron_ore'].includes(name), tool: 'pickaxe', minToolTier: 3, requiredTool: true },
  coal: { blocks: name => /^(?:deepslate_)?coal_ore$/.test(name), items: name => ['coal', 'coal_ore', 'deepslate_coal_ore'].includes(name), tool: 'pickaxe', minToolTier: 5, requiredTool: false },
  copper: { blocks: name => /^(?:deepslate_)?copper_ore$/.test(name), items: name => ['raw_copper', 'copper_ore', 'deepslate_copper_ore'].includes(name), tool: 'pickaxe', minToolTier: 3, requiredTool: true },
  gold: { blocks: name => /^(?:deepslate_)?gold_ore$/.test(name), items: name => ['raw_gold', 'gold_ore', 'deepslate_gold_ore'].includes(name), tool: 'pickaxe', minToolTier: 2, requiredTool: true },
  diamond: { blocks: name => /^(?:deepslate_)?diamond_ore$/.test(name), items: name => ['diamond', 'diamond_ore', 'deepslate_diamond_ore'].includes(name), tool: 'pickaxe', minToolTier: 2, requiredTool: true },
  redstone: { blocks: name => /^(?:deepslate_)?redstone_ore$/.test(name), items: name => ['redstone', 'redstone_ore', 'deepslate_redstone_ore'].includes(name), tool: 'pickaxe', minToolTier: 2, requiredTool: true },
  lapis: { blocks: name => /^(?:deepslate_)?lapis_ore$/.test(name), items: name => ['lapis_lazuli', 'lapis_ore', 'deepslate_lapis_ore'].includes(name), tool: 'pickaxe', minToolTier: 3, requiredTool: true }
};
const PASSIVE_FOOD_ANIMALS = new Set(['cow', 'pig', 'sheep', 'chicken', 'rabbit', 'goat']);
const RAW_MEATS = new Set(['beef', 'porkchop', 'chicken', 'mutton', 'rabbit']);
const TOOL_TIERS = ['netherite', 'diamond', 'iron', 'stone', 'wooden', 'golden'];
const FUEL_NAMES = new Set(['coal', 'charcoal', 'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks', 'bamboo_planks']);

function createTaskExecutor({
  bot,
  mcData,
  config = {},
  defaultMovements,
  Movements,
  onStatus = () => {},
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  const options = config['player-skills'] || {};
  const taskOptions = options.tasks || {};
  const activeState = { current: null, promise: null };
  let eating = false;
  let lastAutoHuntAt = 0;
  const maxDurationMs = Math.max(15000, Number(taskOptions.maxDurationMs) || 180000);
  const maxActions = Math.max(1, Math.min(64, Number(taskOptions.maxActions) || 24));
  const maxDistance = Math.max(8, Math.min(64, Number(taskOptions.maxDistance) || 32));
  const maxPathMs = Math.max(5000, Math.min(60000, Number(taskOptions.pathTimeoutMs) || 20000));

  function isBusy() { return Boolean(activeState.current); }
  function report(text, username) { try { onStatus(String(text).slice(0, 220), username); } catch (_) {} }
  function check(ctx) {
    if (ctx.cancelled) throw Object.assign(new Error('Task cancelled'), { name: 'TaskCancelled' });
    if (!bot || !bot.entity || Date.now() - ctx.startedAt > maxDurationMs) {
      throw Object.assign(new Error('Task time limit reached'), { name: 'TaskTimeout' });
    }
  }
  async function wait(ms, ctx) {
    check(ctx);
    await sleep(ms);
    check(ctx);
  }
  function inventoryItems() { return bot?.inventory?.items?.() || []; }
  function countItems(predicate) {
    return inventoryItems().filter(item => predicate(item.name)).reduce((total, item) => total + item.count, 0);
  }
  function isUsableFood(item) {
    const food = mcData?.foods?.[item.type];
    return Boolean(food && food.foodPoints > 0 && !['rotten_flesh', 'poisonous_potato', 'pufferfish', 'spider_eye', 'chicken'].includes(item.name));
  }
  function foodCount() {
    return inventoryItems().filter(isUsableFood).reduce((total, item) => total + item.count, 0);
  }

  async function withPathTimeout(promise, ctx) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('Navigation took too long'), { name: 'TaskTimeout' })), maxPathMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
      if (ctx.cancelled) bot.pathfinder?.setGoal(null);
    }
  }

  function fallbackMovements() {
    if (typeof Movements !== 'function') return null;
    const allowDig = taskOptions.allowDigFallback === true;
    const allowBridge = taskOptions.allowScaffoldFallback === true;
    if (!allowDig && !allowBridge) return null;
    const moves = new Movements(bot, mcData);
    moves.canDig = allowDig;
    moves.allow1by1towers = allowBridge;
    moves.allowParkour = false;
    moves.maxDropDown = 2;
    moves.digCost = 12;
    moves.placeCost = 12;
    moves.liquidCost = 1000;
    moves.dontCreateFlow = true;
    moves.dontMineUnderFallingBlock = true;
    return moves;
  }

  async function navigate(goal, ctx) {
    check(ctx);
    if (!bot.pathfinder?.goto || !bot.pathfinder?.setMovements) throw new Error('Pathfinding is not available');
    bot.pathfinder.setMovements(defaultMovements);
    try {
      await withPathTimeout(bot.pathfinder.goto(goal), ctx);
      return 'safe';
    } catch (error) {
      if (ctx.cancelled || error.name === 'TaskCancelled') throw error;
      const fallback = fallbackMovements();
      if (!fallback) throw error;
      check(ctx);
      report('The safe route failed; retrying with the configured terrain-edit fallback.', ctx.username);
      bot.pathfinder.setMovements(fallback);
      try {
        await withPathTimeout(bot.pathfinder.goto(goal), ctx);
        return 'fallback';
      } finally {
        bot.pathfinder.setMovements(defaultMovements);
      }
    }
  }

  async function navigateToPlayer(username, ctx, radius = 3) {
    const player = bot.players?.[username]?.entity;
    if (!player?.position) throw new Error(`I cannot see ${username} right now`);
    const distance = bot.entity?.position?.distanceTo?.(player.position);
    const allowedDistance = Math.min(128, Number(ctx.plan.maxDistance) || maxDistance);
    if (Number.isFinite(distance) && distance > allowedDistance) {
      throw new Error(`You are ${Math.round(distance)} blocks away; the configured task limit is ${allowedDistance}`);
    }
    await navigate(new GoalNear(Math.floor(player.position.x), Math.floor(player.position.y), Math.floor(player.position.z), radius), ctx);
  }

  function selectTool(kind, minTier = TOOL_TIERS.length - 1) {
    const tools = inventoryItems().filter(item => item.name.includes(kind) && tierScore(item.name) <= minTier);
    tools.sort((a, b) => tierScore(a.name) - tierScore(b.name));
    return tools[0] || null;
  }
  function tierScore(name) {
    const tier = TOOL_TIERS.findIndex(value => name.startsWith(value));
    return tier < 0 ? TOOL_TIERS.length : tier;
  }
  async function equipTool(kind, ctx, minTier) {
    const tool = selectTool(kind, minTier);
    if (!tool) return false;
    check(ctx);
    if (bot.heldItem?.type !== tool.type || bot.heldItem?.metadata !== tool.metadata) await bot.equip(tool, 'hand');
    return true;
  }

  async function harvestBlock(block, expectedName, tool, ctx, requirements = {}) {
    check(ctx);
    if (!block?.position || !block.diggable || block.name === 'bedrock') return false;
    const position = block.position.clone ? block.position.clone() : new Vec3(block.position.x, block.position.y, block.position.z);
    await navigate(new GoalGetToBlock(position.x, position.y, position.z), ctx);
    check(ctx);
    const current = bot.blockAt(position);
    if (!current || !expectedName(current.name) || !current.diggable) return false;
    if (tool) {
      const equipped = await equipTool(tool, ctx, requirements.minToolTier);
      if (!equipped && requirements.requiredTool) {
        const material = TOOL_TIERS[requirements.minToolTier] || 'suitable';
        report(`I need a ${material} ${tool} before I can collect ${current.name}'s drop.`, ctx.username);
        return false;
      }
    }
    if (typeof bot.canDigBlock === 'function' && !bot.canDigBlock(current)) return false;
    await bot.dig(current, true);
    await wait(350, ctx);
    return true;
  }

  function resourceBlockPredicate(resource) {
    const spec = RESOURCE_SPECS[resource];
    return block => Boolean(block && spec && spec.blocks(block.name));
  }

  async function mineResources(plan, ctx) {
    let actions = 0;
    const completed = [];
    for (const resource of plan.resources || []) {
      const spec = RESOURCE_SPECS[resource];
      if (!spec) continue;
      const initial = countItems(spec.items);
      const target = Math.min(32, Math.max(1, Number(plan.amount) || 8));
      while (countItems(spec.items) - initial < target && actions < maxActions) {
        check(ctx);
        const block = bot.findBlock?.({ matching: resourceBlockPredicate(resource), maxDistance: Math.min(maxDistance, plan.maxDistance || maxDistance) });
        if (!block) {
          report(`I could not find ${resource} ore/logs within ${Math.min(maxDistance, plan.maxDistance || maxDistance)} blocks.`, ctx.username);
          break;
        }
        const before = countItems(spec.items);
        const mined = await harvestBlock(block, spec.blocks, spec.tool, ctx, spec);
        if (!mined) break;
        actions++;

        if (resource === 'iron' && (plan.bonusResources || []).includes('coal') && actions < maxActions) {
          const coal = bot.findBlock?.({ matching: resourceBlockPredicate('coal'), maxDistance: 8 });
          const coalBefore = countItems(RESOURCE_SPECS.coal.items);
          if (coal && await harvestBlock(coal, RESOURCE_SPECS.coal.blocks, 'pickaxe', ctx, RESOURCE_SPECS.coal)) {
            actions++;
            if (countItems(RESOURCE_SPECS.coal.items) <= coalBefore) report('I mined coal, but have not collected its drop yet.', ctx.username);
          }
        }
        if (countItems(spec.items) <= before) await wait(700, ctx);
      }
      completed.push(resource);
      if (actions >= maxActions) break;
    }
    return completed.length > 0;
  }

  async function gatherLogs(plan, ctx) {
    return mineResources({ ...plan, resources: ['logs'] }, ctx);
  }

  function nearestPassiveAnimal() {
    if (!bot.entity?.position) return null;
    return Object.values(bot.entities || {})
      .filter(entity => PASSIVE_FOOD_ANIMALS.has(entity?.name) && entity.position)
      .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0] || null;
  }

  async function huntFood(plan, ctx) {
    let attempts = 0;
    const amount = Math.min(16, Math.max(1, Number(plan.amount) || 4));
    while (foodCount() < amount && attempts < Math.min(8, maxActions)) {
      check(ctx);
      const animal = nearestPassiveAnimal();
      if (!animal) {
        report('I cannot see a safe food animal nearby.', ctx.username);
        break;
      }
      await navigate(new GoalNear(Math.floor(animal.position.x), Math.floor(animal.position.y), Math.floor(animal.position.z), 2), ctx);
      check(ctx);
      const weapon = selectTool('sword');
      if (weapon && (bot.heldItem?.type !== weapon.type || bot.heldItem?.metadata !== weapon.metadata)) await bot.equip(weapon, 'hand');
      for (let hit = 0; hit < 12 && bot.entities?.[animal.id] && attempts < maxActions; hit++) {
        check(ctx);
        if (bot.entity.position.distanceTo(animal.position) <= 4) {
          bot.attack(animal);
          attempts++;
        }
        await wait(650, ctx);
      }
      await wait(700, ctx);
      if (bot.pathfinder?.goal) bot.pathfinder.setGoal(null);
      if (foodCount() >= amount) break;
      if (bot.entities?.[animal.id]) {
        report(`I could not safely finish hunting ${animal.name}; stopping rather than pursuing indefinitely.`, ctx.username);
        break;
      }
    }
    return foodCount() > 0;
  }

  async function deliverFood(username, ctx, requestedAmount) {
    const player = bot.players?.[username]?.entity;
    if (!player?.position) throw new Error(`I collected food, but cannot find ${username} to deliver it`);
    await navigateToPlayer(username, ctx, 3);
    check(ctx);
    const foodStacks = inventoryItems().filter(isUsableFood);
    if (!foodStacks.length) throw new Error('I have no food items to drop off');
    let remaining = Math.max(1, Number(requestedAmount) || 4);
    const requested = remaining;
    for (const stack of foodStacks) {
      if (remaining <= 0) break;
      check(ctx);
      const count = Math.min(stack.count, remaining);
      if (typeof bot.toss === 'function') await bot.toss(stack.type, stack.metadata, count);
      else if (count === stack.count && typeof bot.tossStack === 'function') await bot.tossStack(stack);
      else throw new Error('This Mineflayer version cannot drop a partial food stack');
      remaining -= count;
    }
    const dropped = requested - remaining;
    report(`I dropped ${dropped} food item(s) nearby for you to pick up; Minecraft does not guarantee direct inventory transfer.`, username);
  }

  async function findOrCraftStation(itemName, ctx, allowCraft) {
    const existing = bot.findBlock?.({ matching: block => block?.name === itemName, maxDistance: 12 });
    if (existing) return existing;
    if (!allowCraft) return null;
    const stationItem = bot.registry?.itemsByName?.[itemName];
    if (!stationItem || typeof bot.recipesFor !== 'function' || typeof bot.craft !== 'function') return null;

    if (inventoryItems().some(item => item.type === stationItem.id)) {
      const placed = await placeCraftedBlock(itemName, ctx);
      if (placed) return placed;
    }

    let table = bot.findBlock?.({ matching: block => block?.name === 'crafting_table', maxDistance: 8 });
    if (!table && itemName === 'crafting_table') {
      const recipe = bot.recipesFor(stationItem.id, null, 1)[0];
      if (recipe) {
        await bot.craft(recipe, 1, null);
        await placeCraftedBlock('crafting_table', ctx);
        table = bot.findBlock?.({ matching: block => block?.name === 'crafting_table', maxDistance: 6 });
      }
    }
    if (!table && itemName === 'furnace') {
      table = await findOrCraftStation('crafting_table', ctx, true);
    }
    if (itemName === 'furnace' && table) {
      const recipe = bot.recipesFor(stationItem.id, null, 1, table)[0];
      if (!recipe) return null;
      await bot.craft(recipe, 1, table);
      return await placeCraftedBlock('furnace', ctx);
    }
    return table;
  }

  async function placeCraftedBlock(itemName, ctx) {
    check(ctx);
    const itemId = bot.registry?.itemsByName?.[itemName]?.id;
    const stack = inventoryItems().find(item => item.type === itemId);
    if (!stack || typeof bot.placeBlock !== 'function') return null;
    await bot.equip(stack, 'hand');
    const here = bot.entity.position.floored();
    const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of offsets) {
      const ref = bot.blockAt(new Vec3(here.x + dx, here.y - 1, here.z + dz));
      const target = bot.blockAt(new Vec3(here.x + dx, here.y, here.z + dz));
      if (!ref || ref.boundingBox !== 'block' || !target || target.boundingBox !== 'empty') continue;
      if (ref.position.distanceTo(bot.entity.position) > 4.5) continue;
      await bot.placeBlock(ref, new Vec3(0, 1, 0));
      await wait(300, ctx);
      return bot.blockAt(new Vec3(ref.position.x, ref.position.y + 1, ref.position.z));
    }
    return null;
  }

  async function cookFood(plan, ctx) {
    const rawItems = inventoryItems().filter(item => [...RAW_MEATS].some(meat => item.name === meat));
    if (!rawItems.length) throw new Error('I have no raw meat to cook');
    let furnaceBlock = bot.findBlock?.({ matching: block => ['furnace', 'lit_furnace', 'smoker', 'lit_smoker'].includes(block?.name), maxDistance: 16 });
    if (!furnaceBlock) furnaceBlock = await findOrCraftStation('furnace', ctx, plan.allowCraftFurnace === true);
    if (!furnaceBlock) throw new Error('No nearby furnace. I need 8 cobblestone and a safe place to craft/place one.');
    await navigate(new GoalGetToBlock(furnaceBlock.position.x, furnaceBlock.position.y, furnaceBlock.position.z), ctx);
    check(ctx);
    const furnace = await bot.openFurnace(furnaceBlock);
    try {
      const raw = inventoryItems().find(item => [...RAW_MEATS].some(meat => item.name === meat));
      const fuel = inventoryItems().find(item => FUEL_NAMES.has(item.name) || item.name.endsWith('_planks'));
      if (!raw) throw new Error('Raw meat is no longer in my inventory');
      if (!fuel) throw new Error('I need coal, charcoal, or planks as furnace fuel');
      const amount = Math.min(raw.count, Number(plan.amount) || raw.count);
      const alreadyCooked = countItems(name => [...RAW_MEATS].some(meat => name === `cooked_${meat}`));
      await furnace.putInput(raw.type, raw.metadata, amount);
      await furnace.putFuel(fuel.type, fuel.metadata, Math.min(fuel.count, Math.max(1, Math.ceil(amount / 8))));
      const cookDeadline = Date.now() + Math.min(90000, taskOptions.cookTimeoutMs || 60000);
      while (Date.now() < cookDeadline) {
        check(ctx);
        if (furnace.outputItem()) await furnace.takeOutput();
        if (countItems(name => [...RAW_MEATS].some(meat => name === `cooked_${meat}`)) >= alreadyCooked + amount) break;
        await wait(1000, ctx);
      }
      if (furnace.outputItem()) await furnace.takeOutput();
      const cooked = countItems(name => [...RAW_MEATS].some(meat => name === `cooked_${meat}`)) - alreadyCooked;
      if (!cooked) throw new Error('The furnace did not produce cooked food before the time limit');
      return cooked;
    } finally {
      if (typeof bot.closeWindow === 'function') await bot.closeWindow(furnace).catch(() => {});
    }
  }

  async function run(plan, username, ctx) {
    if (plan.type === 'come') {
      await navigateToPlayer(username, ctx, plan.radius || 2);
      report(`I reached you, ${username}.`, username);
      return;
    }
    if (plan.type === 'gather') {
      const ok = await gatherLogs(plan, ctx);
      if (!ok) throw new Error('I could not gather the requested logs nearby');
      report('I finished gathering the logs I could safely reach.', username);
      return;
    }
    if (plan.type === 'mine') {
      const ok = await mineResources(plan, ctx);
      if (!ok) throw new Error('I could not reach or mine the requested resources');
      report(`Mining task finished. Copper is only included when you explicitly ask for it.`, username);
      return;
    }
    if (plan.type === 'food') {
      const ok = await huntFood(plan, ctx);
      if (!ok) throw new Error('I could not collect food nearby');
      if (plan.deliverTo) await deliverFood(plan.deliverTo, ctx, plan.amount);
      else report('I found food for survival.', username || undefined);
      return;
    }
    if (plan.type === 'cook') {
      const cooked = await cookFood(plan, ctx);
      report(`I cooked ${cooked} food item(s).`, username);
      return;
    }
    throw new Error('Unsupported task type');
  }

  function start(plan, username) {
    if (activeState.current) {
      report(`I am already working on ${activeState.current.plan.type}; send "stop" before changing tasks.`, username);
      return Promise.resolve(false);
    }
    const ctx = { plan, username, startedAt: Date.now(), cancelled: false };
    activeState.current = ctx;
    activeState.promise = (async () => {
      report(`I will ${plan.type === 'come' ? 'come to you' : `${plan.type} ${plan.resource || (plan.resources || []).join(' and ') || 'task'}`}.`, username);
      try {
        await run(plan, username, ctx);
        return true;
      } catch (error) {
        if (error.name === 'TaskCancelled' || ctx.cancelled) report('Task cancelled.', username);
        else report(`I could not finish: ${error.message}`, username);
        return false;
      } finally {
        bot.pathfinder?.setGoal(null);
        bot.pathfinder?.setMovements(defaultMovements);
        bot.clearControlStates?.();
        if (activeState.current === ctx) activeState.current = null;
        activeState.promise = null;
      }
    })();
    return activeState.promise;
  }

  function cancel() {
    if (!activeState.current) return false;
    activeState.current.cancelled = true;
    bot.pathfinder?.setGoal(null);
    bot.clearControlStates?.();
    return true;
  }

  async function survivalTick() {
    if (!bot?.entity || eating) return;
    if (activeState.current) {
      if (Number.isFinite(bot.health) && bot.health <= 4 && activeState.current.plan.type !== 'food') cancel();
      return;
    }
    const autoEatAt = Math.max(6, Math.min(19, Number(options.autoEatAtFood) || 14));
    if (config.combat?.['auto-eat'] !== false && Number.isFinite(bot.food) && bot.food <= autoEatAt && typeof bot.equip === 'function' && typeof bot.consume === 'function') {
      const foods = inventoryItems().filter(isUsableFood)
        .sort((a, b) => (mcData.foods[b.type]?.foodPoints || 0) - (mcData.foods[a.type]?.foodPoints || 0));
      if (foods.length) {
        eating = true;
        try {
          await bot.equip(foods[0], 'hand');
          if (bot.food <= autoEatAt && bot.entity) await bot.consume();
        } catch (_) {
          // Eating can fail if the server changes state or another plugin owns the item.
        } finally {
          eating = false;
        }
        return;
      }
    }
    if (options.autoHuntForFood === true && bot.food <= 6 && Date.now() - lastAutoHuntAt > 60000) {
      lastAutoHuntAt = Date.now();
      const plan = { type: 'food', amount: 1, deliverTo: null };
      void start(plan, bot.username);
    }
  }

  return {
    start,
    cancel,
    isBusy,
    survivalTick,
    current: () => {
      const current = activeState.current;
      if (!current) return null;
      const plan = current.plan;
      return {
        type: plan.type,
        resource: plan.resource,
        resources: plan.resources,
        amount: plan.amount,
        startedAt: current.startedAt
      };
    }
  };
}

module.exports = { RESOURCE_SPECS, PASSIVE_FOOD_ANIMALS, createTaskExecutor };
