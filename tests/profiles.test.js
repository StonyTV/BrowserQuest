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

test('fixed slots swap without duplication and bank transfers preserve item identity', () => {
    const { moveSlot, normalizeProfile } = require('../server/js/profiles');
    const { transferItem, transferGold } = require('../server/js/domain/bank');
    const profile = createProfile('Banker');
    const sword = createItem(61, 95);
    profile.items.push(sword);
    normalizeProfile(profile);
    assert.equal(sword.slot, 2);
    assert.equal(moveSlot(profile, sword.id, 23), true);
    assert.equal(moveSlot(profile, profile.items[0].id, 23), true);
    assert.equal(sword.slot, 0);
    assert.equal(moveSlot(profile, sword.id, -1), false);
    assert.equal(moveSlot(profile, 'forged', 1), false);
    assert.throws(() => transferItem(profile, profile.equipped.weapon, true));
    transferItem(profile, sword.id, true);
    assert.equal(profile.items.length, 2);
    assert.equal(profile.bank.items[0].id, sword.id);
    assert.throws(() => transferItem(profile, sword.id, true));
    transferItem(profile, sword.id, false);
    assert.equal(profile.bank.items.length, 0);
    assert.equal(new Set(profile.items.map(item => item.slot)).size, 3);
    profile.gold = 100;
    transferGold(profile, 40, true);
    assert.deepEqual([profile.gold, profile.bank.gold], [60,40]);
    for (const amount of [-1, 0, 1.5, Infinity, 41]) assert.throws(() => transferGold(profile, amount, false));
    transferGold(profile, 40, false);
    assert.equal(profile.gold, 100);
});
