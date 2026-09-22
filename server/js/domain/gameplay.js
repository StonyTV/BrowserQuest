const Social = require('./social');
const Bank = require('./bank');
const Crafting = require('./crafting');
const Harvesting = require('./harvesting');
const { RuleError, requireRule } = require('./rules');
const { moveSlot } = require('../profiles');
const content = require('../../../shared/content/social.json');

class Gameplay {
    constructor(world) { this.world = world; this.social = new Social(world); this.harvesting = new Harvesting(world); }
    serviceSpec(npc) {
        if (!npc) return null;
        const node = this.harvesting.nodes.get(npc.id);
        return node ? { name: node.resource.nodeName, services: ['harvest'], resource: node.resource, harvest: this.harvesting.info(npc.id) }
            : content.services.find(service => service.kind === npc.kind && (!service.position || (service.position.x === npc.x && service.position.y === npc.y)));
    }
    service(player, kind) {
        const npc = this.world.getEntityById(player.serviceId);
        const spec = this.serviceSpec(npc);
        requireRule(npc?.type === 'npc' && player.near(npc, 3) && spec?.services.includes(kind), 'Rendez-vous auprès du PNJ pour cette action.');
    }
    async handle(player, action, payload) {
        try {
            requireRule(payload && typeof payload === 'object' && !Array.isArray(payload), 'Commande invalide.');
            const social = this.social;
            switch (action) {
                case 'service.open': {
                    requireRule(Number.isSafeInteger(payload.id), 'PNJ invalide.');
                    const npc = this.world.getEntityById(payload.id);
                    const spec = this.serviceSpec(npc);
                    requireRule(npc?.type === 'npc' && player.near(npc, 3) && spec, 'Approchez-vous du PNJ.');
                    player.serviceId = npc.id;
                    social.event(player, 'service', { id: npc.id, ...spec });
                    break;
                }
                case 'resource.harvest':
                    requireRule(Number.isSafeInteger(payload.id), 'Ressource invalide.');
                    this.harvesting.start(player, payload.id); break;
                case 'craft.make': {
                    this.service(player, 'craft');
                    requireRule(Date.now() - (player.lastCraftAt || 0) >= 800, 'Laissez le temps à la forge de refroidir.');
                    const result = Crafting.craft(player.session.profile, payload.recipe);
                    await social.commit(player, result.profile); player.lastCraftAt = Date.now();
                    social.event(player, 'craft', { id: result.item.id, message: result.recipe.name + ' fabriquée · +' + result.recipe.experience + ' XP Forgeron' });
                    break;
                }
                case 'inventory.move': {
                    const profile = structuredClone(player.session.profile);
                    requireRule(moveSlot(profile, payload.id, payload.slot), 'Déplacement impossible.');
                    await social.commit(player, profile);
                    break;
                }
                case 'bank.item':
                case 'bank.gold': {
                    this.service(player, 'bank');
                    const profile = structuredClone(player.session.profile);
                    requireRule(typeof payload.deposit === 'boolean', 'Direction invalide.');
                    if (action === 'bank.item') Bank.transferItem(profile, payload.id, payload.deposit);
                    else Bank.transferGold(profile, payload.amount, payload.deposit);
                    await social.commit(player, profile);
                    break;
                }
                case 'guild.create': this.service(player, 'guild'); await social.createGuild(player, payload); break;
                case 'guild.invite': social.invite(player, 'guild', payload.id); break;
                case 'party.invite': social.invite(player, 'party', payload.id); break;
                case 'invitation.answer':
                    requireRule(typeof payload.accept === 'boolean', 'Réponse invalide.');
                    await social.answer(player, payload.id, payload.accept); break;
                case 'party.leave': social.leaveParty(player); break;
                case 'party.kick': social.leaveParty(player, payload.id); break;
                case 'guild.crest': await social.manageGuild(player, 'crest', payload); break;
                case 'guild.role': await social.manageGuild(player, 'role', payload); break;
                case 'guild.leave': await social.manageGuild(player, 'leave', payload); break;
                case 'guild.kick': await social.manageGuild(player, 'kick', payload); break;
                case 'chat.send': social.chat(player, payload.channel, payload.body); break;
                default: throw new RuleError('Action inconnue.');
            }
        } catch (error) {
            if (!(error instanceof RuleError)) throw error;
            this.social.event(player, 'notice', { error: true, action, message: error.message });
        }
    }
}
module.exports = Gameplay;
