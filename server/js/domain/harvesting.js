const content = require('../../../shared/content/crafting.json');
const Crafting = require('./crafting');
const { requireRule, RuleError } = require('./rules');
// Resource availability belongs to the live world, like monster respawns. Rewards are durable.
class Harvesting {
    constructor(world) { this.world = world; this.nodes = new Map(); }
    spawn() {
        for (const spec of content.nodes) {
            const npc = this.world.addNpc(spec.kind, spec.x, spec.y);
            this.nodes.set(npc.id, { npc, resource: content.resources.find(resource => resource.nodeKind === spec.kind), readyAt: 0, job: null });
        }
    }
    info(id) {
        const node = this.nodes.get(id);
        if (!node) return null;
        return { state: node.job ? 'harvesting' : node.readyAt > Date.now() ? 'depleted' : 'ready',
            until: node.job?.endsAt || node.readyAt, actor: node.job?.player.name || '' };
    }
    start(player, id) {
        const node = this.nodes.get(id);
        requireRule(node && player.near(node.npc, 2), 'Approchez-vous de cette ressource.');
        requireRule(!player.movement.path.length && !player.target, 'Arrêtez-vous avant de récolter.');
        requireRule(![...this.nodes.values()].some(node => node.job?.player === player), 'Vous récoltez déjà une ressource.');
        requireRule(!node.job, 'Un autre aventurier récolte déjà ici.');
        requireRule(node.readyAt <= Date.now(), 'Cette ressource doit se renouveler.');
        const draft = structuredClone(player.session.profile);
        Crafting.addResource(draft, node.resource.kind, node.resource.quantity); // Capacity checked again at completion.
        node.job = { player, x: player.x, y: player.y, health: player.hitPoints, endsAt: Date.now() + node.resource.durationMs, queued: false };
        this.world.sendEntityInfo(node.npc);
        this.world.gameplay.social.event(player, 'harvest', { id, ...this.info(id), duration: node.resource.durationMs, name: node.resource.name });
    }
    valid(job) {
        return this.world.players[job.player.id] === job.player && !job.player.movement.path.length && job.player.hasEnteredGame && !job.player.isDead && !job.player.connection.closing &&
            job.player.x === job.x && job.player.y === job.y && !job.player.target && job.player.hitPoints >= job.health;
    }
    cancel(node) {
        const player = node.job.player; node.job = null;
        this.world.sendEntityInfo(node.npc);
        this.world.gameplay.social.event(player, 'harvest', { id: node.npc.id, state: 'cancelled', message: 'Récolte interrompue.' });
    }
    tick(now = Date.now()) {
        for (const node of this.nodes.values()) {
            if (!node.job) {
                if (node.readyAt && node.readyAt <= now) { node.readyAt = 0; this.world.sendEntityInfo(node.npc); }
                continue;
            }
            if (node.job.queued) continue;
            if (!this.valid(node.job)) { this.cancel(node); continue; }
            if (node.job.endsAt > now) continue;
            node.job.queued = true;
            void this.world.server.commands.run(() => this.finish(node)).catch(() => {});
        }
    }
    async finish(node) {
        const job = node.job;
        if (!this.valid(job)) { this.cancel(node); return; }
        const draft = structuredClone(job.player.session.profile), spec = node.resource;
        try { Crafting.addResource(draft, spec.kind, spec.quantity); }
        catch (error) {
            if (!(error instanceof RuleError)) throw error;
            this.cancel(node); this.world.gameplay.social.event(job.player, 'notice', { error: true, action: 'resource.harvest', message: error.message }); return;
        }
        Crafting.gain(draft, spec.profession, spec.experience);
        await this.world.gameplay.social.commit(job.player, draft);
        node.job = null; node.readyAt = Date.now() + spec.respawnMs;
        this.world.sendEntityInfo(node.npc);
        this.world.gameplay.social.event(job.player, 'harvest', { id: node.npc.id, state: 'complete', message: '+' + spec.quantity + ' ' + spec.name + ' · +' + spec.experience + ' XP métier' });
    }
}
module.exports = Harvesting;
