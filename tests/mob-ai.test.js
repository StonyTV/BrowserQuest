const {test} = require('node:test');
const assert = require('node:assert/strict');
const MobAI = require('../server/js/domain/mob-ai');
const config = require('../shared/content/mobs.json');

function fixture(kind=4, walls=[]) {
    const packets=[], strikes=[];
    const mob={id:99,kind,x:10,y:10,spawningX:10,spawningY:10,hitPoints:90,hatelist:[],
        setPosition(x,y){this.x=x;this.y=y;},setTarget(player){this.target=player.id;},clearTarget(){this.target=null;},
        increaseHateFor(id,hate){const entry=this.hatelist.find(entry=>entry.id===id); if(entry) entry.hate+=hate; else this.hatelist.push({id,hate});},
        updateHitPoints(){this.hitPoints=90;}};
    const world={players:{},entities:{99:mob},mobs:{99:mob},npcs:{},
        isValidPosition:(x,y)=>x>0&&y>0&&x<40&&y<40&&!walls.some(point=>point[0]===x&&point[1]===y),
        clearMobAggroLink(m){world.players[m.target]?.removeAttacker(m);},
        clearMobHateLinks(m){m.hatelist.forEach(hate=>world.players[hate.id]?.removeHater(m));},
        pushToAdjacentGroups(group,message){packets.push(message.serialize());},
        handleEntityGroupMembership(){},sendEntityInfo(){},damagePlayer(m,p){strikes.push(p.id);}};
    const ai=new MobAI(world); ai.reset(mob);
    function player(id,x,y) {
        const p={id,x,y,haters:{},attackers:{},addAttacker(m){this.attackers[m.id]=m;},removeAttacker(m){delete this.attackers[m.id];},addHater(m){this.haters[m.id]=m;},removeHater(m){delete this.haters[m.id];}};
        world.players[id]=world.entities[id]=p; return p;
    }
    function hate(p,points=1,now=0) {mob.increaseHateFor(p.id,points);p.addHater(mob);ai.chooseTarget(mob,now);}
    return {mob,world,ai,packets,strikes,player,hate};
}
test('aggressive creatures detect an idle player without any client message; passive rats do not',()=>{
    const f=fixture();f.player(1,13,10);f.ai.tick(0);
    assert.equal(f.mob.target,1);assert.deepEqual([f.mob.x,f.mob.y],[10,10]);
    f.ai.tick(149);assert.equal(f.mob.x,10);
    f.ai.tick(150);assert.equal(f.mob.x,11);
    f.ai.tick(151);assert.equal(f.mob.x,11);
    f.ai.tick(5000);assert.equal(f.mob.x,12);assert.deepEqual(f.strikes,[]);
    f.ai.tick(5150);assert.deepEqual(f.strikes,[1]);
    f.ai.tick(5151);assert.deepEqual(f.strikes,[1]);
    f.ai.tick(5850);assert.deepEqual(f.strikes,[1,1]);
    const rat=fixture(2);const p=rat.player(1,11,10);rat.ai.tick(0);rat.ai.tick(10000);
    assert.equal(rat.mob.target,undefined);assert.deepEqual(rat.strikes,[]);
    rat.hate(p,5,10000);rat.ai.tick(11000);assert.deepEqual(rat.strikes,[1]);
});
test('pursuit routes around walls and NPCs one tile at a time, without melee through corners',()=>{
    const f=fixture(2,[[11,10],[11,11]]);f.world.npcs[3]={x:11,y:9};const p=f.player(1,13,10);f.hate(p);
    let before=[10,10];
    for(let now=350;now<7000&&!f.strikes.length;now+=350) {
        f.ai.tick(now);
        const current=[f.mob.x,f.mob.y];
        assert.ok(Math.abs(current[0]-before[0])+Math.abs(current[1]-before[1])<=1);
        assert.ok(f.ai.walkable(...current));before=current;
    }
    assert.ok(f.strikes.length>0);assert.ok(f.ai.canHit(f.mob,p));
    assert.equal(f.ai.canHit({x:10,y:10},{x:11,y:11}),false);
    assert.equal(f.ai.canHit({x:10,y:10},{x:12,y:10}),false);
});
test('an impassable wall prevents proximity aggression and unreachable targets trigger a walk home',()=>{
    const walls=Array.from({length:30},(_,i)=>[11,i+1]);
    const f=fixture(4,walls),p=f.player(1,12,10);f.ai.tick(0);
    assert.equal(f.mob.target,undefined);
    f.hate(p);f.ai.tick(150);f.ai.tick(150+config.unreachableMs);
    assert.equal(f.mob.ai.mode,'returning');assert.equal(f.mob.target,null);assert.deepEqual(f.strikes,[]);
});
test('leash clears hate, walks back without teleporting and restores health only at home',()=>{
    const f=fixture(2),p=f.player(1,16,10);f.hate(p);f.mob.hitPoints=12;
    f.ai.tick(350);f.ai.tick(700);assert.equal(f.mob.x,12);
    p.x=30;f.ai.tick(701);assert.equal(f.mob.ai.mode,'returning');assert.equal(f.mob.target,null);
    assert.equal(f.mob.x,12);assert.equal(f.mob.hitPoints,12);assert.deepEqual(p.haters,{});assert.deepEqual(p.attackers,{});
    f.ai.tick(1051);assert.equal(f.mob.x,11);f.ai.tick(1401);assert.equal(f.mob.x,10);f.ai.tick(1402);
    assert.equal(f.mob.ai.mode,'idle');assert.equal(f.mob.hitPoints,90);
});
test('death, disconnect or teleport transfers aggression to a surviving attacker and cleans both links',()=>{
    for(const action of ['death','disconnect','teleport']) {
        const f=fixture(2),a=f.player(1,11,10),b=f.player(2,10,11);
        f.hate(b,2);f.hate(a,10);assert.equal(f.mob.target,1);
        if(action==='death') a.isDead=true;
        if(action==='disconnect') delete f.world.entities[a.id];
        if(action==='teleport') a.x=35;
        f.ai.forgetPlayer(a,100);assert.equal(f.mob.target,2);
        assert.deepEqual(a.attackers,{});assert.deepEqual(a.haters,{});assert.equal(b.attackers[99],f.mob);
        f.ai.tick(1100);assert.deepEqual(f.strikes,[2]);
    }
});
test('dead monsters never move/attack and a respawn resets every AI deadline',()=>{
    const f=fixture(2),p=f.player(1,11,10);f.hate(p);f.mob.isDead=true;f.ai.tick(5000);
    assert.deepEqual(f.strikes,[]);
    f.mob.clearTarget();f.mob.hatelist=[];f.ai.reset(f.mob);f.mob.isDead=false;f.ai.tick(6000);
    assert.deepEqual(f.strikes,[]);assert.equal(f.mob.ai.mode,'idle');
});
test('multiple creatures choose separate melee tiles instead of permanently stacking on the player',()=>{
    const f=fixture(),p=f.player(1,11,10);
    const second={...f.mob,id:100,hatelist:[]};
    f.world.mobs[100]=f.world.entities[100]=second;f.ai.reset(second);
    f.hate(p);second.increaseHateFor(p.id,1);p.addHater(second);f.ai.chooseTarget(second,0);
    for(let now=150;now<=1500;now+=150) f.ai.tick(now);
    assert.notDeepEqual([f.mob.x,f.mob.y],[second.x,second.y]);
    for(const mob of [f.mob,second]) {
        assert.equal(Math.abs(mob.x-p.x)+Math.abs(mob.y-p.y),1);
        assert.equal(mob.ai.mode,'attacking');
    }
    assert.ok(f.strikes.length>=2);
});
