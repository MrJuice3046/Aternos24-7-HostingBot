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
  createPlayerSkills
} = require('../lib/player-skills');

test('skill catalog exposes 36 core behaviors and more than 10,000 composable variants', () => {
  const summary = getSkillCatalogSummary();
  assert.equal(summary.coreSkills, 36);
  assert.ok(SKILL_VARIANT_COUNT >= 10000);
  assert.equal(SKILL_VARIANT_COUNT, 10240);
  assert.equal(CORE_SKILLS.length, 36);
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
  assert.equal(parseIntent('ordinary chat').type, 'unknown');
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
