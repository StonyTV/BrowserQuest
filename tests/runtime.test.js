const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const directory = mkdtempSync(path.join(tmpdir(), 'browserquest-test-'));
const mongo = process.env.BQ_TEST_MONGO === '1';
const database = 'bq_test_runtime_' + process.pid + '_' + Date.now();
let child, base, restartProof, progressionProof;
async function openStore() {
    if (mongo) {
        const { MongoProfileStore } = require('../server/js/storage/mongo');
        return new MongoProfileStore(process.env.MONGODB_URI, database).connect();
    }
    const { ProfileStore } = require('../server/js/storage/sqlite');
    return new ProfileStore(path.join(directory, 'characters.sqlite'));
}
const peers = [];
async function startServer() {
    child = spawn(process.execPath, ['server/js/main.js'], { env: { ...process.env, PORT: '0', NODE_ENV: 'test', BQ_TEST_LEGACY_AUTH: '1', BQ_DATABASE: mongo ? '' : path.join(directory, 'characters.sqlite'), MONGODB_DATABASE: database } });
    let output = '';
    base = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(output)), 15000);
        child.stdout.on('data', data => {
            output += data;
            const match = output.match(/BrowserQuest: (http:\/\/[^\s]+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        child.stderr.on('data', data => { output += data; });
        child.on('exit', code => { clearTimeout(timer); reject(new Error('Server exited ' + code + ': ' + output)); });
    });
    for (let i = 0; i < 100; i++) {
        if ((await (await fetch(base + '/status')).json()).ready) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('World did not become ready');
}
before(startServer);
after(async () => {
    peers.forEach(peer => peer.socket.terminate());
    if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    if (mongo) { const store = await openStore(); await store.db.dropDatabase(); await store.close(); }
    rmSync(directory, { recursive: true, force: true });
});
async function connect(name, token = '') {
    const socket = new WebSocket(base.replace('http', 'ws'));
    const messages = [];
    socket.on('message', data => {
        if (data.toString() === 'go') return;
        const message = JSON.parse(data);
        const packets = Array.isArray(message[0]) ? message : [message];
        messages.push(...packets);
        for (const packet of packets) {
            if (packet[0] === 1) peer.position = [packet[3],packet[4]];
            if (packet[0] === 35) peer.position = [packet[2],packet[3]];
        }
    });
    const peer = { socket, messages, send: message => socket.send(JSON.stringify(message)) };
    peers.push(peer);
    await once(socket, 'open');
    if (name) {
        peer.send([0, name, 26, 66, token]);
        peer.welcome = await waitFor(peer, message => message[0] === 1);
        peer.profile = (await waitFor(peer, message => message[0] === 27))[1];
    }
    return peer;
}
async function closePeer(peer) {
    const closed = once(peer.socket, 'close'); peer.socket.close(); await closed;
}
async function waitFor(peer, predicate, attempts = 100) {
    for (let i = 0; i < attempts; i++) {
        const index = peer.messages.findIndex(predicate);
        if (index !== -1) return peer.messages.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Expected message missing (' + predicate.toString() + '): ' + JSON.stringify(peer.messages.filter(message => message[0] !== 33).slice(-6)));
}
// Integration clients obey the same path protocol and server clock as the browser.
const map = require('../server/maps/world_server.json');
const Types = require('../shared/js/gametypes');
const blocked = new Set(map.collisions);
// The original server spawns static entities at tileIndexToGridPosition(index).x + 1.
for (const [index,kind] of Object.entries(map.staticEntities)) if (Types.isNpc(Types.getKindFromString(kind))) blocked.add(Number(index));
for (const npc of require('../shared/content/social.json').services) if (npc.position) blocked.add(npc.position.y*map.width+npc.position.x);
for (const node of require('../shared/content/crafting.json').nodes) blocked.add(node.y*map.width+node.x);
function route(from, to, radius = 0) {
    const queue = [[...from]], previous = new Map([[from.join(','),null]]);
    for(let index=0;index<queue.length && index<10000;index++) {
        const [x,y]=queue[index];
        if(Math.abs(x-to[0])+Math.abs(y-to[1])<=radius) {
            const path=[]; let point=[x,y];
            while(point) {path.unshift(point);point=previous.get(point.join(','));}
            return path;
        }
        for(const next of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
            const [nx,ny]=next, key=next.join(',');
            if(nx<=0||ny<=0||nx>=map.width||ny>=map.height||blocked.has(ny*map.width+nx)||previous.has(key)) continue;
            previous.set(key,[x,y]); queue.push(next);
        }
    }
    throw new Error('No test route '+JSON.stringify({from,to,radius}));
}
async function moveTo(peer,x,y,radius=0) {
    const path=route(peer.position,[x,y],radius);
    const sequence=peer.sequence=(peer.sequence||0)+1;
    peer.send([34,sequence,path]);
    const ack=await waitFor(peer,message=>message[0]===35 && message[1]===sequence && ['arrived','rejected'].includes(message[4]),500);
    assert.equal(ack[4],'arrived','Test route rejected: '+JSON.stringify(path));
    assert.deepEqual(peer.position,path.at(-1));
}
test('HTTP serves game and shared protocol, never server files', async () => {
    assert.equal((await (await fetch(base + '/status')).json()).protocol, 7);
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base + '/shared/js/gametypes.js')).status, 200);
    assert.equal((await fetch(base + '/server/config.json')).status, 404);
    assert.equal((await fetch(base + '/.git/config')).status, 403);
    assert.equal((await fetch(base + '/%00')).status, 400);
});
test('two players join with valid health and exchange chat', async () => {
    const alice = await connect('Alice');
    const bob = await connect('Bob');
    assert.equal(alice.welcome[5], 80);
    assert.deepEqual(alice.profile.items.map(item => item.kind), [60, 21]);
    assert.equal(bob.welcome[5], 80);
    assert.notEqual(alice.welcome[1], bob.welcome[1]);
    await waitFor(alice, message => message[0] === 17 && message[1] === 2);
    await moveTo(bob, alice.welcome[3], alice.welcome[4]);
    bob.send([21]);
    await new Promise(resolve => setTimeout(resolve, 80));
    alice.send([11, 'Hello world']);
    const chat = await waitFor(bob, message => message[0] === 32 && message[1] === 'chat');
    assert.equal(chat[2].body, 'Hello world');
    alice.send([11, 'Too soon']);
    const limited = await waitFor(alice, message => message[0] === 32 && message[1] === 'notice');
    assert.match(limited[2].message, /Patientez/);
    const status = await (await fetch(base + '/status')).json();
    assert.equal(status.worlds[0].players, 2);
});
test('malformed JSON and invalid envelopes disconnect only their sender', async () => {
    for (const value of ['{broken', 'null', '{}', '[4,1.5,2]', '[34,1,[]]', '[34,1,[[1,2.5]]]', '[34,-1,[[1,2]]]', '[999]']) {
        const peer = await connect();
        const closed = once(peer.socket, 'close');
        peer.socket.send(value);
        assert.equal((await closed)[0], 1008);
    }
    assert.equal((await (await fetch(base + '/status')).json()).ready, true);
});

