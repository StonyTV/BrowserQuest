const { randomUUID } = require('node:crypto');
const { requireRule, text } = require('./rules');
const config = require('../../../shared/content/social.json');
const Progression = require('./progression');

class Social {
    constructor(world) {
        this.world = world;
        this.parties = new Map();
        this.invitations = new Map();
        this.lastChat = new Map();
    }
    players() { return Object.values(this.world.players).filter(player => player.hasEnteredGame); }
    profile(player) { return player.session.profile; }
    guild(player) {
        const profile = this.profile(player);
        const guild = this.world.profiles.guilds.get(profile.guildId);
        return guild && guild.members.some(member => member.id === profile.id) ? guild : null;
    }
    party(player) { return [...this.parties.values()].find(party => party.members.includes(this.profile(player).id)); }
    findPlayer(id) { return this.players().find(player => this.profile(player).id === id); }
    event(player, type, data) { player.send([32, type, data]); }
    async commit(player, profile, guild) {
        const draft = profile && { ...player.session, profile };
        await this.world.profiles.commit(draft ? [draft] : [], guild);
        if (draft) { player.session = draft; player.syncProfile(); }
    }
    member(player) {
        return { id: this.profile(player).id, entityId: player.id, name: player.name, level: Progression.status(this.profile(player).experience).level, hp: player.hitPoints, maxHp: player.maxHitPoints, guildTag: this.guild(player)?.tag || '' };
    }
    publish() {
        const online = this.players();
        const players = online.map(player => this.member(player));
        for (const player of online) {
            const party = this.party(player);
            const guild = this.guild(player);
            this.event(player, 'social', {
                players,
                party: party ? { id: party.id, leader: party.leader, members: party.members.map(id => players.find(member => member.id === id)).filter(Boolean) } : null,
                guild: guild ? { ...guild, members: guild.members.map(member => ({...member, online: !!this.findPlayer(member.id)})) } : null,
                invitations: [...this.invitations.values()].filter(invite => invite.to === this.profile(player).id && invite.expires > Date.now())
            });
        }
        for (const player of online) this.world.sendEntityInfo(player);
    }
    async connect(player) {
        if (this.profile(player).guildId && !this.guild(player)) {
            await this.commit(player, {...this.profile(player), guildId: null});
        }
        this.publish();
    }
    disconnect(player) {
        this.leaveParty(player);
        this.lastChat.delete(this.profile(player).id);
        for (const [id, invite] of this.invitations) if (invite.to === this.profile(player).id || invite.from === this.profile(player).id) this.invitations.delete(id);
        this.publish();
    }
    validateCrest(value) {
        requireRule(value && config.crest.frames.includes(value.frame) && config.crest.symbols.includes(value.symbol), 'Blason invalide.');
        requireRule(typeof value.primary === 'string' && typeof value.secondary === 'string' && /^#[a-f\d]{6}$/i.test(value.primary) && /^#[a-f\d]{6}$/i.test(value.secondary), 'Couleur invalide.');
        return { frame: value.frame, symbol: value.symbol, primary: value.primary, secondary: value.secondary };
    }
    async createGuild(player, payload) {
        requireRule(!this.guild(player), 'Vous appartenez déjà à une guilde.');
        const profile = structuredClone(this.profile(player));
        requireRule(profile.gold >= config.guild.cost, 'La fondation coûte ' + config.guild.cost + ' pièces d’or.');
        const name = text(payload.name, config.guild.nameMin, config.guild.nameMax, 'Nom de guilde');
        const tag = text(payload.tag, config.guild.tagMin, config.guild.tagMax, 'Sigle').toUpperCase();
        requireRule(/^[A-Z0-9]+$/.test(tag), 'Le sigle utilise des lettres et chiffres.');
        requireRule(![...this.world.profiles.guilds.values()].some(guild => guild.members.length && (guild.name.toLocaleLowerCase() === name.toLocaleLowerCase() || guild.tag === tag)), 'Ce nom ou sigle est déjà utilisé.');
        const guild = { id: randomUUID(), name, tag, crest: this.validateCrest(payload.crest), members: [{ id: profile.id, name: profile.name, role: 'leader' }], createdAt: Date.now() };
        profile.gold -= config.guild.cost;
        profile.guildId = guild.id;
        await this.commit(player, profile, guild);
        this.publish();
    }
    invite(player, type, targetId) {
        const target = this.findPlayer(targetId);
        requireRule(target && target !== player, 'Ce joueur n’est pas disponible.');
        let group = type === 'guild' ? this.guild(player) : this.party(player);
        if (type === 'guild') {
            requireRule(group && group.members.find(member => member.id === this.profile(player).id).role !== 'member', 'Seuls les responsables invitent en guilde.');
            requireRule(!this.guild(target), 'Ce joueur appartient déjà à une guilde.');
            requireRule(group.members.length < config.guild.maxMembers, 'La guilde est complète.');
        } else {
            requireRule(!this.party(target), 'Ce joueur appartient déjà à un groupe.');
            if (!group) {
                group = { id: randomUUID(), leader: this.profile(player).id, members: [this.profile(player).id] };
                this.parties.set(group.id, group);
            }
            requireRule(group.leader === this.profile(player).id, 'Seul le chef invite dans le groupe.');
            requireRule(group.members.length < config.party.maxMembers, 'Le groupe est complet.');
        }
        const key = type + ':' + this.profile(target).id;
        requireRule(!this.invitations.has(key) || this.invitations.get(key).expires <= Date.now(), 'Une invitation est déjà en attente.');
        this.invitations.set(key, { id: key, type, from: this.profile(player).id, fromName: player.name, to: this.profile(target).id, groupId: group.id, label: type === 'guild' ? group.name : player.name, expires: Date.now() + config.party.inviteLifetimeMs });
        this.publish();
    }
    async answer(player, id, accept) {
        const invitation = this.invitations.get(id);
        requireRule(invitation && invitation.to === this.profile(player).id && invitation.expires > Date.now(), 'Invitation expirée.');
        if (!accept) { this.invitations.delete(id); this.publish(); return; }
        if (invitation.type === 'guild') {
            const guild = structuredClone(this.world.profiles.guilds.get(invitation.groupId));
            requireRule(guild && guild.members.some(member => member.id === invitation.from && member.role !== 'member'), 'Invitation annulée.');
            requireRule(!this.guild(player) && guild.members.length < config.guild.maxMembers, 'Impossible de rejoindre cette guilde.');
            const profile = { ...this.profile(player), guildId: guild.id };
            guild.members.push({ id: profile.id, name: profile.name, role: 'member' });
            await this.commit(player, profile, guild);
        } else {
            const party = this.parties.get(invitation.groupId);
            requireRule(party && party.leader === invitation.from && party.members.length < config.party.maxMembers && !this.party(player), 'Ce groupe n’est plus disponible.');
            party.members.push(this.profile(player).id);
        }
        this.invitations.delete(id);
        this.publish();
    }
    leaveParty(player, targetId = this.profile(player).id) {
        const party = this.party(player);
        if (!party) return;
        requireRule(targetId === this.profile(player).id || party.leader === this.profile(player).id, 'Seul le chef peut exclure un membre.');
        party.members = party.members.filter(id => id !== targetId);
        if (!party.members.includes(party.leader)) party.leader = party.members[0];
        if (!party.members.length) this.parties.delete(party.id);
        this.publish();
    }
    async manageGuild(player, action, payload) {
        const guild = structuredClone(this.guild(player));
        requireRule(guild, 'Vous n’appartenez à aucune guilde.');
        const self = guild.members.find(member => member.id === this.profile(player).id);
        if (action === 'crest') {
            requireRule(self.role === 'leader', 'Seul le meneur modifie le blason.');
            guild.crest = this.validateCrest(payload.crest);
        } else if (action === 'role') {
            const member = guild.members.find(member => member.id === payload.id);
            requireRule(self.role === 'leader' && member && member !== self && ['leader','officer','member'].includes(payload.role), 'Changement de rang impossible.');
            if (payload.role === 'leader') self.role = 'officer';
            member.role = payload.role;
        } else {
            const target = action === 'leave' ? self : guild.members.find(member => member.id === payload.id);
            requireRule(target && (target === self || self.role === 'leader'), 'Seul le meneur peut exclure un membre.');
            requireRule(target.role !== 'leader' || guild.members.length === 1, 'Transférez le rôle de meneur avant de partir.');
            guild.members = guild.members.filter(member => member !== target);
            const online = this.findPlayer(target.id);
            await this.commit(online || player, online ? {...this.profile(online), guildId: null} : null, guild);
            this.publish();
            return;
        }
        await this.commit(player, null, guild);
        this.publish();
    }
    chat(player, channel, body) {
        requireRule(typeof channel === 'string', 'Canal inconnu.');
        const spec = Object.hasOwn(config.channels, channel) && config.channels[channel];
        requireRule(spec, 'Canal inconnu.');
        body = text(body, 1, 180, 'Message');
        const party = this.party(player), guild = this.guild(player);
        requireRule(channel !== 'party' || party, 'Rejoignez un groupe pour utiliser ce canal.');
        requireRule(channel !== 'guild' || guild, 'Rejoignez une guilde pour utiliser ce canal.');
        const key = this.profile(player).id;
        requireRule(Date.now() >= (this.lastChat.get(key) || 0), 'Patientez avant le prochain message.');
        this.lastChat.set(key, Date.now() + spec.cooldownMs);
        const message = { id: randomUUID(), channel, name: player.name, entityId: player.id, body, time: Date.now() };
        for (const recipient of this.players()) {
            if (channel === 'zone' && recipient.group !== player.group) continue;
            if (channel === 'party' && !party.members.includes(this.profile(recipient).id)) continue;
            if (channel === 'guild' && this.guild(recipient)?.id !== guild.id) continue;
            this.event(recipient, 'chat', message);
        }
    }
}
module.exports = Social;
