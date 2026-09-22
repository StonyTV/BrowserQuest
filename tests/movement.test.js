const { test } = require('node:test');
const assert = require('node:assert/strict');
const Movement = require('../server/js/domain/movement');
const { stepMs } = require('../shared/content/movement.json');

function fixture() {
    const events = [];
    const player = {id:1,x:1,y:1,send:message=>events.push(message),setPosition(x,y){this.x=x;this.y=y;},clearTarget(){},zone_callback(){events.push('zone');},broadcast(message){events.push(message.serialize());}};
    const world = {players:{1:player},npcs:{2:{x:5,y:2}},map:{doors:[{x:3,y:1,tx:8,ty:8}]},isValidPosition:(x,y)=>x>0&&y>0&&x<10&&y<10&&!(x===2&&y===2),handlePlayerVanish(){events.push('vanish');},pushToPreviousGroups(){events.push('destroyPrevious');},pushRelevantEntityListTo(){events.push('list');}};
    const movement = new Movement(world); movement.reset(player);
    return {player,world,movement,events};
}
test('routes cannot cross walls, jump, move diagonally, leave the map or cross NPCs', () => {
    for (const route of [[[1,1],[2,2]],[[1,1],[3,1]],[[1,1],[1,2],[2,2]],[[1,1],[0,1]],[[9,9],[9,8]],[[1,1],[2,1],[3,1],[4,1],[5,1],[5,2]]]) {
        const {player,movement,events}=fixture();
        movement.request(player,1,route,0); movement.tick(10000);
        assert.deepEqual([player.x,player.y],[1,1]);
        assert.equal(events.at(-1)[4],'rejected');
    }
});
test('server advances one tile per duration; packet spam and delayed ticks cannot accelerate travel', () => {
    const {player,movement,events}=fixture();
    movement.request(player,1,[[1,1],[2,1],[3,1],[4,1]],0);
    for(let sequence=2;sequence<30;sequence++) movement.request(player,sequence,[[1,1],[2,1],[3,1],[4,1]],50);
    movement.tick(stepMs-1); assert.equal(player.x,1);
    movement.tick(stepMs); assert.equal(player.x,2);
    movement.tick(stepMs+1); assert.equal(player.x,2);
    movement.tick(5000); assert.equal(player.x,3);
    movement.tick(5001); assert.equal(player.x,3);
    movement.tick(5000+stepMs); assert.equal(player.x,4);
    assert.equal(events.at(-1)[4],'arrived');
    assert.equal(events.filter(value=>value==='zone').length,3);
});
test('predicted turns retain approved steps and cannot start at an arbitrary location', () => {
    const {player,movement}=fixture();
    movement.request(player,1,[[1,1],[2,1],[3,1]],0);
    movement.request(player,2,[[2,1],[3,1],[3,2]],50);
    movement.tick(stepMs); assert.deepEqual([player.x,player.y],[2,1]);
    movement.tick(stepMs*2); assert.deepEqual([player.x,player.y],[3,1]);
    movement.tick(stepMs*3); assert.deepEqual([player.x,player.y],[3,2]);
    movement.request(player,3,[[8,8],[8,9]],600);
    movement.tick(10000); assert.deepEqual([player.x,player.y],[3,2]);
});
test('doors wait for physical arrival; unrelated destinations and remote door requests fail', () => {
    const {player,movement,events}=fixture();
    movement.teleport(player,8,8); assert.equal(events.at(-1)[4],'rejected');
    movement.request(player,1,[[1,1],[2,1],[3,1]],0);
    movement.teleport(player,8,8); assert.deepEqual([player.x,player.y],[1,1]);
    movement.tick(stepMs); assert.equal(player.x,2);
    movement.tick(stepMs*2); assert.deepEqual([player.x,player.y],[8,8]);
    assert.equal(events.at(-1)[4],'teleport');
    assert.equal(player.serviceId,null);
});
test('death prevents queued movement and respawn clears the previous route', () => {
    const {player,movement}=fixture();
    movement.request(player,1,[[1,1],[2,1]],0);
    player.isDead=true; movement.tick(stepMs); assert.equal(player.x,1);
    movement.reset(player); player.isDead=false; movement.tick(10000); assert.equal(player.x,1);
});
