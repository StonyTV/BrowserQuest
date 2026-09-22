const { MongoClient } = require('mongodb');
const { randomBytes, createHash } = require('node:crypto');
const { createProfile, normalizeProfile } = require('../profiles');

class MongoProfileStore {
    constructor(uri = 'mongodb://127.0.0.1:27019/?replicaSet=bq-local&directConnection=true', database = 'browserquest') {
        this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, timeoutMS: 5000, writeConcern: { w: 'majority' } });
        this.db = this.client.db(database);
        this.sessions = new Map();
        this.guilds = new Map();
        this.guildRevisions = new Map();
    }
    async connect() {
        await this.client.connect();
        const hello = await this.db.admin().command({ hello: 1 });
        if (!hello.setName) throw new Error('MongoDB requires a replica set for guild transactions. Run npm run db:up.');
        await this.db.collection('profiles').createIndex({ 'state.id': 1 }, { unique: true });
        for (const field of ['activeName', 'activeTag']) {
            await this.db.collection('guilds').createIndex({ [field]: 1 }, { unique: true, partialFilterExpression: { [field]: { $exists: true } } });
        }
        for await (const row of this.db.collection('guilds').find()) {
            this.guilds.set(row._id, row.state);
            this.guildRevisions.set(row._id, row.revision);
        }
        return this;
    }
    hash(token) { return createHash('sha256').update(token).digest('hex'); }
    async open(token, name) {
        if (token) {
            if (!/^[a-f0-9]{64}$/.test(token)) return null;
            const row = await this.db.collection('profiles').findOne({ _id: this.hash(token) });
            return row ? { token, revision: row.revision, profile: normalizeProfile(row.state) } : null;
        }
        const session = { token: randomBytes(32).toString('hex'), revision: 0, profile: createProfile(name) };
        await this.db.collection('profiles').insertOne({ _id: this.hash(session.token), revision: 0, state: session.profile });
        return session;
    }
    async writeProfile(character, session) {
        normalizeProfile(character.profile);
        const result = await this.db.collection('profiles').updateOne(
            { _id: this.hash(character.token), revision: character.revision },
            { $set: { state: character.profile }, $inc: { revision: 1 } }, { session });
        if (result.matchedCount !== 1) throw new Error('Character changed in another writer; refusing a stale save');
    }
    async save(character) {
        await this.writeProfile(character);
        character.revision++;
    }
    async commit(characters, guild) {
        if (!guild && characters.length === 1) return this.save(characters[0]);
        const revision = guild && this.guildRevisions.get(guild.id);
        await this.client.withSession(session => session.withTransaction(async () => {
            for (const character of characters) await this.writeProfile(character, session);
            if (!guild) return;
            const row = { _id: guild.id, state: guild, revision: (revision ?? -1) + 1 };
            if (guild.members.length) { row.activeName = guild.name.toLocaleLowerCase(); row.activeTag = guild.tag; }
            if (revision === undefined) await this.db.collection('guilds').insertOne(row, { session });
            else {
                const result = await this.db.collection('guilds').replaceOne({ _id: guild.id, revision }, row, { session });
                if (result.matchedCount !== 1) throw new Error('Guild changed in another writer; refusing a stale save');
            }
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000, timeoutMS: 5000 }));
        for (const character of characters) character.revision++;
        if (guild) { this.guilds.set(guild.id, guild); this.guildRevisions.set(guild.id, (revision ?? -1) + 1); }
    }
    async close() { await this.client.close(); }
}

module.exports = { MongoProfileStore };
