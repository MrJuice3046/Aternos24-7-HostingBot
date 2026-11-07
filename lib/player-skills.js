'use strict';

const DOMAINS = [
  'survival', 'movement', 'awareness', 'cooperation',
  'communication', 'planning', 'building', 'exploration'
];
const SCENARIOS = [
  'peaceful', 'hostile_nearby', 'low_health', 'low_food', 'night', 'rain',
  'water', 'cliff', 'blocked_path', 'player_greeting', 'player_request',
  'group_nearby', 'lost', 'inventory_full', 'disconnected', 'idle'
];
const STRATEGIES = [
  'observe', 'prioritize_safety', 'ask', 'follow', 'wait', 'retreat',
  'gather', 'craft', 'build', 'trade', 'navigate', 'explain', 'greet',
  'share', 'remember', 'recover'
];
const COMMUNICATION_STYLES = ['friendly', 'calm', 'concise', 'curious', 'direct'];

const CORE_SKILLS = [
  ['survival', 'health awareness'], ['survival', 'food awareness'],
  ['survival', 'threat awareness'], ['survival', 'retreat decision'],
  ['survival', 'safe path preference'], ['survival', 'night awareness'],
  ['survival', 'fall-risk awareness'], ['survival', 'water awareness'],
  ['movement', 'follow a player'], ['movement', 'stop and stay'],
  ['movement', 'pathfind to a target'], ['movement', 'recover a blocked route'],
  ['movement', 'idle movement'], ['movement', 'look around'],
  ['awareness', 'read nearby players'], ['awareness', 'read nearby entities'],
  ['awareness', 'check position'], ['awareness', 'check world time'],
  ['cooperation', 'obey trusted-player commands'], ['cooperation', 'reject untrusted movement commands'],
  ['cooperation', 'share status'], ['cooperation', 'respect stop commands'],
  ['communication', 'greet politely'], ['communication', 'answer help requests'],
  ['communication', 'answer status questions'], ['communication', 'avoid chat spam'],
  ['communication', 'summarize inventory'], ['communication', 'say when information is unknown'],
  ['planning', 'rank urgent needs'], ['planning', 'choose one safe next action'],
  ['planning', 'remember recent player interactions'], ['planning', 'cool down repeated actions'],
  ['building', 'identify future build-task hooks'], ['building', 'identify future crafting-task hooks'],
  ['exploration', 'identify future navigation-task hooks'], ['exploration', 'report exploration limits']
].map(([domain, name], index) => ({ id: `core-${String(index + 1).padStart(2, '0')}`, domain, name }));

const SKILL_VARIANT_COUNT = DOMAINS.length * SCENARIOS.length * STRATEGIES.length * COMMUNICATION_STYLES.length;

function* iterateSkillVariants() {
  let index = 0;
  for (const domain of DOMAINS) {
    for (const scenario of SCENARIOS) {
      for (const strategy of STRATEGIES) {
        for (const style of COMMUNICATION_STYLES) {
          index++;
          yield {
            id: `variant-${String(index).padStart(5, '0')}`,
            domain,
            scenario,
            strategy,
            communicationStyle: style
          };
        }
      }
    }
  }
}

function getSkillCatalogSummary() {
  return {
    coreSkills: CORE_SKILLS.length,
    generatedVariants: SKILL_VARIANT_COUNT,
    domains: [...DOMAINS],
    scenarioCount: SCENARIOS.length,
    strategyCount: STRATEGIES.length,
    communicationStyles: [...COMMUNICATION_STYLES]
  };
}

