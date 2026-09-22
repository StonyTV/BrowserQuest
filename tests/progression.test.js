const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createProfile, normalizeProfile} = require('../server/js/profiles');
const {status, gain} = require('../server/js/domain/progression');
const rewardKill = require('../server/js/domain/rewards');
const content = require('../shared/content/progression.json');
const monsters = require('../shared/content/mobs.json').monsters;

test('experience thresholds, multiple levels and cap use declarative content', () => {
    assert.equal(status(0).level, 1);
    for (let i=1; i<content.thresholds.length; i++) {
        assert.ok(content.thresholds[i]>content.thresholds[i-1]);
        assert.equal(status(content.thresholds[i]-1).level, i);
        assert.equal(status(content.thresholds[i]).level, i+1);
        assert.equal(status(content.thresholds[i]).current, 0);
    }
    const profile=createProfile('Hero');
    assert.deepEqual(gain(profile, 220), {gained:220,levels:3});
    assert.equal(status(profile.experience).healthBonus,24);
    assert.equal(status(profile.experience).damageBonus,3);
    assert.equal(status(content.thresholds[4]).defenseBonus,1);
    gain(profile,1e6);
    assert.equal(profile.experience,content.thresholds.at(-1));
    assert.equal(status(profile.experience).required,0);
    assert.deepEqual(gain(profile,500),{gained:0,levels:0});
    for(const mob of Object.values(monsters)) assert.ok(Number.isSafeInteger(mob.experience)&&mob.experience>0);
});

test('legacy profiles start at zero experience without changing possessions or victories', () => {
    const profile=createProfile('Veteran');delete profile.experience;profile.schemaVersion=2;
    profile.kills=12;profile.gold=47;
    const before=structuredClone(profile);
    normalizeProfile(profile);
    assert.equal(profile.experience,0);assert.equal(profile.schemaVersion,4);
    for(const key of ['id','gold','kills','items','equipped','bank']) assert.deepEqual(profile[key],before[key]);
});

function setup() {
    const players=['Killer','Nearby','Distant','Dead','Capped'].map((name,index)=>({
        id:index+1, session:{profile:createProfile(name)}, isDead:name==='Dead',hitPoints:name==='Dead'?0:70,
        near:()=>name!=='Distant', applyEquipment(){this.applied=true;},syncProfile(){this.synced=true;}
    }));
    players[0].session.profile.experience=36;
    players[1].session.profile.experience=37;
    players[4].session.profile.experience=content.thresholds.at(-1);
    const events=[],commits=[];
    const world={
        gameplay:{social:{party:()=>({members:players.map(player=>player.session.profile.id)}),findPlayer:id=>players.find(player=>player.session.profile.id===id),event:(player,type,data)=>events.push({player:player.id,type,data})}},
        profiles:{async commit(sessions){commits.push(sessions);}}
    };
    return {world,players,events,commits};
}
test('nearby living party members share a fixed XP pool in one commit; gold and victory belong to the killer', async () => {
    const {world,players,events,commits}=setup();
    await rewardKill(world,players[0],{kind:2,weaponLevel:1});
    assert.equal(commits.length,1);assert.equal(commits[0].length,3);
    assert.deepEqual(players.map(player=>player.session.profile.experience),[40,40,0,0,14000]);
    assert.deepEqual(players.map(player=>player.session.profile.kills),[1,0,0,0,0]);
    assert.ok(players[0].session.profile.gold>=1&&players[0].session.profile.gold<=4);
    assert.deepEqual(players.slice(1).map(player=>player.session.profile.gold),[0,0,0,0]);
    assert.deepEqual(events.map(event=>event.data),[{gained:4,levels:1,level:2},{gained:3,levels:1,level:2},{gained:0,levels:0,level:20}]);
    assert.equal(players[2].synced,undefined);assert.equal(players[3].synced,undefined);
});
test('a failed party reward write acknowledges nobody and changes no live profile', async () => {
    const {world,players,events}=setup();const before=players.map(player=>structuredClone(player.session.profile));
    world.profiles.commit=async()=>{throw new Error('storage conflict');};
    await assert.rejects(rewardKill(world,players[0],{kind:2,weaponLevel:1}),/storage conflict/);
    assert.deepEqual(players.map(player=>player.session.profile),before);
    assert.deepEqual(events,[]);assert.ok(players.every(player=>!player.synced&&!player.applied));
});
