const { requireRule } = require('./rules');
const { CAPACITY } = require('../profiles');
const config = require('../../../shared/content/social.json');
function transferItem(profile, id, deposit) {
    const source = deposit ? profile.items : profile.bank.items;
    const destination = deposit ? profile.bank.items : profile.items;
    const index = source.findIndex(item => item.id === id);
    requireRule(index >= 0, 'Objet introuvable.');
    requireRule(!deposit || !Object.values(profile.equipped).includes(id), 'Retirez cet équipement avant de le déposer.');
    requireRule(destination.length < (deposit ? config.bank.capacity : CAPACITY), 'Aucune case disponible.');
    const item = source[index];
    if (deposit) delete item.slot;
    else item.slot = Array.from({ length: CAPACITY }, (_, i) => i).find(slot => !destination.some(item => item.slot === slot));
    destination.push(item);
    source.splice(index, 1);
}
function transferGold(profile, amount, deposit) {
    requireRule(Number.isSafeInteger(amount) && amount > 0, 'Montant invalide.');
    const source = deposit ? profile : profile.bank;
    const destination = deposit ? profile.bank : profile;
    requireRule(source.gold >= amount && Number.isSafeInteger(destination.gold + amount), 'Solde insuffisant.');
    source.gold -= amount;
    destination.gold += amount;
}
module.exports = { transferItem, transferGold };
