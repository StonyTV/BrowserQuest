const { randomBytes } = require('node:crypto');
const { createProfile, normalizeProfile, equipment } = require('../profiles');
const Progression = require('../domain/progression');
const { AuthError } = require('./service');
const SLOTS = 3;
function nameOf(value) {
    const name = typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
    if (!/^[\p{L}\p{N}][\p{L}\p{N} '-]{2,14}$/u.test(name)) throw new AuthError(400, 'Le nom doit contenir de 3 à 15 lettres, chiffres, espaces ou tirets.');
    return name;
}
class Characters {
    constructor(store) { this.store = store; this.rows = store.db.collection('profiles'); }
    async init() {
        await this.rows.createIndex({ ownerId: 1, accountSlot: 1 }, { unique: true, partialFilterExpression: { ownerId: { $exists: true } } });
        await this.rows.createIndex({ nameKey: 1 }, { unique: true, partialFilterExpression: { nameKey: { $exists: true } } });
        return this;
    }
    summary(row) {
        const profile = normalizeProfile(row.state);
        return { id: profile.id, name: profile.name, level: Progression.status(profile.experience).level,
            gold: profile.gold, armor: equipment(profile, 'armor').kind, weapon: equipment(profile, 'weapon').kind,
            active: this.store.sessions.has(profile.id) };
    }
    async list(ownerId) { return (await this.rows.find({ ownerId }).sort({ accountSlot: 1 }).toArray()).map(row => this.summary(row)); }
    async create(ownerId, input) {
        const name = nameOf(input), profile = createProfile(name);
        for (let accountSlot = 0; accountSlot < SLOTS; accountSlot++) {
            try {
                const row = { _id: randomBytes(32).toString('hex'), ownerId, accountSlot, nameKey: name.toLocaleLowerCase('fr'), revision: 0, state: profile };
                await this.rows.insertOne(row);
                return this.summary(row);
            } catch (error) {
                if (error.code !== 11000) throw error;
                if (error.keyPattern?.nameKey) throw new AuthError(409, 'Ce nom est déjà pris. Choisissez-en un autre.');
            }
        }
        throw new AuthError(409, 'Vos trois emplacements de personnage sont occupés.');
    }
    async legacy(ownerId, token) {
        if (!/^[a-f0-9]{64}$/.test(token || '')) throw new AuthError(404, 'Aucun ancien personnage à récupérer.');
        const row = await this.rows.findOne({ _id: this.store.hash(token), $or: [{ ownerId: { $exists: false } }, { ownerId }] });
        if (!row) throw new AuthError(404, 'Ce personnage est introuvable ou appartient déjà à un compte.');
        return row;
    }
    async claim(ownerId, token, input) {
        const row = await this.legacy(ownerId, token);
        if (row.ownerId === ownerId) return this.summary(row);
        if (this.store.sessions.has(row.state.id)) throw new AuthError(409, 'Déconnectez ce personnage avant de le récupérer.');
        const name = nameOf(input || row.state.name);
        for (let accountSlot = 0; accountSlot < SLOTS; accountSlot++) {
            try {
                const result = await this.rows.findOneAndUpdate({ _id: row._id, ownerId: { $exists: false } }, {
                    $set: { ownerId, accountSlot, nameKey: name.toLocaleLowerCase('fr'), 'state.name': name }, $inc: { revision: 1 }
                }, { returnDocument: 'after' });
                if (!result) throw new AuthError(409, 'Ce personnage vient d’être récupéré. Actualisez la page.');
                return this.summary(result);
            } catch (error) {
                if (error.code !== 11000) throw error;
                if (error.keyPattern?.nameKey) throw new AuthError(409, 'Ce nom est déjà pris. Choisissez un nouveau nom pour le récupérer.');
            }
        }
        throw new AuthError(409, 'Vos trois emplacements de personnage sont occupés.');
    }
}
module.exports = { Characters, SLOTS };
