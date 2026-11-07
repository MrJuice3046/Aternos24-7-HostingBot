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
  ['survival', 'health awareness'], ['survival', 'automatic eating and hunger monitoring'],
  ['survival', 'critical-hunger passive-food hunting'], ['survival', 'low-health task interruption'],
  ['survival', 'safe path preference'], ['survival', 'night awareness'],
  ['survival', 'fall-risk awareness'], ['survival', 'water awareness'],
  ['movement', 'follow a player'], ['movement', 'stop and stay'],
  ['movement', 'pathfind to a target'], ['movement', 'recover a blocked route'],
  ['movement', 'idle movement'], ['movement', 'look around'],
  ['awareness', 'read nearby players'], ['awareness', 'read nearby entities'],
  ['awareness', 'check position'], ['awareness', 'check world time'],
  ['cooperation', 'execute allowlisted trusted-player tasks'], ['cooperation', 'reject untrusted world-changing commands'],
  ['cooperation', 'share status'], ['cooperation', 'respect stop commands'],
  ['communication', 'greet politely'], ['communication', 'answer help requests'],
  ['communication', 'answer status questions'], ['communication', 'avoid chat spam'],
  ['communication', 'summarize inventory'], ['communication', 'say when information is unknown'],
  ['planning', 'rank urgent needs'], ['planning', 'make bounded resource and survival plans'],
  ['planning', 'remember recent player interactions'], ['planning', 'cool down repeated actions'],
  ['building', 'craft and place a cooking station when requested'], ['building', 'use local furnaces and crafting tables'],
  ['exploration', 'pathfind to nearby logs and ores'], ['exploration', 'report exploration limits']
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
  if (!observation.connected) priorities.push({ action: 'wait_for_connection', priority: 100, reason: 'I am not connected to a server yet.' });
  if (Number.isFinite(observation.health) && observation.health <= 6) {
    priorities.push({ action: 'protect_health', priority: 95, reason: `My health is low (${Math.round(observation.health)}/20), so staying alive comes first.` });
  }
  if (Number.isFinite(observation.nearestThreatDistance) && observation.nearestThreatDistance <= 5) {
    priorities.push({ action: 'avoid_threat', priority: 90, reason: `A hostile mob is about ${Math.round(observation.nearestThreatDistance)} blocks away.` });
  }
  if (Number.isFinite(observation.food) && observation.food <= 6) {
    priorities.push({ action: 'find_food', priority: 75, reason: `My hunger is low (${Math.round(observation.food)}/20), so I should eat or find food.` });
  }
  if (observation.pendingTrustedCommand) priorities.push({ action: 'handle_trusted_command', priority: 70, reason: 'A trusted player asked me to do something.' });
  if (observation.followTarget) priorities.push({ action: 'follow_player', priority: 40, reason: `I am following ${observation.followTarget}.` });
  if (observation.pathBlocked) priorities.push({ action: 'recover_path', priority: 30, reason: 'My path is blocked, so I need another route.' });
  priorities.push({ action: 'observe_and_wait', priority: 10, reason: 'Nothing urgent is happening; I am observing and waiting.' });
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
  const follow = lower.match(/^follow\s+(?:to\s+)?([a-z0-9_]{1,16})[.! ]*$/i);
  if (follow) return { type: 'command', action: 'follow', args: ['me', 'here'].includes(follow[1]) ? [] : [follow[1]], raw: text };
  if (/^stay(?:\s+here)?[.! ]*$/i.test(lower)) return { type: 'command', action: 'stay', args: [], raw: text };
  if (/^(hi|hello|hey|yo|good morning|good evening)\b/i.test(lower)) return { type: 'greeting' };
  if (/\b(thanks|thank you|thx)\b/i.test(lower)) return { type: 'thanks' };
  if (/\b(what can you do|help me|your skills|your abilities)\b/i.test(lower)) return { type: 'help' };
  if (/\b(where are you|your position|your coordinates)\b/i.test(lower)) return { type: 'position' };
  if (/\b(are you okay|your status|how are you)\b/i.test(lower)) return { type: 'status' };
  if (/^(?:!bot\s+)?why\b/.test(lower) || /\bwhat\s+are\s+you\s+(?:doing|thinking)\b/.test(lower)) {
    return { type: 'why' };
  }
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
    lastReason: null,
    lastPriorities: [],
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
    const players = bot?.players || {};
    const exact = players[username]?.entity;
    if (exact) return exact;
    const matchedName = Object.keys(players).find(name => name.toLowerCase() === String(username).toLowerCase());
    return matchedName ? players[matchedName]?.entity || null : null;
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

  function describeThinking() {
    return state.lastReason || 'I have not decided anything yet; I am still getting my bearings.';
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
      return say('I can answer status/position and, for trusted players, come here, chop wood, mine nearby ores, bring food, cook, follow, or stay. Send stop to cancel a task.', username);
    }
    if (intent.type === 'position') {
      const p = bot.entity?.position;
      return say(p ? `I'm at ${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}.` : 'I do not know my position yet.', username);
    }
    if (intent.type === 'status') return say(describeStatus(), username);
    if (intent.type === 'why') return say(describeThinking(), username);
    if (intent.type !== 'command') return false;

    const action = intent.action;
    if (action === 'help' || action === 'skills') {
      return say('Try: come to me; chop wood; mine iron (nearby coal is a bonus; copper only if asked); bring food; cook; stop. Trusted players only. Also: !bot status | position | inventory | players | time | follow [name] | stay', username);
    }
    if (action === 'status') return say(describeStatus(), username);
    if (action === 'why') return say(describeThinking(), username);
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
    state.lastReason = priorities[0].reason || 'Nothing urgent is happening; I am observing and waiting.';
    state.lastPriorities = priorities.slice(0, 3).map(item => ({ action: item.action, reason: item.reason }));
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
    reply: say,
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
