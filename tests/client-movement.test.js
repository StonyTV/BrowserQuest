const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Types = require('../shared/js/gametypes');
let Movement;
vm.runInNewContext(fs.readFileSync(require.resolve('../client/js/movement'), 'utf8'), {
    Types,
    define(dependencies, factory) { Movement = factory(JSON.stringify(require('../shared/content/movement.json'))); }
});
function fixture() {
    const loot = [];
    const game = {player:{gridX:5,gridY:1,isMoving:()=>false},client:{handlers:{},sendMessage(){},sendLoot:item=>loot.push(item.id)}};
    const movement = new Movement(game);
    movement.send([[1,1],[2,1],[3,1],[4,1],[5,1]]);
    return {game,movement,loot};
}
test('predicted arrival defers loot until server arrival, without duplicate requests', () => {
    const {game,movement,loot}=fixture();
    game.authoritativePosition={sequence:1,x:3,y:1,status:'moving'};
    movement.loot({id:42}); assert.deepEqual(loot,[]);
    movement.receive([35,1,4,1,'moving']); assert.deepEqual(loot,[]);
    movement.receive([35,1,5,1,'arrived']); assert.deepEqual(loot,[42]);
    movement.receive([35,1,5,1,'arrived']); assert.deepEqual(loot,[42]);
});
test('changing direction cancels pending loot, while standing on a confirmed tile collects immediately', () => {
    const {game,movement,loot}=fixture();
    movement.loot({id:42});
    movement.send([[3,1],[4,1],[5,1]]);
    movement.receive([35,1,5,1,'arrived']); assert.deepEqual(loot,[]);
    movement.receive([35,2,5,1,'arrived']); assert.deepEqual(loot,[]);
    game.authoritativePosition.status='teleport';
    movement.loot({id:43}); assert.deepEqual(loot,[43]);
});
