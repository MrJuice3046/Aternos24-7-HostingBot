'use strict';

const MAX_TASK_AMOUNT = 32;

function boundedAmount(text, fallback) {
  const match = String(text).match(/\b(\d{1,2})\b/);
  if (!match) return fallback;
  return Math.max(1, Math.min(MAX_TASK_AMOUNT, Number(match[1])));
}

function resourceRequested(text, resource) {
  const expression = new RegExp(`\\b${resource}\\b`, 'g');
  const clauses = String(text).split(/[.!?,;]+|\bbut\b|\bhowever\b/);
  for (const clause of clauses) {
    for (const match of clause.matchAll(expression)) {
      const before = clause.slice(0, match.index);
      const after = clause.slice(match.index + resource.length);
      if (/\b(?:don't|do not)\s+ignore\s*$/.test(before)) return true;
      const negatedBefore = /\b(?:don't|do not|never|avoid|not)\b.{0,28}$/.test(before);
      const negatedAfter = /^\s*(?:(?:is|are|was|were)\s+)?(?:not|unnecessary|optional)\b/.test(after);
      if (negatedBefore || negatedAfter) continue;
      return true;
    }
  }
  return false;
}

function parseTaskRequest(message, requester = '') {
  const text = String(message || '').trim();
  const lower = text.toLowerCase().replace(/[’]/g, "'");
  const affirmative = lower.replace(/\b(?:don't|do not|never|avoid|not)\b[^,.;]*/g, ' ').trim();
  if (!text) return null;

  if (/^(?:!bot\s+)?(?:stop|cancel|abort)(?:\s+(?:task|job|that))?[.! ]*$/i.test(text)) {
    return { type: 'cancel', requester };
  }
  if (/^!bot\s+come(?:\s+(?:to\s+me|here))?[.! ]*$/i.test(text)) {
    return { type: 'come', requester, radius: 2, maxDistance: 64 };
  }
  if (/\bcome\s+(?:to\s+)?(?:me|here)\b|\bcome\s+here\b/.test(affirmative)) {
    return { type: 'come', requester, radius: 2, maxDistance: 64 };
  }

  const amount = boundedAmount(affirmative, 8);
  if (/(?:chop|cut|gather|collect|get|bring).{0,35}\b(?:tree|trees|wood|logs?)\b|\b(?:tree|trees|wood|logs?)\b.{0,35}(?:chop|cut|gather|collect|get)/.test(affirmative)) {
    return { type: 'gather', requester, resource: 'logs', amount, maxDistance: 32 };
  }

  if (/\b(?:bring|get|find|collect|hunt|fetch)\b.{0,40}\b(?:food|foods|meat|something to eat)\b/.test(affirmative)) {
    return { type: 'food', requester, amount: Math.min(boundedAmount(affirmative, 4), 16), deliverTo: requester, maxDistance: 32 };
  }

  if (/\b(?:cook|smelt|roast|bake)\b/.test(affirmative)) {
    return { type: 'cook', requester, food: 'meat', amount: Math.min(amount, 16), allowCraftFurnace: true };
  }

  if (/\b(?:mine|mining|dig|get|gather|collect)\b/.test(affirmative)) {
    const resources = [];
    const bonusResources = [];
    if (resourceRequested(lower, 'iron')) resources.push('iron');
    if (resourceRequested(lower, 'coal')) resources.push('coal');
    if (resourceRequested(lower, 'copper')) resources.push('copper');
    if (resourceRequested(lower, 'gold')) resources.push('gold');
    if (resourceRequested(lower, 'diamond')) resources.push('diamond');
    if (resourceRequested(lower, 'redstone')) resources.push('redstone');
    if (resourceRequested(lower, 'lapis')) resources.push('lapis');
    if (resources.length) {
      const explicitCopper = resources.includes('copper');
      if (resources.includes('iron') && !resources.includes('coal') && !/\bcoal\b/.test(lower)) bonusResources.push('coal');
      const priority = ['iron', 'coal', 'gold', 'diamond', 'redstone', 'lapis', 'copper'];
      resources.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
      return {
        type: 'mine',
        requester,
        resources: [...new Set(resources)],
        bonusResources,
        amount,
        maxDistance: 32,
        copperOnlyWhenRequested: true,
        copperExplicitlyRequested: explicitCopper
      };
    }
  }

  return null;
}

function authorizeTask(plan, username, trustedUsers = []) {
  if (!plan) return false;
  if (plan.type === 'cancel') return trustedUsers.some(name => String(name).toLowerCase() === String(username).toLowerCase());
  return trustedUsers.some(name => String(name).toLowerCase() === String(username).toLowerCase());
}

module.exports = { MAX_TASK_AMOUNT, parseTaskRequest, authorizeTask };