test('forged destination, route and door packets cannot enable remote loot', async () => {
    const hero = await connect('NoTeleport');
    const start = [...hero.position];
    const list = await waitFor(hero, message => message[0] === 19);
    hero.send([20, ...list.slice(1)]);
    const sword = await waitFor(hero, message => message[0] === 2 && message[2] === 61 && Math.max(Math.abs(message[3]-start[0]),Math.abs(message[4]-start[1])) > 3);
    for (const packet of [[4,sword[3],sword[4]],[5,sword[3],sword[4],sword[1]],[34,1,[start,[sword[3],sword[4]]]],[15,155,286]]) {
        hero.send(packet);
        const rejected = await waitFor(hero, message => message[0] === 35 && message[4] === 'rejected');
        assert.deepEqual(rejected.slice(2,4),start);
        hero.send([12,sword[1]]);
    }
    await new Promise(resolve => setTimeout(resolve,100));
    assert.equal(hero.messages.some(message => message[0] === 27),false);
    assert.deepEqual(hero.position,start);
});
test('loot is collected once, equipment is owned, and reconnect restores the bag', async () => {
    const hero = await connect('Collector');
    const list = await waitFor(hero, message => message[0] === 19);
    hero.send([20, ...list.slice(1)]);
    const sword = await waitFor(hero, message => message[0] === 2 && message[2] === 61);
    hero.send([12, sword[1]]); // Too far away: must not grant any equipment.
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(hero.messages.some(message => message[0] === 27), false);
    await moveTo(hero, sword[3], sword[4]);
    hero.send([12, sword[1]]);
    const profile = (await waitFor(hero, message => message[0] === 27))[1];
    assert.equal(profile.items.length, 3);
    const item = profile.items.find(item => item.kind === 61);
    assert.ok(item);
    hero.send([12, sword[1]]); // Replaying loot cannot duplicate it.
    hero.send([28, 'not-owned']);
    hero.send([28, item.id]);
    const equipped = (await waitFor(hero, message => message[0] === 27))[1];
    assert.equal(equipped.equipped.weapon, item.id);
    assert.equal(equipped.items.length, 3);
    hero.send([29, item.id]); // Equipped items cannot be destroyed.
    const closed = once(hero.socket, 'close');
    hero.socket.close();
    await closed;
    const returned = await connect('Name cannot replace saved name', profile.token);
    assert.equal(returned.profile.name, 'Collector');
    assert.equal(returned.profile.equipped.weapon, item.id);
    assert.equal(returned.profile.items.length, 3);
    const duplicate = await connect();
    const rejected = once(duplicate.socket, 'close');
    duplicate.send([0, 'Duplicate', 21, 60, profile.token]);
    assert.equal((await rejected)[0], 1008);
});
test('server combat grants one shared level-up and synchronizes stats with both players and an observer', async () => {
    const store = await openStore();
    const sessions = [];
    for (const name of ['Fighter', 'Ally']) {
        const session = await store.open('', name); session.profile.experience = 35;
        await store.save(session); sessions.push(session);
    }
    await store.close();
    const hero = await connect('Fighter', sessions[0].token);
    const ally = await connect('Ally', sessions[1].token);
    const observer = await connect('Observer');
    hero.send([31, 'party.invite', {id:ally.profile.id}]);
    const invitation = (await waitFor(ally, message => message[0] === 32 && message[1] === 'social' && message[2].invitations.length))[2].invitations[0];
    ally.send([31, 'invitation.answer', {id:invitation.id,accept:true}]);
    await waitFor(hero, message => message[0] === 32 && message[1] === 'social' && message[2].party?.members.length === 2);
    const list = await waitFor(hero, message => message[0] === 19);
    hero.send([20, ...list.slice(1)]);
    const rat = await waitFor(hero, message => message[0] === 2 && message[2] === 2);
    const map = require('../server/maps/world_server.json');
    const adjacent = [[rat[3] + 1, rat[4]], [rat[3] - 1, rat[4]], [rat[3], rat[4] + 1], [rat[3], rat[4] - 1]]
        .find(([x,y]) => !map.collisions.includes(y * map.width + x));
    await Promise.all([moveTo(hero, ...adjacent), moveTo(ally, ...adjacent), moveTo(observer, ...adjacent)]);
    hero.send([6, rat[1]]); // Legacy AGGRO must not provoke a passive animal.
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(hero.messages.some(message => message[0] === 36 && message[1] === rat[1] && message[4] === hero.welcome[1]), false);
    hero.send([8, rat[1]]);
    const damage = await waitFor(hero, message => message[0] === 10 && message[1] < 80);
    assert.ok(damage[1] >= 0); // No HURT message was sent by this client.
    for (let i = 0; i < 12 && !hero.messages.some(message => message[0] === 18); i++) {
        hero.send([8, rat[1]]);
        await new Promise(resolve => setTimeout(resolve, 650));
    }
    await waitFor(hero, message => message[0] === 18);
    const profile = (await waitFor(hero, message => message[0] === 27))[1];
    assert.equal(profile.kills, 1);
    assert.equal(profile.experience, 40); assert.equal(profile.progression.level, 2);
    assert.equal(profile.maxHitPoints, 88); assert.equal(profile.stats.attackBonus, 1);
    const allyProfile = (await waitFor(ally, message => message[0] === 27))[1];
    assert.equal(allyProfile.experience, 40); assert.equal(allyProfile.progression.level, 2);
    assert.equal(allyProfile.maxHitPoints, 88); assert.equal(allyProfile.gold, 0); assert.equal(allyProfile.kills, 0);
    const info = (await waitFor(observer, message => message[0] === 33 && message[1] === hero.welcome[1] && message[2].level === 2))[2];
    assert.equal(info.maxHp, 88);
    assert.equal(observer.messages.some(message => message[0] === 27), false);
    ally.send([31, 'experience.gain', {amount:14000}]);
    assert.match((await waitFor(ally, message => message[0] === 32 && message[1] === 'notice'))[2].message, /inconnue/);
    progressionProof = {token:sessions[1].token, experience:40, level:2, maxHitPoints:88};
    assert.ok(profile.gold >= 1 && profile.gold <= 4);
    hero.send([8, rat[1]]);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(hero.messages.some(message => message[0] === 27), false);
});
test('a full bag rejects equipment without deleting the world item', async () => {
    const { createItem } = require('../server/js/profiles');
    const store = await openStore();
    const session = await store.open('', 'FullBag');
    while (session.profile.items.length < 24) session.profile.items.push(createItem(61));
    await store.save(session);
    await store.close();
    const hero = await connect('FullBag', session.token);
    const list = await waitFor(hero, message => message[0] === 19);
    hero.send([20, ...list.slice(1)]);
    const sword = await waitFor(hero, message => message[0] === 2 && message[2] === 61);
    await moveTo(hero, sword[3], sword[4]);
    hero.send([12, sword[1]]);
    assert.equal((await waitFor(hero, message => message[0] === 30))[2], false);
    hero.send([20, sword[1]]);
    assert.equal((await waitFor(hero, message => message[0] === 2 && message[1] === sword[1]))[2], 61);
});