function analyzeSituation(observation = {}) {
  const priorities = [];
  if (!observation.connected) priorities.push({ action: 'wait_for_connection', priority: 100 });
  if (Number.isFinite(observation.health) && observation.health <= 6) {
    priorities.push({ action: 'protect_health', priority: 95 });
  }
  if (Number.isFinite(observation.nearestThreatDistance) && observation.nearestThreatDistance <= 5) {
    priorities.push({ action: 'avoid_threat', priority: 90 });
  }
  if (Number.isFinite(observation.food) && observation.food <= 6) {
    priorities.push({ action: 'find_food', priority: 75 });
  }
  if (observation.pendingTrustedCommand) priorities.push({ action: 'handle_trusted_command', priority: 70 });
  if (observation.followTarget) priorities.push({ action: 'follow_player', priority: 40 });
  if (observation.pathBlocked) priorities.push({ action: 'recover_path', priority: 30 });
  priorities.push({ action: 'observe_and_wait', priority: 10 });
  priorities.sort((a, b) => b.priority - a.priority);
  return priorities;
}

function parseIntent(message) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const command = lower.match(/^!bot(?:\s+(.*))?$/);
  if (command) {
    const parts = (command[1] || 'help').trim().split(/\s+/).filter(Boolean);
    return { type: 'command', action: (parts[0] || 'help'), args: parts.slice(1), raw: text };
  }
  if (/^(hi|hello|hey|yo|good morning|good evening)\b/i.test(lower)) return { type: 'greeting' };
  if (/\b(thanks|thank you|thx)\b/i.test(lower)) return { type: 'thanks' };
  if (/\b(what can you do|help me|your skills|your abilities)\b/i.test(lower)) return { type: 'help' };
  if (/\b(where are you|your position|your coordinates)\b/i.test(lower)) return { type: 'position' };
  if (/\b(are you okay|your status|how are you)\b/i.test(lower)) return { type: 'status' };
  return { type: 'unknown' };
}

