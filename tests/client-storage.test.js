const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
test('local character caches never bleed between characters or replace the recoverable legacy cache', () => {
    const values = new Map([['data', '{invalid json']]);
    let Storage;
    vm.runInNewContext(readFileSync('client/js/storage.js', 'utf8'), {
        define: factory => { Storage = factory(); },
        Class: { extend: prototype => { function Class() { this.init(); } Object.assign(Class.prototype, prototype); return Class; } },
        localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
        Modernizr: { localstorage: true }
    });
    const storage = new Storage(); assert.equal(storage.hasAlreadyPlayed(), false);
    storage.selectCharacter('alice'); storage.initPlayer('Alice'); storage.incrementRatCount();
    storage.selectCharacter('bob'); assert.equal(storage.getRatCount(), 0); assert.equal(storage.hasAlreadyPlayed(), false);
    storage.initPlayer('Bob'); storage.selectCharacter('alice'); assert.equal(storage.data.player.name, 'Alice'); assert.equal(storage.getRatCount(), 1);
    assert.equal(values.get('data'), '{invalid json');
});
