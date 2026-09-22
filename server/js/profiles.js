const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomUUID, createHash, randomInt } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Types = require('../../shared/js/gametypes');
const CAPACITY = 24;

function createItem(kind, roll = randomInt(100)) {
    if (!Types.isWeapon(kind) && !Types.isArmor(kind)) throw new Error('Not equipment');
    const rarity = roll < 70 ? 'common' : roll < 95 ? 'uncommon' : 'rare';
    return { id: randomUUID(), kind, rarity, bonus: rarity === 'rare' ? 3 : rarity === 'uncommon' ? 1 : 0 };
}
function createProfile(name) {
    const weapon = createItem(Types.Entities.SWORD1, 0);
    const armor = createItem(Types.Entities.CLOTHARMOR, 0);
    weapon.slot = 0;
    armor.slot = 1;
    return { id: randomUUID(), schemaVersion: 2, name, guildId: null, bank: { items: [], gold: 0 }, gold: 0, kills: 0, items: [weapon, armor], equipped: { weapon: weapon.id, armor: armor.id } };
}
function equipment(profile, slot) {
    return profile.items.find(item => item.id === profile.equipped[slot]);
}
function equip(profile, id) {
    const item = profile.items.find(item => item.id === id);
    if (!item) return false;
    profile.equipped[Types.isWeapon(item.kind) ? 'weapon' : 'armor'] = id;
    return true;
}
function discard(profile, id) {
    if (Object.values(profile.equipped).includes(id)) return false;
    const index = profile.items.findIndex(item => item.id === id);
    if (index < 0) return false;
    profile.items.splice(index, 1);
    return true;
}
function normalizeProfile(profile) {
    profile.id ||= randomUUID();
    profile.schemaVersion = 2;
    profile.bank ||= { items: [], gold: 0 };
    profile.guildId ||= null;
    const used = new Set();
    profile.items.forEach(item => {
        if (!Number.isInteger(item.slot) || item.slot < 0 || item.slot >= CAPACITY || used.has(item.slot)) {
            item.slot = Array.from({length: CAPACITY}, (_, i) => i).find(slot => !used.has(slot));
        }
        used.add(item.slot);
    });
    return profile;
}
function moveSlot(profile, id, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= CAPACITY) return false;
    const item = profile.items.find(item => item.id === id);
    if (!item) return false;
    const other = profile.items.find(other => other.slot === slot);
    if (other) other.slot = item.slot;
    item.slot = slot;
    return true;
}
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
module.exports = { ProfileStore, CAPACITY, createItem, createProfile, normalizeProfile, moveSlot, equipment, equip, discard };
