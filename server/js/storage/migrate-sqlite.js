const { DatabaseSync } = require('node:sqlite');
const { normalizeProfile } = require('../profiles');

// Import once, atomically. A rerun cannot replace progress earned in MongoDB.
async function migrateSqlite(filename, store) {
    const marker = store.db.collection('migrations');
    if (await marker.findOne({ _id: 'sqlite-v1' })) return { alreadyImported: true };
    const source = new DatabaseSync(filename, { readOnly: true });
    let profiles, guilds;
    try {
        source.exec('BEGIN');
        profiles = source.prepare('SELECT token_hash, state FROM profiles').all().map(row => ({ _id: row.token_hash, revision: 0, state: normalizeProfile(JSON.parse(row.state)) }));
        guilds = source.prepare('SELECT id, state FROM guilds').all().map(row => {
            const state = JSON.parse(row.state);
            return { _id: row.id, revision: 0, state, ...(state.members.length ? { activeName: state.name.toLocaleLowerCase(), activeTag: state.tag } : {}) };
        });
    } finally { source.close(); }
    await store.client.withSession(session => session.withTransaction(async () => {
        if (await store.db.collection('profiles').countDocuments({}, { session }) || await store.db.collection('guilds').countDocuments({}, { session })) {
            throw new Error('Migration requires an empty target database; existing progress was left unchanged.');
        }
        for (const profile of profiles) await store.db.collection('profiles').insertOne(profile, { session });
        for (const guild of guilds) await store.db.collection('guilds').insertOne(guild, { session });
        await marker.insertOne({ _id: 'sqlite-v1', importedAt: new Date(), profiles: profiles.length, guilds: guilds.length }, { session });
    }, { writeConcern: { w: 'majority' }, timeoutMS: 10000 }));
    return { profiles: profiles.length, guilds: guilds.length };
}
module.exports = { migrateSqlite };
