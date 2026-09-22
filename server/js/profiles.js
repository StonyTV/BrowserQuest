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
    return { name, gold: 0, kills: 0, items: [weapon, armor], equipped: { weapon: weapon.id, armor: armor.id } };
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
class ProfileStore {
    constructor(filename) {
        if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
        this.db = new DatabaseSync(filename);
        this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS profiles (token_hash TEXT PRIMARY KEY, state TEXT NOT NULL)');
        this.sessions = new Map();
    }
    hash(token) { return createHash('sha256').update(token).digest('hex'); }
    open(token, name) {
        if (token) {
            if (!/^[a-f0-9]{64}$/.test(token)) return null;
            const row = this.db.prepare('SELECT state FROM profiles WHERE token_hash = ?').get(this.hash(token));
            return row ? { token, profile: JSON.parse(row.state) } : null;
        }
        const session = { token: randomBytes(32).toString('hex'), profile: createProfile(name) };
        this.save(session);
        return session;
    }
    save(session) {
        this.db.prepare('INSERT INTO profiles VALUES (?, ?) ON CONFLICT(token_hash) DO UPDATE SET state = excluded.state')
            .run(this.hash(session.token), JSON.stringify(session.profile));
    }
    close() { this.db.close(); }
}
module.exports = { ProfileStore, CAPACITY, createItem, createProfile, equipment, equip, discard };
