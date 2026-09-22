const { randomUUID } = require('node:crypto');
const content = require('../../../shared/content/crafting.json');
const { CAPACITY, createItem } = require('../profiles');
const { requireRule } = require('./rules');
const resource = kind => content.resources.find(entry => entry.kind === kind);
function level(experience = 0) { return content.levels.filter(threshold => experience >= threshold).length; }
function gain(profile, profession, amount) {
    profile.professions[profession] = Math.min(content.levels.at(-1), (profile.professions[profession] || 0) + amount);
}
function quantity(profile, kind) { return profile.items.filter(item => item.kind === kind).reduce((sum, item) => sum + item.quantity, 0); }
function addResource(profile, kind, amount) {
    const spec = resource(kind);
    requireRule(spec && Number.isSafeInteger(amount) && amount > 0, 'Ressource invalide.');
    const stacks = profile.items.filter(item => item.kind === kind);
    const room = stacks.reduce((sum, item) => sum + content.stackLimit - item.quantity, 0) + (CAPACITY - profile.items.length) * content.stackLimit;
    requireRule(room >= amount, 'Sac plein : libérez une case avant de récolter.');
    for (const item of stacks) {
        const added = Math.min(amount, content.stackLimit - item.quantity); item.quantity += added; amount -= added;
    }
    while (amount > 0) {
        const count = Math.min(amount, content.stackLimit);
        profile.items.push({ id: randomUUID(), kind, quantity: count, rarity: 'common', slot: freeSlot(profile) }); amount -= count;
    }
}
function freeSlot(profile) { return Array.from({ length: CAPACITY }, (_, i) => i).find(slot => !profile.items.some(item => item.slot === slot)); }
function craft(profile, id) {
    const recipe = content.recipes.find(entry => entry.id === id);
    requireRule(recipe, 'Recette inconnue.');
    requireRule(level(profile.professions[recipe.profession]) >= recipe.level, 'Votre niveau de métier est insuffisant.');
    requireRule(profile.gold >= recipe.gold, 'Vous n’avez pas assez de pièces.');
    for (const input of recipe.ingredients) requireRule(quantity(profile, input.kind) >= input.quantity, 'Des ressources manquent dans votre sac.');
    // Work on a draft: consuming the last stack can free the output slot in a full bag.
    const draft = structuredClone(profile);
    for (const input of recipe.ingredients) {
        let remaining = input.quantity;
        for (const item of draft.items.filter(item => item.kind === input.kind)) {
            const used = Math.min(item.quantity, remaining); item.quantity -= used; remaining -= used;
        }
        draft.items = draft.items.filter(item => item.quantity !== 0);
    }
    requireRule(draft.items.length < CAPACITY, 'Libérez une case pour l’équipement fabriqué.');
    draft.gold -= recipe.gold;
    const item = { ...createItem(recipe.output), slot: freeSlot(draft), craftedBy: profile.name };
    draft.items.push(item); gain(draft, recipe.profession, recipe.experience);
    return { profile: draft, item, recipe };
}
module.exports = { resource, level, gain, quantity, addResource, craft };
