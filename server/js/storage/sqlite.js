// Legacy adapter, retained for migration and offline regression tests.
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createProfile, normalizeProfile } = require('../profiles');

class ProfileStore {
    constructor(filename) {
        if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
        this.db = new DatabaseSync(filename);
        this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS profiles (token_hash TEXT PRIMARY KEY, state TEXT NOT NULL)');
        this.db.exec('CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, state TEXT NOT NULL)');
        this.sessions = new Map();
        this.guilds = new Map(this.db.prepare('SELECT id, state FROM guilds').all().map(row => [row.id, JSON.parse(row.state)]));
    }
    hash(token) { return createHash('sha256').update(token).digest('hex'); }
    open(token, name) {
        if (token) {
            if (!/^[a-f0-9]{64}$/.test(token)) return null;
            const row = this.db.prepare('SELECT state FROM profiles WHERE token_hash = ?').get(this.hash(token));
            return row ? { token, profile: normalizeProfile(JSON.parse(row.state)) } : null;
        }
        const session = { token: randomBytes(32).toString('hex'), profile: createProfile(name) };
        this.save(session);
        return session;
    }
    save(session) {
        normalizeProfile(session.profile);
        this.db.prepare('INSERT INTO profiles VALUES (?, ?) ON CONFLICT(token_hash) DO UPDATE SET state = excluded.state')
            .run(this.hash(session.token), JSON.stringify(session.profile));
    }
    commit(sessions, guild) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            for (const session of sessions) this.save(session);
            if (guild) this.db.prepare('INSERT INTO guilds VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state').run(guild.id, JSON.stringify(guild));
            this.db.exec('COMMIT');
            if (guild) this.guilds.set(guild.id, guild);
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
    close() { this.db.close(); }
}
module.exports = { ProfileStore };
