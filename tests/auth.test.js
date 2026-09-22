const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createHash, randomBytes } = require('node:crypto');
const { WebSocket } = require('ws');
const { MongoProfileStore } = require('../server/js/storage/mongo');
const { AuthService } = require('../server/js/auth/service');
const path = require('node:path');

// Real GoTrue + PostgreSQL + Mailpit + Mongo; no mocked identity or test login bypass.
test('accounts: verified signup, ownership, persistence, session rotation, recovery and two players', { skip: process.env.BQ_TEST_AUTH !== '1', timeout: 90000 }, async t => {
    process.loadEnvFile(path.resolve('data/auth.env'));
    const database = 'bq_test_auth_' + process.pid + '_' + Date.now();
    const store = await new MongoProfileStore(process.env.MONGODB_URI, database).connect();
    const auth = new AuthService(store.db);
    const sockets = [], users = [];
    let child, base;
    async function start() {
        child = spawn(process.execPath, ['server/js/main.js'], { env: { ...process.env, PORT: '0', MONGODB_DATABASE: database, BQ_DATABASE: '', NODE_ENV: 'test', BQ_TEST_LEGACY_AUTH: '' } });
        base = await new Promise((resolve, reject) => {
            child.stdout.on('data', data => { const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
            child.once('exit', code => reject(new Error('Startup failed: ' + code)));
            child.stderr.on('data', data => { if (data.toString().includes('Startup failed')) reject(new Error(data.toString())); });
        });
    }
    async function stop() { const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended; }
    async function api(route, body, cookie, origin = base) {
        const response = await fetch(base + '/api/' + route, { method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
    }
    async function mailCode(email, subject) {
        for (let i = 0; i < 50; i++) {
            const inbox = await fetch('http://127.0.0.1:54326/api/v1/messages').then(r => r.json());
            const msg = inbox.messages.find(m => m.To.some(to => to.Address === email) && (!subject || m.Subject.includes(subject)));
            if (msg) {
                const mail = await fetch('http://127.0.0.1:54326/api/v1/message/' + msg.ID).then(r => r.json());
                const code = mail.Text.match(/\b\d{6}\b/); if (code) return code[0];
            }
            await new Promise(r => setTimeout(r, 100));
        }
        throw new Error('Confirmation email missing');
    }
    async function register(suffix) {
        const email = `bqtest-${Date.now()}-${suffix}@example.com`, password = randomBytes(18).toString('hex');
        assert.equal((await api('auth/signup', { email, password })).status, 200);
        assert.equal((await api('auth/signin', { email, password })).status, 400, 'unconfirmed email cannot play');
        const result = await api('auth/verify', { email, code: await mailCode(email) });
        assert.equal(result.status, 200); assert.match(result.cookie, /HttpOnly; SameSite=Lax; Max-Age=2592000/);
        const user = { email, password, cookie: result.cookie.split(';')[0], id: result.data.account.id };
        users.push(user); return user;
    }
    async function connect(user, character) {
        const socket = new WebSocket(base.replace('http', 'ws'), { headers: { Cookie: user.cookie, Origin: base } });
        const peer = { socket, messages: [] }; sockets.push(socket);
        socket.on('message', raw => {
            if (raw.toString() === 'go') return;
            const data = JSON.parse(raw); peer.messages.push(...(Array.isArray(data[0]) ? data : [data]));
        });
        await once(socket, 'open'); socket.send(JSON.stringify([0, 'Untrusted name', 26, 66, character])); return peer;
    }
    async function packet(peer, type) {
        for (let i = 0; i < 100; i++) { const result = peer.messages.find(p => p[0] === type); if (result) return result; await new Promise(r => setTimeout(r, 20)); }
        throw new Error('Missing packet ' + type);
    }
    t.after(async () => {
        sockets.forEach(socket => socket.terminate());
        if (child?.exitCode === null) await stop();
        // Delete only the accounts created by this test through the Auth admin API.
        const { createHmac } = require('node:crypto');
        const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
        const claims = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ role: 'service_role', exp: Math.floor(Date.now()/1000) + 300 });
        const token = claims + '.' + createHmac('sha256', process.env.AUTH_JWT_SECRET).update(claims).digest('base64url');
        for (const user of users) await auth.request('/admin/users/' + user.id, undefined, token, 'DELETE');
        await store.db.dropDatabase(); await store.close();
    });
    await start();
    await t.test('anonymous HTTP and WebSocket access are rejected; login CSRF is rejected', async () => {
        assert.equal((await api('characters')).status, 401);
        assert.equal((await api('auth/signin', { email: 'x@example.com', password: 'something' }, null, 'https://evil.example')).status, 403);
        const socket = new WebSocket(base.replace('http', 'ws')); socket.on('error', () => {});
        const response = await new Promise(resolve => socket.on('unexpected-response', (_, response) => { resolve(response.statusCode); response.destroy(); socket.terminate(); }));
        assert.equal(response, 401);
    });
    const alice = await register('alice'), bob = await register('bob');
    let hero, ally, legacy;
    await t.test('characters have bounded slots, unique names and private ownership', async () => {
        hero = (await api('characters', { name: 'Aube' + Date.now().toString().slice(-7) }, alice.cookie)).data.character;
        ally = (await api('characters', { name: 'Lune' + Date.now().toString().slice(-7) }, bob.cookie)).data.character;
        assert.ok(hero?.id); assert.ok(ally?.id);
        assert.equal((await api('characters', { name: hero.name }, bob.cookie)).status, 409);
        assert.equal((await api('characters', undefined, bob.cookie)).data.characters.length, 1);
        const intruder = await connect(bob, hero.id); const [code] = await once(intruder.socket, 'close'); assert.equal(code, 1008);
    });
    await t.test('native bearer uses the same identity; forged tokens are refused', async () => {
        const row = await store.db.collection('auth_sessions').findOne({ accountId: bob.id });
        const token = auth.unseal(row.tokens).access_token;
        const response = await fetch(base + '/api/characters', { headers: { Authorization: 'Bearer ' + token } });
        assert.equal(response.status, 200); assert.equal((await response.json()).characters[0].id, ally.id);
        assert.equal((await fetch(base + '/api/characters', { headers: { Authorization: 'Bearer forged' } })).status, 401);
        const socket = new WebSocket(base.replace('http', 'ws'), { headers: { Authorization: 'Bearer ' + token } }); sockets.push(socket);
        await once(socket, 'open'); const closed = once(socket, 'close'); socket.close(); await closed;
    });
    let a, b;
    await t.test('two authenticated accounts play together; duplicate account cannot enter', async () => {
        a = await connect(alice, hero.id); b = await connect(bob, ally.id);
        const profile = (await packet(a, 27))[1]; assert.equal(profile.id, hero.id); assert.equal(profile.name, hero.name); assert.equal(profile.token, undefined);
        await packet(b, 1);
        a.messages = a.messages.filter(message => message[0] !== 27);
        a.socket.send(JSON.stringify([31, 'inventory.move', { id: profile.items[0].id, slot: 23 }]));
        const saved = (await packet(a, 27))[1]; assert.equal(saved.items.find(item => item.id === profile.items[0].id).slot, 23);
        assert.equal((await store.openOwned(alice.id, hero.id)).profile.items[0].slot, 23);
        a.socket.send(JSON.stringify([11, 'Bonjour compte voisin']));
        for (let i=0;i<100 && !JSON.stringify(b.messages).includes('Bonjour compte voisin');i++) await new Promise(r=>setTimeout(r,20));
        assert.match(JSON.stringify(b.messages), /Bonjour compte voisin/);
        const duplicate = await connect(alice, hero.id); assert.equal((await once(duplicate.socket, 'close'))[0], 1008);
    });
    await t.test('encrypted sessions refresh once across concurrent tabs and survive game restart', async () => {
        const hash = createHash('sha256').update(alice.cookie.split('=')[1]).digest('hex');
        const before = await store.db.collection('auth_sessions').findOne({ _id: hash });
        assert.equal(before.tokens.includes(alice.password), false); assert.equal(before.tokens.includes('access_token'), false);
        await store.db.collection('auth_sessions').updateOne({ _id: hash }, { $set: { refreshAt: 0 } });
        const results = await Promise.all(Array.from({ length: 8 }, () => api('auth/session', undefined, alice.cookie)));
        results.forEach(r => assert.equal(r.data.account.id, alice.id));
        const after = await store.db.collection('auth_sessions').findOne({ _id: hash }); assert.notEqual(after.tokens, before.tokens);
        a.socket.close(); b.socket.close(); await stop(); await start();
        assert.equal((await api('auth/session', undefined, alice.cookie)).data.account.id, alice.id);
        const rejoined = await connect(alice, hero.id); assert.equal((await packet(rejoined, 27))[1].id, hero.id); rejoined.socket.close();
    });
    await t.test('legacy claim preserves possessions; another account cannot reclaim; slot races are bounded', async () => {
        legacy = await store.open('', 'Ancien' + Date.now().toString().slice(-6)); legacy.profile.gold = 77; await store.save(legacy);
        const before = structuredClone(legacy.profile);
        const claimed = await api('characters/claim', { token: legacy.token }, alice.cookie); assert.equal(claimed.status, 200);
        assert.equal(claimed.data.character.gold, 77);
        assert.equal((await api('characters/claim', { token: legacy.token }, bob.cookie)).status, 404);
        const saved = await store.openOwned(alice.id, before.id); assert.deepEqual(saved.profile.items, before.items);
        assert.equal(await store.open(legacy.token), null, 'legacy credential cannot reopen a claimed character');
        const race = await Promise.all([api('characters', { name: 'Trois' + Date.now().toString().slice(-6) }, alice.cookie), api('characters', { name: 'Quatre' + Date.now().toString().slice(-6) }, alice.cookie)]);
        assert.deepEqual(race.map(r=>r.status).sort(), [200,409]);
        assert.equal((await api('characters', undefined, alice.cookie)).data.characters.length, 3);
    });
    await t.test('logout closes the socket and invalidates a copied cookie immediately', async () => {
        const peer = await connect(bob, ally.id); await packet(peer, 27);
        const row = await store.db.collection('auth_sessions').findOne({ accountId: bob.id });
        const oldBearer = auth.unseal(row.tokens).access_token;
        const closed = once(peer.socket, 'close'); assert.equal((await api('auth/logout', {}, bob.cookie)).status, 200); await closed;
        assert.equal((await api('auth/session', undefined, bob.cookie)).data.account, null);
        assert.equal((await fetch(base + '/api/characters', { headers: { Authorization: 'Bearer ' + oldBearer } })).status, 401, 'revoked native token is refused');
    });
    await t.test('password recovery invalidates other sessions and preserves characters', async () => {
        const old = (await api('auth/signin', { email: alice.email, password: alice.password })).cookie.split(';')[0];
        assert.equal((await api('auth/recover', { email: alice.email })).status, 200);
        const password = randomBytes(18).toString('hex');
        const result = await api('auth/reset-password', { email: alice.email, code: await mailCode(alice.email, 'Reset'), password });
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.equal((await api('auth/session', undefined, old)).data.account, null);
        assert.equal((await api('auth/signin', { email: alice.email, password: alice.password })).status, 400);
        assert.equal((await api('characters', undefined, result.cookie.split(';')[0])).data.characters.length, 3);
    });
});
