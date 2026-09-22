const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { MongoProfileStore } = require('../server/js/storage/mongo');
const { ProfileStore } = require('../server/js/storage/sqlite');
const { migrateSqlite } = require('../server/js/storage/migrate-sqlite');
const { createItem } = require('../server/js/profiles');
const uri = process.env.MONGODB_URI;
const enabled = { skip: process.env.BQ_TEST_MONGO !== '1' };

async function fixture(t) {
    const store = await new MongoProfileStore(uri, 'bq_test_store_' + randomUUID().replaceAll('-', '')).connect();
    t.after(async () => { await store.db.dropDatabase(); await store.close(); });
    return store;
}
function guild(profile, tag = 'TEST') {
    return { id: randomUUID(), name: tag, tag, crest: {frame:'shield',symbol:'sun',primary:'#123456',secondary:'#abcdef'}, members:[{id:profile.id,name:profile.name,role:'leader'}] };
}

test('Mongo transaction rolls back character charge when guild uniqueness fails', enabled, async t => {
    const store = await fixture(t);
    const hero = await store.open('', 'Leader');
    hero.profile.gold = 100; await store.save(hero);
    const existing = guild(hero.profile);
    await store.commit([], existing);
    const duplicate = guild(hero.profile);
    const draft = {...hero, profile: structuredClone(hero.profile)};
    draft.profile.gold -= 25; draft.profile.guildId = duplicate.id;
    await assert.rejects(store.commit([draft], duplicate), /duplicate key/);
    assert.deepEqual((await store.open(hero.token)).profile, hero.profile);
    assert.equal(store.guilds.has(duplicate.id), false);
    assert.equal(draft.revision, hero.revision);
    duplicate.name = 'Other'; duplicate.tag = 'OTHER';
    await store.commit([draft], duplicate);
    const reopened = await new MongoProfileStore(uri, store.db.databaseName).connect();
    try {
        assert.equal((await reopened.open(hero.token)).profile.gold, 75);
        assert.equal((await reopened.open(hero.token)).profile.guildId, duplicate.id);
        assert.deepEqual(reopened.guilds.get(duplicate.id), duplicate);
    } finally { await reopened.close(); }
});

test('Mongo refuses stale character and guild writers instead of losing progress', enabled, async t => {
    const store = await fixture(t);
    const hero = await store.open('', 'Owner');
    const stale = await store.open(hero.token);
    hero.profile.gold = 42; await store.save(hero);
    stale.profile.gold = 999;
    await assert.rejects(store.save(stale), /stale save/);
    assert.equal((await store.open(hero.token)).profile.gold, 42);
    assert.equal(await store.open('../invalid'), null);
    assert.equal(await store.open('a'.repeat(64)), null);
    const original = guild(hero.profile);
    await store.commit([], original);
    const other = await new MongoProfileStore(uri, store.db.databaseName).connect();
    try {
        await store.commit([], {...original, name:'Updated'});
        await assert.rejects(other.commit([], {...original, name:'Stale'}), /stale save/);
        assert.equal((await store.db.collection('guilds').findOne({_id:original.id})).state.name, 'Updated');
    } finally { await other.close(); }
});

test('SQLite migration preserves identity, slots, bank, guild and never overwrites later progress', enabled, async t => {
    const store = await fixture(t);
    const directory = mkdtempSync(path.join(tmpdir(), 'bq-migration-'));
    t.after(() => rmSync(directory, {recursive:true,force:true}));
    const filename = path.join(directory, 'characters.sqlite');
    const source = new ProfileStore(filename);
    const hero = source.open('', 'Legacy');
    hero.profile.gold = 50; hero.profile.bank.gold = 35;
    hero.profile.bank.items.push(createItem(61, 95));
    hero.profile.items[0].slot = 23;
    const oldGuild = guild(hero.profile, 'OLD'); hero.profile.guildId = oldGuild.id;
    source.commit([hero], oldGuild); source.close();
    assert.deepEqual(await migrateSqlite(filename, store), {profiles:1,guilds:1});
    const migrated = await store.open(hero.token);
    assert.deepEqual(migrated.profile, hero.profile);
    assert.deepEqual((await store.db.collection('guilds').findOne({_id:oldGuild.id})).state, oldGuild);
    migrated.profile.gold = 300; await store.save(migrated);
    assert.deepEqual(await migrateSqlite(filename, store), {alreadyImported:true});
    assert.equal((await store.open(hero.token)).profile.gold, 300);
    const unchanged = new ProfileStore(filename);
    try { assert.deepEqual(unchanged.open(hero.token).profile, hero.profile); }
    finally { unchanged.close(); }
});

test('migration refuses a populated target without importing any partial state', enabled, async t => {
    const store = await fixture(t);
    const directory = mkdtempSync(path.join(tmpdir(), 'bq-migration-'));
    t.after(() => rmSync(directory, {recursive:true,force:true}));
    const filename = path.join(directory, 'characters.sqlite');
    const source = new ProfileStore(filename); source.open('', 'Legacy'); source.close();
    await store.open('', 'Existing');
    await assert.rejects(migrateSqlite(filename, store), /empty target/);
    assert.equal(await store.db.collection('profiles').countDocuments(), 1);
    assert.equal(await store.db.collection('migrations').countDocuments(), 0);
});