test('two players racing for the same world item persist exactly one copy', async () => {
    const first = await connect('FirstLooter'), second = await connect('SecondLooter');
    const list = await waitFor(first, message => message[0] === 19);
    first.send([20, ...list.slice(1)]);
    const sword = await waitFor(first, message => message[0] === 2 && message[2] === 61);
    await Promise.all([moveTo(first, sword[3], sword[4]), moveTo(second, sword[3], sword[4])]);
    first.send([12, sword[1]]); second.send([12, sword[1]]);
    await Promise.race([first, second].map(peer => waitFor(peer, message => message[0] === 27)));
    // Reconnect both identities: verify durable ownership, not just client messages.
    for (const peer of [first, second]) {
        const closed = once(peer.socket, 'close'); peer.socket.close(); await closed;
    }
    const returned = await Promise.all([first, second].map(peer => connect('Ignored', peer.profile.token)));
    assert.equal(returned.reduce((count, peer) => count + peer.profile.items.filter(item => item.kind === 61).length, 0), 1);
    assert.deepEqual(returned.map(peer => peer.profile.items.length).sort(), [2, 3]);
});

test('simultaneous guild creation and replay charge only the successful founder', async () => {
    const store = await openStore();
    const sessions = [];
    for (const name of ['FounderOne', 'FounderTwo']) {
        const session = await store.open('', name); session.profile.gold = 100;
        await store.save(session); sessions.push(session);
    }
    await store.close();
    const founders = await Promise.all(sessions.map(session => connect(session.profile.name, session.token)));
    await Promise.all(founders.map(async peer => {
        const list = await waitFor(peer, message => message[0] === 19);
        peer.send([20, ...list.slice(1)]);
        const npc = await waitFor(peer, message => message[0] === 2 && message[2] === 43);
        await moveTo(peer, npc[3], npc[4], 1);
        peer.send([31, 'service.open', {id:npc[1]}]);
        await waitFor(peer, message => message[0] === 32 && message[1] === 'service');
    }));
    const payload = {name:'Concurrent Founders', tag:'DUEL', crest:{frame:'shield',symbol:'sun',primary:'#112233',secondary:'#aabbcc'}};
    for (const peer of founders) peer.send([31, 'guild.create', payload]);
    const outcomes = await Promise.all(founders.map(peer => waitFor(peer, message => message[0] === 27 || (message[0] === 32 && message[1] === 'notice'))));
    assert.equal(outcomes.filter(message => message[0] === 27).length, 1);
    const failure = outcomes.find(message => message[0] === 32)[2];
    assert.equal(failure.action, 'guild.create'); assert.match(failure.message, /déjà utilisé/);
    for (const peer of founders) peer.send([31, 'guild.create', payload]);
    await Promise.all(founders.map(peer => waitFor(peer, message => message[0] === 32 && message[1] === 'notice')));
    const reopened = await openStore();
    try {
        const profiles = await Promise.all(sessions.map(session => reopened.open(session.token)));
        assert.deepEqual(profiles.map(session => session.profile.gold).sort((a,b) => a-b), [75,100]);
        assert.equal(profiles.filter(session => session.profile.guildId).length, 1);
        assert.equal([...reopened.guilds.values()].filter(guild => guild.tag === 'DUEL').length, 1);
    } finally { await reopened.close(); }
});

