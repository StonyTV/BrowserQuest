const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProfile, createItem, equip } = require('../server/js/profiles');
const Craft = require('../server/js/domain/crafting');
const Harvesting = require('../server/js/domain/harvesting');
const CommandQueue = require('../server/js/command-queue');
const Bank = require('../server/js/domain/bank');
const content = require('../shared/content/crafting.json');
function funded() { const p = createProfile('Forgeron'); p.gold = 100; Craft.addResource(p, 100, 20); Craft.addResource(p, 101, 30); return p; }
test('resources stack in fixed slots, bank as whole stacks, and cannot be equipped', () => {
    const p = createProfile('Récolteur'); Craft.addResource(p, 100, 101);
    assert.deepEqual(p.items.filter(i=>i.kind===100).map(i=>i.quantity), [99,2]);
    const stack = p.items.find(i=>i.kind===100), armor=p.equipped.armor;
    assert.equal(equip(p,stack.id),false); assert.equal(p.equipped.armor,armor);
    Bank.transferItem(p,stack.id,true); assert.equal(p.bank.items[0].quantity,99);
    Bank.transferItem(p,stack.id,false); assert.equal(p.items.find(i=>i.id===stack.id).quantity,99);
    assert.equal(new Set(p.items.map(i=>i.slot)).size,p.items.length);
});
test('capacity failures never partially fill resource stacks', () => {
    const p=createProfile('Plein'); Craft.addResource(p,100,98);
    while(p.items.length<24) { const item=createItem(60);item.slot=p.items.length;p.items.push(item); }
    const before=structuredClone(p); assert.throws(()=>Craft.addResource(p,100,2),/Sac plein/); assert.deepEqual(p,before);
    Craft.addResource(p,100,1); assert.equal(Craft.quantity(p,100),99);
});
test('recipes consume exact ingredients and gold, create one owned item and grant profession experience', () => {
    const p=funded(), original=structuredClone(p), result=Craft.craft(p,'steel-sword');
    assert.deepEqual(p,original); assert.equal(Craft.quantity(result.profile,100),18);assert.equal(Craft.quantity(result.profile,101),26);
    assert.equal(result.profile.gold,97);assert.equal(result.item.kind,61); assert.equal(result.item.craftedBy,p.name);
    assert.equal(Craft.level(result.profile.professions.smithing),2); assert.equal(result.profile.equipped.weapon,p.equipped.weapon);
    assert.ok(equip(result.profile,result.item.id));
    for (const id of ['__proto__',null,{},'woodsman-axe']) assert.throws(()=>Craft.craft(p,id));
    assert.deepEqual(p,original);
});
test('full bag crafting may use a freed ingredient slot, otherwise changes nothing', () => {
    const p=createProfile('Plein');p.gold=100;Craft.addResource(p,100,2);Craft.addResource(p,101,4);
    while(p.items.length<24) {const item=createItem(60);item.slot=p.items.length;p.items.push(item);}
    assert.equal(Craft.craft(p,'steel-sword').profile.items.length,23);
    p.items.find(i=>i.kind===100).quantity=3;p.items.find(i=>i.kind===101).quantity=5;
    const before=structuredClone(p);assert.throws(()=>Craft.craft(p,'steel-sword'),/case/);assert.deepEqual(p,before);
    p.gold=0;assert.throws(()=>Craft.craft(p,'steel-sword'),/pièces/);
});
function worldFixture(save) {
    const events=[],changes=[], world={players:{},npcs:{},server:{commands:new CommandQueue()},sendEntityInfo(npc){changes.push(npc.id);},addNpc(kind,x,y){const npc={id:Number('8'+x+y),kind,x,y};this.npcs[npc.id]=npc;return npc;},gameplay:{social:{event(player,type,data){events.push({id:player.id,type,data});},async commit(player,profile){if(save)await save();player.session.profile=profile;}}}};
    const harvesting=new Harvesting(world);world.gameplay.harvesting=harvesting;harvesting.spawn();
    function player(id){const node=[...harvesting.nodes.values()][0],p={id,name:'P'+id,x:node.npc.x+1,y:node.npc.y,hitPoints:80,hasEnteredGame:true,isDead:false,connection:{closing:false},movement:{path:[]},session:{profile:createProfile('P'+id)},near(npc,n){return Math.max(Math.abs(this.x-npc.x),Math.abs(this.y-npc.y))<=n;}};world.players[id]=p;return p;}
    return {world,harvesting,player,events,changes,node:[...harvesting.nodes.values()][0]};
}
test('one shared node rewards one player after server duration, then depletes and respawns', async () => {
    const f=worldFixture(),a=f.player(1),b=f.player(2);f.harvesting.start(a,f.node.npc.id);
    assert.throws(()=>f.harvesting.start(b,f.node.npc.id),/autre aventurier/);
    f.harvesting.tick(f.node.job.endsAt-1);await f.world.server.commands.drain();assert.equal(Craft.quantity(a.session.profile,100),0);
    f.harvesting.tick(f.node.job.endsAt);f.harvesting.tick(f.node.job.endsAt);await f.world.server.commands.drain();
    assert.equal(Craft.quantity(a.session.profile,100),2);assert.equal(Craft.quantity(b.session.profile,100),0);assert.equal(a.session.profile.professions.lumbering,3);
    assert.equal(f.harvesting.info(f.node.npc.id).state,'depleted');assert.throws(()=>f.harvesting.start(b,f.node.npc.id),/renouveler/);
    f.harvesting.tick(f.node.readyAt);assert.equal(f.harvesting.info(f.node.npc.id).state,'ready');
});
test('movement, combat, damage, death and disconnect interrupt without rewards or depletion', () => {
    for(const interrupt of [p=>p.movement.path.push([p.x+1,p.y]),p=>p.target=42,p=>p.hitPoints--,p=>p.isDead=true,(p,w)=>delete w.players[p.id]]) {
        const f=worldFixture(),p=f.player(1);f.harvesting.start(p,f.node.npc.id);interrupt(p,f.world);f.harvesting.tick();
        assert.equal(f.node.job,null);assert.equal(f.node.readyAt,0);assert.equal(Craft.quantity(p.session.profile,100),0);
    }
    const f=worldFixture(),p=f.player(1);p.x+=20;assert.throws(()=>f.harvesting.start(p,f.node.npc.id),/Approchez/);
});
test('a failed durable harvest write grants nothing and the queue stops', async () => {
    const f=worldFixture(async()=>{throw new Error('Disk unavailable');}),p=f.player(1);f.harvesting.start(p,f.node.npc.id);f.harvesting.tick(f.node.job.endsAt);await f.world.server.commands.drain();
    assert.equal(Craft.quantity(p.session.profile,100),0);assert.equal(f.node.readyAt,0);assert.equal(f.events.some(e=>e.data.state==='complete'),false);assert.match(f.world.server.commands.error.message,/Disk/);
});
test('declared resource nodes do not occupy walls, doors, NPCs or duplicate positions', () => {
    const map=require('../server/maps/world_server.json'),services=require('../shared/content/social.json').services;
    const positions=new Set();
    for(const node of content.nodes){const index=node.y*map.width+node.x;assert.equal(map.collisions.includes(index),false);assert.equal(map.doors.some(d=>d.x===node.x&&d.y===node.y),false);assert.equal(services.some(s=>s.position?.x===node.x&&s.position?.y===node.y),false);assert.equal(positions.has(index),false);positions.add(index);}
});

test('a bag filled during harvesting cancels the reward without consuming the shared node', async () => {
    const f=worldFixture(),p=f.player(1);f.harvesting.start(p,f.node.npc.id);
    while(p.session.profile.items.length<24) {const item=createItem(60);item.slot=p.session.profile.items.length;p.session.profile.items.push(item);}
    const before=structuredClone(p.session.profile);
    f.harvesting.tick(f.node.job.endsAt);await f.world.server.commands.drain();
    assert.deepEqual(p.session.profile,before);assert.equal(f.node.job,null);assert.equal(f.node.readyAt,0);
    assert.ok(f.events.some(e=>e.type==='notice'&&e.data.action==='resource.harvest'&&/Sac plein/.test(e.data.message)));
});
