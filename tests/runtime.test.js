const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const directory = mkdtempSync(path.join(tmpdir(), 'browserquest-test-'));
let child, base;
const peers = [];
before(async () => {
    child = spawn(process.execPath, ['server/js/main.js'], { env: { ...process.env, PORT: '0', BQ_DATABASE: path.join(directory, 'characters.sqlite') } });
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
});
after(async () => {
    peers.forEach(peer => peer.socket.terminate());
    if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    rmSync(directory, { recursive: true, force: true });
});
async function connect(name, token = '') {
    const socket = new WebSocket(base.replace('http', 'ws'));
    const messages = [];
    socket.on('message', data => {
        if (data.toString() === 'go') return;
        const message = JSON.parse(data);
        messages.push(...(Array.isArray(message[0]) ? message : [message]));
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
async function waitFor(peer, predicate) {
    for (let i = 0; i < 100; i++) {
        const index = peer.messages.findIndex(predicate);
        if (index !== -1) return peer.messages.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Expected message missing (' + predicate.toString() + '): ' + JSON.stringify(peer.messages.filter(message => message[0] !== 33).slice(-6)));
}
test('HTTP serves game and shared protocol, never server files', async () => {
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
    bob.send([4, alice.welcome[3], alice.welcome[4]]);
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
    for (const value of ['{broken', 'null', '{}', '[4,1.5,2]', '[999]']) {
        const peer = await connect();
        const closed = once(peer.socket, 'close');
        peer.socket.send(value);
        assert.equal((await closed)[0], 1008);
    }
    assert.equal((await (await fetch(base + '/status')).json()).ready, true);
});

test('loot is collected once, equipment is owned, and reconnect restores the bag', async () => {
    const hero = await connect('Collector');
    const list = await waitFor(hero, message => message[0] === 19);
    hero.send([20, ...list.slice(1)]);
    const sword = await waitFor(hero, message => message[0] === 2 && message[2] === 61);
    hero.send([12, sword[1]]); // Too far away: must not grant any equipment.
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(hero.messages.some(message => message[0] === 27), false);
    hero.send([4, sword[3], sword[4]]);
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
test('server schedules creature damage and rewards a kill exactly once', async () => {
    const hero = await connect('Fighter');
    const list = await waitFor(hero, message => message[0] === 19);
    hero.send([20, ...list.slice(1)]);
    const rat = await waitFor(hero, message => message[0] === 2 && message[2] === 2);
    const map = require('../server/maps/world_server.json');
    const adjacent = [[rat[3] + 1, rat[4]], [rat[3] - 1, rat[4]], [rat[3], rat[4] + 1], [rat[3], rat[4] - 1]]
        .find(([x,y]) => !map.collisions.includes(y * map.width + x));
    hero.send([4, ...adjacent]);
    hero.send([6, rat[1]]);
    const damage = await waitFor(hero, message => message[0] === 10 && message[1] < 80);
    assert.ok(damage[1] >= 0); // No HURT message was sent by this client.
    for (let i = 0; i < 12 && !hero.messages.some(message => message[0] === 18); i++) {
        hero.send([8, rat[1]]);
        await new Promise(resolve => setTimeout(resolve, 650));
    }
    await waitFor(hero, message => message[0] === 18);
    const profile = (await waitFor(hero, message => message[0] === 27))[1];
    assert.equal(profile.kills, 1);
    assert.ok(profile.gold >= 1 && profile.gold <= 4);
    hero.send([8, rat[1]]);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(hero.messages.some(message => message[0] === 27), false);
});
test('a full bag rejects equipment without deleting the world item', async () => {
    const { ProfileStore, createItem } = require('../server/js/profiles');
    const store = new ProfileStore(path.join(directory, 'characters.sqlite'));
    const session = store.open('', 'FullBag');
    while (session.profile.items.length < 24) session.profile.items.push(createItem(61));
    store.save(session);
    store.close();
    const hero = await connect('FullBag', session.token);
    const list = await waitFor(hero, message => message[0] === 19);
    hero.send([20, ...list.slice(1)]);
    const sword = await waitFor(hero, message => message[0] === 2 && message[2] === 61);
    hero.send([4, sword[3], sword[4]]);
    hero.send([12, sword[1]]);
    assert.equal((await waitFor(hero, message => message[0] === 30))[2], false);
    hero.send([20, sword[1]]);
    assert.equal((await waitFor(hero, message => message[0] === 2 && message[1] === sword[1]))[2], 61);
});

test('guilds, parties and bank enforce ownership, privacy and persistent membership', async () => {
    const { ProfileStore, createItem } = require('../server/js/profiles');
    const store = new ProfileStore(path.join(directory, 'characters.sqlite'));
    const saved = store.open('', 'Meneur'); saved.profile.gold = 100;
    const item = createItem(61, 95); saved.profile.items.push(item); store.save(saved); store.close();
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
    leader.send([4, npc[3], npc[4]]);
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
    leader.send([4,guard[3],guard[4]]);
    command(leader, 'service.open', {id:guard[1]}); await event(leader, 'service');
    command(leader, 'bank.item', {id:item.id,deposit:true});
    const banked = (await waitFor(leader, message => message[0] === 27 && message[1].bank.items.length === 1))[1];
    assert.equal(banked.items.some(value => value.id === item.id), false);
    command(leader, 'bank.item', {id:item.id,deposit:true});
    assert.match((await event(leader, 'notice')).message, /introuvable/);
    command(leader, 'bank.gold', {amount:20,deposit:true});
    await waitFor(leader, message => message[0] === 27 && message[1].bank.gold === 20);
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
    const reopened = new ProfileStore(path.join(directory, 'characters.sqlite'));
    assert.equal(reopened.guilds.get(guild.id).crest.symbol, 'stag'); reopened.close();
});
