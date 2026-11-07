'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTaskRequest, authorizeTask, MAX_TASK_AMOUNT } = require('../lib/task-planner');

test('understands come, chop, food, cook, and stop requests', () => {
  assert.equal(parseTaskRequest('come to me', 'Owner').type, 'come');
  assert.equal(parseTaskRequest('!bot come', 'Owner').type, 'come');
  assert.equal(parseTaskRequest('go and chop tree', 'Owner').resource, 'logs');
  assert.deepEqual(parseTaskRequest('bring some foods', 'Owner'), {
    type: 'food', requester: 'Owner', amount: 4, deliverTo: 'Owner', maxDistance: 32
  });
  assert.equal(parseTaskRequest('cook', 'Owner').type, 'cook');
  assert.equal(parseTaskRequest('stop', 'Owner').type, 'cancel');
});

test('mining prioritizes iron and incidental coal but excludes unrequested copper', () => {
  const iron = parseTaskRequest('mine iron', 'Owner');
  assert.deepEqual(iron.resources, ['iron']);
  assert.deepEqual(iron.bonusResources, ['coal']);
  assert.equal(iron.copperExplicitlyRequested, false);
  const explicit = parseTaskRequest('mine iron and coal', 'Owner');
  assert.deepEqual(explicit.resources, ['iron', 'coal']);
  assert.deepEqual(explicit.bonusResources, []);
  assert.deepEqual(parseTaskRequest('mine copper', 'Owner').resources, ['copper']);
  const skipCopper = parseTaskRequest('mine iron; copper is not necessary', 'Owner');
  assert.deepEqual(skipCopper.resources, ['iron']);
  assert.equal(skipCopper.copperExplicitlyRequested, false);
  assert.deepEqual(parseTaskRequest("mine iron but don't mine coal", 'Owner').bonusResources, []);
  assert.deepEqual(parseTaskRequest("mine iron and don't ignore coal", 'Owner').resources, ['iron', 'coal']);
});

test('resource quantities are bounded and tasks are restricted to trusted users', () => {
  const plan = parseTaskRequest('mine 99 iron', 'Owner');
  assert.equal(plan.amount, MAX_TASK_AMOUNT);
  assert.equal(authorizeTask(plan, 'oWnEr', ['Owner']), true);
  assert.equal(authorizeTask(plan, 'Guest', ['Owner']), false);
  assert.equal(parseTaskRequest('what is a creeper?'), null);
  assert.equal(parseTaskRequest("don't mine iron", 'Owner'), null);
});
