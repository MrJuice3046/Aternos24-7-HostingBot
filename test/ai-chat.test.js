'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SYSTEM_PROMPT, createAiChat } = require('../lib/ai-chat');

test('AI chat is off unless explicitly enabled with a key and a fetch implementation', () => {
  assert.equal(createAiChat({ enabled: false, apiKey: 'not-used' }), null);
  assert.equal(createAiChat({ enabled: true }), null);
});

test('AI chat uses the configured endpoint and keeps replies separate from game actions', async () => {
  let request;
  const assistant = createAiChat({
    enabled: true,
    apiKey: 'test-key',
    baseUrl: 'https://example.invalid/v1/',
    model: 'test-model',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'A creeper is a hostile mob.' } }] }) };
    }
  });
  const answer = await assistant.reply('Owner', 'What is a creeper?');
  assert.equal(answer, 'A creeper is a hostile mob.');
  assert.equal(request.url, 'https://example.invalid/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.body.model, 'test-model');
  assert.match(request.body.messages[0].content, /You have no tools and cannot execute commands/);
  assert.match(request.body.messages[1].content, /Owner: What is a creeper/);
  assert.match(SYSTEM_PROMPT, /never claim an action was completed/);
});

test('obvious password and token assignments are not forwarded to the AI provider', async () => {
  let calls = 0;
  const assistant = createAiChat({
    enabled: true,
    apiKey: 'test-key',
    fetchImpl: async () => { calls++; throw new Error('must not be called'); }
  });
  assert.equal(await assistant.reply('Owner', 'password: super-secret'), null);
  assert.equal(await assistant.reply('Owner', 'access_token=private-token'), null);
  assert.equal(calls, 0);
});
