const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { ProfileStore, createItem, createProfile, equipment, equip, discard } = require('../server/js/profiles');
test('loot tiers and ownership rules', () => {
    const profile = createProfile('Hero');
    assert.equal(createItem(61, 0).bonus, 0);
    assert.equal(createItem(61, 70).bonus, 1);
    assert.equal(createItem(61, 95).bonus, 3);
    assert.throws(() => createItem(2));
    assert.equal(equip(profile, 'someone-elses-item'), false);
    assert.equal(discard(profile, profile.equipped.weapon), false);
    const sword = createItem(61, 95);
    profile.items.push(sword);
    assert.equal(equip(profile, sword.id), true);
    assert.equal(equipment(profile, 'weapon').bonus, 3);
    assert.equal(discard(profile, profile.items[0].id), true);
});
test('SQLite survives a store restart and token guesses cannot claim a character', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'bq-store-'));
    const filename = path.join(directory, 'characters.sqlite');
    let store = new ProfileStore(filename);
    try {
        const session = store.open('', 'Hero');
        session.profile.gold = 42;
        session.profile.items.push(createItem(61, 95));
        store.save(session);
        store.close();
        store = new ProfileStore(filename);
        assert.deepEqual(store.open(session.token, 'Fake').profile, session.profile);
        assert.equal(store.open('a'.repeat(64), 'Fake'), null);
        assert.equal(store.open('../bad', 'Fake'), null);
        assert.notEqual(store.open('', 'Hero').token, session.token);
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
