const { test } = require('node:test');
const assert = require('node:assert/strict');
const CommandQueue = require('../server/js/command-queue');
const Gameplay = require('../server/js/domain/gameplay');
const { createProfile } = require('../server/js/profiles');

test('commands and disconnect wait for the preceding durable write', async () => {
    const queue = new CommandQueue();
    let release;
    const write = new Promise(resolve => { release = resolve; });
    const events = [];
    const first = queue.run(async () => { events.push('write'); await write; events.push('ack'); });
    const second = queue.run(() => events.push('next'));
    const close = queue.run(() => events.push('disconnect'));
    await Promise.resolve();
    assert.deepEqual(events, ['write']);
    release();
    await Promise.all([first, second, close]);
    assert.deepEqual(events, ['write', 'ack', 'next', 'disconnect']);
    assert.equal(queue.pending, 0);
});

test('a failed bank write changes neither live profile nor acknowledgement; queued commands stop', async () => {
    const failure = new Error('database unavailable');
    const reported = [];
    const queue = new CommandQueue(error => reported.push(error));
    const profile = createProfile('Saver'); profile.gold = 100;
    const messages = [];
    const player = { session: {token: 'test', profile}, near: () => true, serviceId: 1, send: message => messages.push(message), syncProfile: () => messages.push('profile') };
    const gameplay = new Gameplay({ profiles: {commit: async () => {throw failure;}}, getEntityById: () => ({type:'npc',kind:40,x:18,y:222}) });
    const first = queue.run(() => gameplay.handle(player, 'bank.gold', {amount:20,deposit:true}));
    let nextRan = false;
    const next = queue.run(() => { nextRan = true; });
    await assert.rejects(first, /unavailable/);
    await assert.rejects(next, /unavailable/);
    await queue.drain();
    assert.equal(player.session.profile, profile);
    assert.equal(profile.gold, 100);
    assert.equal(profile.bank.gold, 0);
    assert.deepEqual(messages, []);
    assert.deepEqual(reported, [failure]);
    assert.equal(nextRan, false);
});
