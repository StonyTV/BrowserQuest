const Progression = require('./progression');
const config = require('../../../shared/content/progression.json');
const monsters = require('../../../shared/content/mobs.json').monsters;
const Types = require('../../../shared/js/gametypes');
const Utils = require('../utils');

// Party experience and the killing player's gold/victory are one durable operation.
async function rewardKill(world, attacker, mob) {
    const social = world.gameplay.social;
    const party = social.party(attacker);
    const members = party ? party.members.map(id => social.findPlayer(id)).filter(player =>
        player && player !== attacker && !player.isDead && player.hitPoints > 0 && player.near(mob, config.partyRadius)
    ) : [];
    const players = [attacker, ...members];
    const total = monsters[Types.getKindAsString(mob.kind)].experience;
    const awards = players.map((player, index) => {
        const session = {...player.session, profile:structuredClone(player.session.profile)};
        const amount = Math.floor(total / players.length) + (index < total % players.length ? 1 : 0);
        const result = Progression.gain(session.profile, amount);
        if (player === attacker) {
            session.profile.kills++;
            session.profile.gold += Utils.randomInt(1,4) * mob.weaponLevel;
        }
        return { player, session, result };
    });
    await world.profiles.commit(awards.map(award => award.session));
    for (const {player,session,result} of awards) {
        player.session = session;
        player.applyEquipment();
        player.syncProfile();
        social.event(player, 'experience', {...result, level:Progression.status(session.profile.experience).level});
    }
}
module.exports = rewardKill;
