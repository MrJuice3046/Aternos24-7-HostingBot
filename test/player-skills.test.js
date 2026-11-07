'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CORE_SKILLS,
  SKILL_VARIANT_COUNT,
  iterateSkillVariants,
  getSkillCatalogSummary,
  analyzeSituation,
  parseIntent,
  GESTURES,
  createPlayerSkills
} = require('../lib/player-skills');

test('skill catalog exposes 40 core behaviors and more than 10,000 composable variants', () => {
  const summary = getSkillCatalogSummary();
  assert.equal(summary.coreSkills, 40);
  assert.ok(SKILL_VARIANT_COUNT >= 10000);
  assert.equal(SKILL_VARIANT_COUNT, 10240);
  assert.equal(CORE_SKILLS.length, 40);
  const variants = [...iterateSkillVariants()];
  assert.equal(variants.length, 10240);
  assert.equal(variants[0].id, 'variant-00001');
  assert.equal(variants.at(-1).id, 'variant-10240');
});

test('situation analysis ranks survival needs before follow and idle actions', () => {
  const priorities = analyzeSituation({
    connected: true,
    health: 4,
    food: 3,
    nearestThreatDistance: 2,
    followTarget: 'Owner'
  });
  assert.deepEqual(priorities.slice(0, 4).map(item => item.action), [
    'protect_health', 'avoid_threat', 'find_food', 'follow_player'
  ]);
  assert.equal(analyzeSituation({ connected: false })[0].action, 'wait_for_connection');
});

test('chat parser recognizes explicit bot commands and common social intents', () => {
  assert.deepEqual(parseIntent('!bot follow Steve'), {
    type: 'command', action: 'follow', args: ['steve'], raw: '!bot follow Steve'
  });
  assert.equal(parseIntent('Hello there!').type, 'greeting');
  assert.equal(parseIntent('what can you do?').type, 'help');
  assert.equal(parseIntent('can you swim?').type, 'capability');
  assert.deepEqual(parseIntent('wave'), { type: 'command', action: 'wave', args: [], raw: 'wave' });
  assert.equal(parseIntent('shake your head').action, 'shake');
  assert.equal(parseIntent('what did you hear?').type, 'senses');
  assert.equal(parseIntent('what effects do you have?').type, 'senses');
  assert.equal(parseIntent('have you ever died?').type, 'death');
  assert.equal(parseIntent('ordinary chat').type, 'unknown');
});

test('gesture commands perform actions and recent sound/effect cues can be recalled', async () => {
  let clock = 30000;
  const messages = [];
  const gestures = [];
  const bot = {
    username: 'AFKBot',
    entity: { position: { x: 1, y: 64, z: 1 }, yaw: 0 },
    players: {},
    entities: {},
    inventory: { items: () => [] },
    chat: message => messages.push(message),
    swingArm: () => gestures.push('swing'),
    setControlState: state => gestures.push(state),
    look: async () => {},
    pathfinder: { setGoal() {} },
    clearControlStates() {}
  };
  const skills = createPlayerSkills({
    bot,
    config: { 'player-skills': { replyCooldownMs: 1000 } },
    now: () => clock,
    sleep: async () => {}
  });
  assert.equal(skills.handleChat('Owner', 'wave'), true);
  await GESTURES.wave.run(bot, async () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(gestures.filter(value => value === 'swing').length, 6);
  skills.noteEvent('sound', { x: 3, y: 64, z: 1 }, 'Heard zombie growl about 2 blocks away');
  clock += 1001;
  assert.equal(skills.handleChat('Owner', 'what did you hear?'), true);
  assert.match(messages.at(-1), /zombie growl/i);
  clock += 1001;
  const deathMemory = { summary: () => 'I died once near a creeper.' };
  const withMemory = createPlayerSkills({ bot, config: {}, deathMemory, now: () => clock });
  assert.equal(withMemory.handleChat('Owner', 'have you ever died?'), true);
  assert.match(messages.at(-1), /creeper/i);
});

test('player-skill chat limits movement to trusted users and honors reply cooldowns', () => {
  let clock = 10000;
  const messages = [];
  const goals = [];
  const target = { username: 'Owner' };
  class GoalFollow {
    constructor(entity, distance) {
      this.entity = entity;
      this.distance = distance;
    }
  }
  const bot = {
    username: 'AFKBot',
    health: 20,
    food: 20,
    entity: { position: { x: 1, y: 64, z: 1 } },
    players: { Owner: { entity: target } },
    entities: {},
    inventory: { items: () => [] },
    chat: message => messages.push(message),
    pathfinder: { setGoal: (...args) => goals.push(args) },
    clearControlStates() {}
  };
  const skills = createPlayerSkills({
    bot,
    config: { chat: { tpWhitelist: ['Owner'] }, 'player-skills': { replyCooldownMs: 1000 } },
    GoalFollow,
    now: () => clock
  });

  assert.equal(skills.handleChat('Guest', '!bot follow Owner'), true);
  assert.match(messages.at(-1), /trusted players/i);
  clock += 1001;
  assert.equal(skills.handleChat('Owner', '!bot follow'), true);
  assert.equal(skills.snapshot().mode, 'follow');
  assert.equal(skills.snapshot().followTarget, 'Owner');
  assert.ok(goals[0][0] instanceof GoalFollow);
  assert.equal(skills.handleChat('Owner', 'hello'), false, 'per-player cooldown blocks repeated replies');
  clock += 1001;
  assert.equal(skills.handleChat('Owner', '!bot stay'), true);
  assert.equal(skills.snapshot().mode, 'stay');
  assert.deepEqual(goals.at(-1), [null]);
});

test('situation analysis attaches human-readable reasons to priorities', () => {
  const priorities = analyzeSituation({ connected: true, health: 4, food: 3, nearestThreatDistance: 2 });
  assert.match(priorities[0].reason, /health/i);
  assert.equal(analyzeSituation({ connected: false })[0].reason, 'I am not connected to a server yet.');
});

test('the bot can explain its current thinking when asked why', () => {
  let clock = 20000;
  const messages = [];
  const bot = {
    username: 'AFKBot',
    health: 20,
    food: 20,
    entity: { position: { x: 1, y: 64, z: 1 } },
    players: {},
    entities: {},
    inventory: { items: () => [] },
    chat: message => messages.push(message),
    pathfinder: { setGoal() {} },
    clearControlStates() {}
  };
  const skills = createPlayerSkills({
    bot,
    config: { chat: { tpWhitelist: ['Owner'] }, 'player-skills': { replyCooldownMs: 1000 } },
    GoalFollow: class {},
    now: () => clock
  });
  skills.think();
  assert.match(skills.snapshot().lastReason, /observing/i);
  assert.equal(skills.handleChat('Owner', 'what are you doing?'), true);
  assert.match(messages.at(-1), /observing/i);
  clock += 1001;
  assert.equal(skills.handleChat('Owner', '!bot why'), true);
  assert.match(messages.at(-1), /observing/i);
  clock += 1001;
  assert.equal(skills.handleChat('Owner', 'can you swim?'), true);
  assert.match(messages.at(-1), /chop wood/i);
});