function createPlayerSkills({ bot, config = {}, GoalFollow, now = Date.now }) {
  const skillConfig = config['player-skills'] || {};
  const trustedUsers = new Set([
    ...(config.chat?.tpWhitelist || []),
    ...(skillConfig.owners || [])
  ].map(name => String(name).toLowerCase()));
  const lastReplyAt = new Map();
  const recentInteractions = new Map();
  const replyCooldownMs = Math.max(1000, Number(skillConfig.replyCooldownMs) || 4000);
  const state = {
    enabled: skillConfig.enabled !== false,
    mode: 'idle',
    followTarget: null,
    lastIntent: null,
    lastAction: 'observe_and_wait',
    lastThinkAt: 0,
    interactionCount: 0
  };

  function say(text, username) {
    if (!bot || typeof bot.chat !== 'function') return false;
    const timestamp = now();
    const key = String(username || 'server').toLowerCase();
    if (timestamp - (lastReplyAt.get(key) || 0) < replyCooldownMs) return false;
    lastReplyAt.set(key, timestamp);
    bot.chat(String(text).slice(0, 240));
    return true;
  }

  function isTrusted(username) {
    return trustedUsers.has(String(username).toLowerCase());
  }

  function getPlayerEntity(username) {
    return bot?.players?.[username]?.entity || null;
  }

  function stopFollowing() {
    if (bot?.pathfinder?.setGoal) bot.pathfinder.setGoal(null);
    if (typeof bot?.clearControlStates === 'function') bot.clearControlStates();
    state.mode = 'stay';
    state.followTarget = null;
  }

  function describeStatus() {
    const health = Number.isFinite(bot?.health) ? `${Math.round(bot.health)}/20 health` : 'health unknown';
    const food = Number.isFinite(bot?.food) ? `${Math.round(bot.food)}/20 food` : 'food unknown';
    return `I'm online; ${health}, ${food}, mode: ${state.mode}.`;
  }

  function handleChat(username, message) {
    if (!state.enabled || !bot || username === bot.username) return false;
    const intent = parseIntent(message);
    state.lastIntent = intent.type === 'command' ? `command:${intent.action}` : intent.type;
    state.interactionCount++;
    recentInteractions.set(String(username).toLowerCase(), now());

    if (intent.type === 'greeting') return say(`Hello, ${username}!`, username);
    if (intent.type === 'thanks') return say(`You're welcome, ${username}.`, username);
    if (intent.type === 'help') {
      return say('I can chat, report status/position, and follow or stay for trusted players. Try !bot help.', username);
    }
    if (intent.type === 'position') {
      const p = bot.entity?.position;
      return say(p ? `I'm at ${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}.` : 'I do not know my position yet.', username);
    }
    if (intent.type === 'status') return say(describeStatus(), username);
    if (intent.type !== 'command') return false;

    const action = intent.action;
    if (action === 'help' || action === 'skills') {
      return say('Skills: survival awareness, safe movement, trusted-player follow/stay, status, position, inventory and polite chat. !bot status | position | inventory | players | time | follow [name] | stay', username);
    }
    if (action === 'status') return say(describeStatus(), username);
    if (action === 'position') return handleChat(username, 'where are you');
    if (action === 'inventory') {
      const items = bot.inventory?.items?.() || [];
      const summary = items.length ? items.slice(0, 8).map(item => `${item.count} ${item.name}`).join(', ') : 'empty';
      return say(`Inventory: ${summary}${items.length > 8 ? ', and more' : ''}.`, username);
    }
    if (action === 'players') {
      const names = Object.keys(bot.players || {}).filter(name => name !== bot.username);
      return say(names.length ? `Players I can see: ${names.slice(0, 8).join(', ')}.` : 'I do not see other players.', username);
    }
    if (action === 'time') {
      const time = bot.time?.timeOfDay;
      return say(Number.isFinite(time) ? `World time is ${Math.floor(time)} ticks.` : 'World time is unavailable.', username);
    }
    if (!['follow', 'come', 'stay', 'stop'].includes(action)) {
      return say('I do not know that command. Try !bot help.', username);
    }
    if (!isTrusted(username)) return say('Movement commands are restricted to trusted players.', username);

    if (action === 'stay' || action === 'stop') {
      stopFollowing();
      return say('Okay, I will stay here.', username);
    }
    const targetName = intent.args[0] || username;
    const target = getPlayerEntity(targetName);
    if (!target) return say(`I cannot see ${targetName} right now.`, username);
    if (!bot.pathfinder?.setGoal || typeof GoalFollow !== 'function') {
      return say('Following is unavailable on this server.', username);
    }
    bot.pathfinder.setGoal(new GoalFollow(target, 2), true);
    state.mode = 'follow';
    state.followTarget = targetName;
    return say(`Following ${targetName}.`, username);
  }

  function think() {
    const entities = Object.values(bot?.entities || {});
    let nearestThreatDistance = Infinity;
    if (bot?.entity?.position?.distanceTo) {
      for (const entity of entities) {
        if (!entity || entity.type !== 'mob' || !entity.position) continue;
        nearestThreatDistance = Math.min(nearestThreatDistance, bot.entity.position.distanceTo(entity.position));
      }
    }
    const priorities = analyzeSituation({
      connected: Boolean(bot && bot.entity),
      health: bot?.health,
      food: bot?.food,
      nearestThreatDistance,
      followTarget: state.mode === 'follow' ? state.followTarget : null
    });
    state.lastAction = priorities[0].action;
    state.lastThinkAt = now();
    return priorities;
  }

  function snapshot() {
    return {
      ...state,
      recentPlayers: [...recentInteractions.keys()].slice(-10),
      catalog: getSkillCatalogSummary()
    };
  }

  return {
    handleChat,
    think,
    snapshot,
    stopFollowing,
    catalog: getSkillCatalogSummary()
  };
}

module.exports = {
  CORE_SKILLS,
  DOMAINS,
  SCENARIOS,
  STRATEGIES,
  COMMUNICATION_STYLES,
  SKILL_VARIANT_COUNT,
  iterateSkillVariants,
  getSkillCatalogSummary,
  analyzeSituation,
  parseIntent,
  createPlayerSkills
};