test('guilds, parties and bank enforce ownership, privacy and persistent membership', async () => {
    const { createItem } = require('../server/js/profiles');
    const store = await openStore();
    const saved = await store.open('', 'Meneur'); saved.profile.gold = 100;
    const item = createItem(61, 95); saved.profile.items.push(item); await store.save(saved); await store.close();
    const leader = await connect('Meneur', saved.token);
    const member = await connect('Membre');
    const outsider = await connect('Externe');
    const command = (peer, action, payload = {}) => peer.send([31, action, payload]);
    const event = (peer, type, predicate = () => true) => waitFor(peer, message => message[0] === 32 && message[1] === type && predicate(message[2])).then(message => message[2]);
    const crest = {frame:'shield',symbol:'oak',primary:'#7e2634',secondary:'#f1d27a'};
    command(leader, 'guild.create', {name:'Les Veilleurs',tag:'VEIL',crest});
    assert.match((await event(leader, 'notice')).message, /PNJ/);
    const list = await waitFor(leader, message => message[0] === 19);
    leader.send([20, ...list.slice(1)]);
    const npc = await waitFor(leader, message => message[0] === 2 && message[2] === 43);
    await moveTo(leader, npc[3], npc[4], 1);
    command(leader, 'service.open', {id:npc[1]});
    await event(leader, 'service');
    command(leader, 'guild.create', {name:'Les Veilleurs',tag:'VEIL',crest});
    const guild = (await event(leader, 'social', state => !!state.guild)).guild;
    assert.equal((await waitFor(leader, message => message[0] === 27))[1].gold, 75);
    command(leader, 'guild.invite', {id:member.profile.id});
    let invite = (await event(member, 'social', state => state.invitations.some(i => i.type === 'guild'))).invitations.find(i => i.type === 'guild');
    command(outsider, 'invitation.answer', {id:invite.id,accept:true});
    assert.match((await event(outsider, 'notice')).message, /expirée/);
    command(member, 'invitation.answer', {id:invite.id,accept:true});
    await event(member, 'social', state => state.guild?.members.length === 2);
    command(member, 'guild.crest', {crest:{...crest,symbol:'sun'}});
    assert.match((await event(member, 'notice')).message, /meneur/);
    command(member, 'chat.send', {channel:'guild',body:'Secret de guilde'});
    assert.equal((await event(leader, 'chat')).body, 'Secret de guilde');
    assert.equal(outsider.messages.some(message => message[1] === 'chat'), false);
    command(leader, 'party.invite', {id:member.profile.id});
    invite = (await event(member, 'social', state => state.invitations.some(i => i.type === 'party'))).invitations.find(i => i.type === 'party');
    command(member, 'invitation.answer', {id:invite.id,accept:true});
    await event(leader, 'social', state => state.party?.members.length === 2);
    command(leader, 'chat.send', {channel:'party',body:'Secret de groupe'});
    assert.equal((await event(member, 'chat', data => data.channel === 'party')).body, 'Secret de groupe');
    assert.equal(outsider.messages.some(message => message[1] === 'chat'), false);
    command(outsider, 'chat.send', {channel:'guild',body:'Intrusion'});
    assert.match((await event(outsider, 'notice')).message, /guilde/);
    command(outsider, 'chat.send', {channel:'__proto__',body:'Intrusion'});
    assert.match((await event(outsider, 'notice')).message, /inconnu/);
    command(outsider, 'chat.send', {channel:{toString:null},body:'Intrusion'});
    assert.match((await event(outsider, 'notice')).message, /inconnu/);
    command(outsider, 'service.open', {id:{toString:null}});
    assert.match((await event(outsider, 'notice')).message, /invalide/);
    command(leader, 'guild.crest', {crest:{...crest,primary:{toString:null}}});
    assert.match((await event(leader, 'notice')).message, /Couleur/);
    command(leader, 'guild.crest', {crest:{...crest,symbol:'stag'}});
    await event(member, 'social', state => state.guild?.crest.symbol === 'stag');
    const guard = await waitFor(leader, message => message[0] === 2 && message[2] === 40 && message[3] === 18 && message[4] === 222);
    await moveTo(leader,guard[3],guard[4],1);
    command(leader, 'service.open', {id:guard[1]}); await event(leader, 'service');
    command(leader, 'bank.item', {id:item.id,deposit:true});
    const banked = (await waitFor(leader, message => message[0] === 27 && message[1].bank.items.length === 1))[1];
    assert.equal(banked.items.some(value => value.id === item.id), false);
    command(leader, 'bank.item', {id:item.id,deposit:true});
    assert.match((await event(leader, 'notice')).message, /introuvable/);
    command(leader, 'bank.gold', {amount:20,deposit:true});
    await waitFor(leader, message => message[0] === 27 && message[1].bank.gold === 20);
    // Two frames arrive before the first database write completes. Only one is affordable.
    command(leader, 'bank.gold', {amount:40,deposit:true});
    command(leader, 'bank.gold', {amount:40,deposit:true});
    await waitFor(leader, message => message[0] === 27 && message[1].bank.gold === 60 && message[1].gold === 15);
    assert.match((await event(leader, 'notice')).message, /insuffisant/);
    command(leader, 'bank.gold', {amount:40,deposit:false});
    await waitFor(leader, message => message[0] === 27 && message[1].bank.gold === 20 && message[1].gold === 55);
    command(leader, 'guild.leave');
    assert.match((await event(leader, 'notice')).message, /Transférez/);
    command(leader, 'guild.role', {id:member.profile.id,role:'leader'});
    await event(member, 'social', state => state.guild?.members.find(m => m.id === member.profile.id)?.role === 'leader');
    const closed = once(leader.socket, 'close'); leader.socket.close(); await closed;
    await event(member, 'social', state => state.party?.members.length === 1 && state.party.leader === member.profile.id);
    const returned = await connect('Meneur', saved.token);
    assert.equal(returned.profile.guildId, guild.id);
    assert.equal(returned.profile.bank.gold, 20);
    assert.equal(returned.profile.bank.items[0].id, item.id);
    const reopened = await openStore();
    assert.equal(reopened.guilds.get(guild.id).crest.symbol, 'stag'); await reopened.close();
    restartProof = {token:saved.token, profile:returned.profile, guild};
});

