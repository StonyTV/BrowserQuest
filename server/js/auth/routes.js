const { randomBytes, createHash } = require('node:crypto');
const { AuthError } = require('./service');
const { SLOTS } = require('./characters');
function originFor(req) {
    return process.env.PUBLIC_APP_URL || `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
}
async function jsonBody(req) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new AuthError(415, 'Format de demande invalide.');
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 8192) throw new AuthError(413, 'Demande trop longue.');
    }
    try {
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        return value;
    } catch { throw new AuthError(400, 'Demande invalide.'); }
}
class AuthRoutes {
    constructor(auth, characters) { this.auth = auth; this.characters = characters; this.attempts = new Map(); }
    rate(req, email) {
        const now = Date.now();
        for (const [key, entry] of this.attempts) if (entry.until < now) this.attempts.delete(key);
        for (const key of ['ip:' + req.socket.remoteAddress, 'email:' + String(email || '').toLowerCase()]) {
            if (key === 'email:') continue;
            const entry = this.attempts.get(key) || { count: 0, until: now + 60000 };
            if (entry.count >= (key.startsWith('ip:') ? 30 : 10) || this.attempts.size > 10000) throw new AuthError(429, 'Trop de tentatives. Réessayez dans une minute.');
            entry.count++; this.attempts.set(key, entry);
        }
    }
    async handle(req, res, pathname, server) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        try {
            const auth = this.auth;
            if (req.method === 'GET' && pathname === '/api/auth/callback') {
                const value = auth.readCookie(req, 'bq_oauth');
                let flow;
                try { flow = auth.unseal(value || ''); } catch { throw new AuthError(400, 'La connexion a expiré. Recommencez.'); }
                if (flow.until < Date.now() || flow.origin !== originFor(req)) throw new AuthError(400, 'La connexion a expiré. Recommencez.');
                const code = new URL(req.url, originFor(req)).searchParams.get('code');
                if (!code || code.length > 2048) throw new AuthError(400, 'La connexion a été annulée.');
                const tokens = await auth.request('/token?grant_type=pkce', { auth_code: code, code_verifier: flow.verifier });
                await auth.establish(req, res, tokens);
                res.setHeader('Set-Cookie', [res.getHeader('Set-Cookie'), auth.cookie(req, '', 'bq_oauth', 0)]);
                res.writeHead(303, { Location: '/' }).end(); return;
            }
            let body;
            if (req.method === 'POST') {
                if (req.headers.origin !== originFor(req) && !(req.headers.authorization && !req.headers.origin)) throw new AuthError(403, 'Origine de la demande refusée.');
                body = await jsonBody(req);
                this.rate(req, body.email);
            } else if (req.method !== 'GET') throw new AuthError(405, 'Méthode non autorisée.');
            const principal = await auth.authenticate(req);
            let result;
            if (req.method === 'GET' && pathname === '/api/auth/session') {
                result = { account: principal ? { id: principal.accountId, email: principal.email } : null, providers: auth.providers };
            } else if (req.method === 'POST' && pathname === '/api/auth/signin') {
                this.credentials(body);
                const tokens = await auth.request('/token?grant_type=password', { email: body.email, password: body.password });
                result = { account: await auth.establish(req, res, tokens) };
            } else if (req.method === 'POST' && pathname === '/api/auth/signup') {
                this.credentials(body);
                await auth.request('/signup', { email: body.email, password: body.password });
                result = { confirmationRequired: true };
            } else if (req.method === 'POST' && pathname === '/api/auth/verify') {
                this.code(body);
                const tokens = await auth.request('/verify', { email: body.email, token: body.code, type: 'signup' });
                result = { account: await auth.establish(req, res, tokens) };
            } else if (req.method === 'POST' && pathname === '/api/auth/resend') {
                this.email(body.email);
                await auth.request('/resend', { email: body.email, type: 'signup' });
                result = { sent: true };
            } else if (req.method === 'POST' && pathname === '/api/auth/recover') {
                this.email(body.email);
                await auth.request('/recover', { email: body.email });
                result = { sent: true };
            } else if (req.method === 'POST' && pathname === '/api/auth/reset-password') {
                this.credentials(body); this.code(body);
                const tokens = await auth.request('/verify', { email: body.email, token: body.code, type: 'recovery' });
                const user = await auth.request('/user', { password: body.password }, tokens.access_token, 'PUT');
                await auth.sessions.deleteMany({ accountId: user.id });
                server.forEachConnection(connection => { if (connection.auth?.accountId === user.id) connection.close('Password changed'); });
                await auth.request('/logout?scope=global', {}, tokens.access_token);
                const fresh = await auth.request('/token?grant_type=password', { email: body.email, password: body.password });
                result = { account: await auth.establish(req, res, fresh) };
            } else if (req.method === 'POST' && pathname === '/api/auth/oauth') {
                if (!auth.providers.includes(body.provider)) throw new AuthError(400, 'Ce mode de connexion n’est pas encore disponible.');
                const verifier = randomBytes(32).toString('base64url');
                const flow = auth.seal({ verifier, origin: originFor(req), until: Date.now() + 600000 });
                res.setHeader('Set-Cookie', auth.cookie(req, flow, 'bq_oauth', 600));
                const url = new URL(auth.publicUrl + '/authorize');
                url.search = new URLSearchParams({ provider: body.provider, redirect_to: originFor(req) + '/api/auth/callback',
                    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 's256' });
                result = { url: url.toString() };
            } else {
                if (!principal) throw new AuthError(401, 'Connectez-vous pour retrouver vos personnages.');
                if (req.method === 'POST' && pathname === '/api/auth/logout') {
                    await auth.logout(principal);
                    server.forEachConnection(connection => {
                        if (principal.sessionId ? connection.auth?.sessionId === principal.sessionId : connection.auth?.token === principal.token) connection.close('Signed out');
                    });
                    res.setHeader('Set-Cookie', auth.cookie(req, '', undefined, 0)); result = { signedOut: true };
                } else if (req.method === 'GET' && pathname === '/api/characters') {
                    result = { characters: await this.characters.list(principal.accountId), slots: SLOTS };
                } else if (req.method === 'POST' && pathname === '/api/characters') {
                    result = { character: await this.characters.create(principal.accountId, body.name) };
                } else if (req.method === 'POST' && pathname === '/api/characters/legacy') {
                    result = { character: this.characters.summary(await this.characters.legacy(principal.accountId, body.token)) };
                } else if (req.method === 'POST' && pathname === '/api/characters/claim') {
                    result = { character: await this.characters.claim(principal.accountId, body.token, body.name) };
                } else throw new AuthError(404, 'Page introuvable.');
            }
            res.end(JSON.stringify(result));
        } catch (error) {
            if (!error.status) console.error('Account request failed:', error.name);
            if (pathname === '/api/auth/callback') {
                res.setHeader('Set-Cookie', this.auth.cookie(req, '', 'bq_oauth', 0));
                res.writeHead(303, { Location: '/?auth_error=oauth' }).end(); return;
            }
            res.writeHead(error.status || 500).end(JSON.stringify({ error: error.status ? error.message : 'Impossible de terminer cette action. Réessayez.' }));
        }
    }
    email(value) {
        if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new AuthError(400, 'Saisissez une adresse e-mail valide.');
    }
    credentials(body) {
        this.email(body.email);
        if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) throw new AuthError(400, 'Le mot de passe doit contenir de 8 à 128 caractères.');
    }
    code(body) {
        this.email(body.email);
        if (!/^\d{6}$/.test(body.code || '')) throw new AuthError(400, 'Saisissez le code à 6 chiffres reçu par e-mail.');
    }
}
module.exports = { AuthRoutes, originFor };
