const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Types = require('../shared/js/gametypes');
class Mob {
    constructor() {this.gridX=2;this.gridY=3;this.x=32;this.y=48;this.isDying=false;}
    disengage(){this.target=null;}
    setTarget(target){this.target=target;}
    setGridPosition(x,y){this.gridX=x;this.gridY=y;this.x=x*16;this.y=y*16;}
    walk(){this.animation='walk';} idle(){this.animation='idle';} hit(){this.animation='attack';}
    forEachAttacker(){} hasMoved(){}
}
let MobSync;
vm.runInNewContext(fs.readFileSync(require.resolve('../client/js/mob-sync'),'utf8'),{Types,define(deps,factory){MobSync=factory(Mob);}});
function fixture() {
    const mob=new Mob(),player={addAttacker(){}};
    const game={currentTime:100,client:{handlers:{}},entities:{99:mob,1:player},unregisterEntityPosition(){},registerEntityPosition(){}};
    const sync=new MobSync(game);return {mob,game,sync};
}
test('monster rendering interpolates only confirmed positions and never extrapolates a pursuit',()=>{
    const {mob,game,sync}=fixture();
    sync.receive([36,99,3,3,1,'chasing',200,4,false]);
    assert.equal(mob.gridX,3);assert.equal(mob.x,32);
    game.currentTime=200;sync.update(mob);assert.equal(mob.x,40);
    game.currentTime=300;sync.update(mob);assert.equal(mob.x,48);
    game.currentTime=5000;sync.update(mob);assert.equal(mob.x,48);assert.equal(mob.animation,'idle');
    sync.receive([36,99,3,3,1,'attacking',200,4,true]);assert.equal(mob.animation,'attack');
    sync.receive([36,99,3,3,null,'returning',200,4,false]);assert.equal(mob.target,null);
});
test('late monster updates cannot move a dying creature or restart its animation',()=>{
    const {mob,sync}=fixture();mob.isDying=true;mob.animation='death';
    sync.receive([36,99,3,3,1,'chasing',200,4,true]);sync.update(mob);
    assert.equal(mob.x,32);assert.equal(mob.animation,'death');
});