// This restarts the actual server process, not just a storage adapter.
test('server restart restores the character, bank and guild for the same browser identity', async () => {
    const exited = once(child, 'exit'); child.kill();
    assert.equal((await exited)[0], 0);
    await startServer();
    const returned = await connect('Ignored', restartProof.token);
    assert.deepEqual(returned.profile, restartProof.profile);
    const social = (await waitFor(returned, message => message[0] === 32 && message[1] === 'social' && message[2].guild))[2];
    assert.equal(social.guild.id, restartProof.guild.id);
    assert.equal(social.guild.crest.symbol, 'stag');
    assert.equal(social.party, null);
    assert.equal((await (await fetch(base + '/status')).json()).storage, mongo ? 'mongodb' : 'sqlite');
    const ally = await connect('Ignored', progressionProof.token);
    assert.equal(ally.profile.experience, progressionProof.experience);
    assert.equal(ally.profile.progression.level, progressionProof.level);
    assert.equal(ally.profile.maxHitPoints, progressionProof.maxHitPoints);
    assert.equal(ally.profile.stats.attackBonus, 1);
});

test('shared harvesting, crafted equipment and profession progress survive reconnect without duplicate rewards', async () => {
    const store = await openStore(), saved = await store.open('', 'Artisan'); saved.profile.gold = 10; await store.save(saved); await store.close();
    const hero = await connect('Artisan', saved.token), rival = await connect('Concurrent');
    const event = (peer, type, predicate = () => true) => waitFor(peer, message => message[0] === 32 && message[1] === type && predicate(message[2]), 200).then(message => message[2]);
    const command = (peer, action, payload) => peer.send([31, action, payload]);
    const content = require('../shared/content/crafting.json');
    const wood = content.nodes.find(node => node.kind === 70), iron = content.nodes.filter(node => node.kind === 71);
    const id = node => Number('8' + node.x + node.y);
    await moveTo(hero,wood.x,wood.y,1); await moveTo(rival,wood.x,wood.y,1);
    command(hero,'resource.harvest',{id:id(wood)}); await event(hero,'harvest',data=>data.state==='harvesting');
    command(rival,'resource.harvest',{id:id(wood)}); assert.match((await event(rival,'notice')).message,/autre aventurier/);
    await event(hero,'harvest',data=>data.state==='complete');
    let profile = (await waitFor(hero,m=>m[0]===27))[1]; assert.equal(profile.items.find(i=>i.kind===100).quantity,2); assert.equal(profile.professions.lumbering,3);
    command(hero,'resource.harvest',{id:id(wood)}); assert.match((await event(hero,'notice')).message,/renouveler/);
    assert.equal(rival.messages.some(m=>m[0]===27 && m[1].items.some(i=>i.kind===100)),false);
    for(const node of iron.slice(0,2)) {
        await moveTo(hero,node.x,node.y,1); command(hero,'resource.harvest',{id:id(node)});
        await event(hero,'harvest',data=>data.state==='complete'); profile=(await waitFor(hero,m=>m[0]===27))[1];
    }
    assert.equal(profile.items.find(i=>i.kind===101).quantity,4);
    command(hero,'craft.make',{recipe:'steel-sword'}); assert.match((await event(hero,'notice')).message,/PNJ/);
    const workshop=require('../shared/content/social.json').services.find(s=>s.services.includes('craft'));
    await moveTo(hero,workshop.position.x,workshop.position.y,1);
    command(hero,'service.open',{id:id(workshop.position)}); await event(hero,'service');
    command(hero,'craft.make',{recipe:'steel-sword'}); command(hero,'craft.make',{recipe:'steel-sword'});
    const crafted=await event(hero,'craft'); await event(hero,'notice',data=>data.error);
    profile=(await waitFor(hero,m=>m[0]===27))[1]; assert.equal(profile.gold,7);assert.equal(profile.items.some(i=>i.kind===100||i.kind===101),false);
    assert.equal(profile.items.filter(i=>i.id===crafted.id).length,1); assert.equal(profile.professions.smithing,10);
    hero.send([28,crafted.id]); profile=(await waitFor(hero,m=>m[0]===27))[1]; assert.equal(profile.equipped.weapon,crafted.id);
    await closePeer(hero); await closePeer(rival);
    const again=await connect('Artisan',saved.token); assert.equal(again.profile.equipped.weapon,crafted.id);assert.equal(again.profile.professions.smithing,10);assert.equal(again.profile.gold,7);await closePeer(again);
});

test('a real storage conflict stops the server without acknowledging or overwriting the command', {skip:!mongo}, async () => {
    const hero = await connect('Conflict');
    const store = await openStore();
    try {
        const external = await store.open(hero.profile.token);
        external.profile.gold = 777; await store.save(external);
        const exited = once(child, 'exit');
        const closed = once(hero.socket, 'close');
        hero.send([31, 'inventory.move', {id:hero.profile.items[0].id,slot:23}]);
        await closed;
        assert.equal((await exited)[0], 1);
        assert.equal(hero.messages.some(message => message[0] === 27), false);
        const saved = await store.open(hero.profile.token);
        assert.equal(saved.profile.gold, 777);
        assert.equal(saved.profile.items[0].slot, 0);
    } finally { await store.close(); }
});
