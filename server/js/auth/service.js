const { randomBytes, createHash, createCipheriv, createDecipheriv } = require('node:crypto');
const COOKIE = 'bq_session';
const LIFETIME = 30 * 24 * 60 * 60;
class AuthError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
class AuthService {
    constructor(db) {
        this.url = process.env.AUTH_URL || 'http://127.0.0.1:54325';
        this.publicUrl = process.env.AUTH_PUBLIC_URL || this.url;
        if (!/^[a-f0-9]{64}$/.test(process.env.AUTH_SESSION_KEY || '')) throw new Error('Run npm run auth:init; AUTH_SESSION_KEY is required.');
        this.key = Buffer.from(process.env.AUTH_SESSION_KEY, 'hex');
        this.sessions = db.collection('auth_sessions');
        this.refreshing = new Map();
    }
    async init() {
        await this.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await this.sessions.createIndex({ accountId: 1 });
        const settings = await this.request('/settings');
        this.providers = ['google', 'apple'].filter(provider => settings.external?.[provider]);
        return this;
    }
    async request(route, body, token, method = body ? 'POST' : 'GET') {
        let response;
        try {
            response = await fetch(this.url + route, { method, signal: AbortSignal.timeout(8000),
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                body: body ? JSON.stringify(body) : undefined });
        } catch { throw new AuthError(503, 'La connexion est momentanément indisponible. Réessayez dans un instant.'); }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const messages = { email_not_confirmed: 'Confirmez votre adresse avec le code reçu par e-mail.',
                invalid_credentials: 'Adresse ou mot de passe incorrect.', otp_expired: 'Ce code est invalide ou a expiré.',
                user_already_exists: 'Cette adresse possède déjà un compte.', weak_password: 'Choisissez un mot de passe d’au moins 8 caractères.',
                same_password: 'Choisissez un nouveau mot de passe.' };
            throw new AuthError(response.status === 429 ? 429 : response.status >= 500 ? 503 : 400,
                response.status === 429 ? 'Trop de tentatives. Patientez un peu avant de réessayer.' : messages[data.error_code] || 'Impossible de valider cette demande. Vérifiez les informations puis réessayez.');
        }
        return data;
    }
    seal(data) {
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
        return Buffer.concat([iv, cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]).toString('base64url');
    }
    unseal(value) {
        const bytes = Buffer.from(value, 'base64url');
        const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(-16));
        return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString());
    }
    hash(value) { return createHash('sha256').update(value).digest('hex'); }
    cookie(req, value, name = COOKIE, age = LIFETIME) {
        const secure = process.env.PUBLIC_APP_URL?.startsWith('https://') || req.socket.encrypted;
        return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
    }
    readCookie(req, name = COOKIE) {
        return (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1);
    }
    async establish(req, res, tokens) {
        const user = await this.request('/user', undefined, tokens.access_token);
        const secret = randomBytes(32).toString('hex');
        await this.sessions.insertOne({ _id: this.hash(secret), accountId: user.id,
            tokens: this.seal(tokens), refreshAt: Date.now() + (tokens.expires_in - 60) * 1000,
            expiresAt: new Date(Date.now() + LIFETIME * 1000) });
        res.setHeader('Set-Cookie', this.cookie(req, secret));
        return { id: user.id, email: user.email };
    }
    async authenticate(req) {
        if (req.headers.authorization) {
            if (!/^Bearer [^\s]+$/.test(req.headers.authorization)) return null;
            const token = req.headers.authorization.slice(7);
            try {
                const user = await this.request('/user', undefined, token);
                return { accountId: user.id, email: user.email, token };
            } catch (error) { if (error.status === 503) throw error; return null; }
        }
        const secret = this.readCookie(req);
        if (!/^[a-f0-9]{64}$/.test(secret || '')) return null;
        const id = this.hash(secret);
        if (this.refreshing.has(id)) return this.refreshing.get(id);
        const task = this.authenticateSession(id);
        this.refreshing.set(id, task);
        try { return await task; } finally { this.refreshing.delete(id); }
    }
    async authenticateSession(id) {
        const row = await this.sessions.findOne({ _id: id, expiresAt: { $gt: new Date() } });
        if (!row) return null;
        let tokens = this.unseal(row.tokens);
        try {
            if (row.refreshAt <= Date.now()) {
                tokens = await this.request('/token?grant_type=refresh_token', { refresh_token: tokens.refresh_token });
                const result = await this.sessions.updateOne({ _id: id }, { $set: { tokens: this.seal(tokens), refreshAt: Date.now() + (tokens.expires_in - 60) * 1000 } });
                if (!result.matchedCount) return null;
            }
            const user = await this.request('/user', undefined, tokens.access_token);
            if (user.id !== row.accountId) return null;
            return { accountId: user.id, email: user.email, sessionId: id, token: tokens.access_token };
        } catch (error) {
            if (error.status === 503) throw error;
            await this.sessions.deleteOne({ _id: id });
            return null;
        }
    }
    async logout(principal) {
        if (principal.sessionId) await this.sessions.deleteOne({ _id: principal.sessionId });
        await this.request('/logout?scope=local', {}, principal.token).catch(() => {});
    }
}
module.exports = { AuthService, AuthError };
