const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');
const CommandQueue = require('./command-queue');
const root = path.resolve(__dirname, '../../client');
const shared = path.resolve(__dirname, '../../shared');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

class Connection {
    constructor(id, socket, server) {
        this.id = id;
        this.socket = socket;
        this.alive = true;
        this.messages = 0;
        this.pending = 0;
        this.windowStart = Date.now();
        socket.on('pong', () => { this.alive = true; });
        socket.on('error', () => socket.terminate());
        socket.on('message', (data, binary) => {
            if (this.closing || server.stopping) return;
            if (Date.now() - this.windowStart > 1000) {
                this.messages = 0;
                this.windowStart = Date.now();
            }
            if (binary || ++this.messages > 100) return this.close('Invalid traffic');
            let message;
            try { message = JSON.parse(data.toString()); }
            catch { return this.close('Invalid JSON'); }
            if (!Array.isArray(message) || !Number.isSafeInteger(message[0])) return this.close('Invalid envelope');
            if (this.pending >= 100 || server.commands.pending >= 1000) return this.close('Server busy');
            this.pending++;
            server.commands.run(() => this.listen_callback?.(message))
                .catch(() => {}) // The queue reports fatal failures to the server once.
                .finally(() => this.pending--);
        });
        socket.once('close', () => {
            server.commands.run(() => this.close_callback?.()).catch(() => {});
            delete server._connections[id];
        });
    }
    listen(callback) { this.listen_callback = callback; }
    onClose(callback) { this.close_callback = callback; }
    send(message) { this.sendUTF8(JSON.stringify(message)); }
    sendUTF8(data) {
        if (this.socket.readyState !== WebSocket.OPEN) return;
        if (this.socket.bufferedAmount > 1024 * 1024) return this.socket.terminate();
        this.socket.send(data);
    }
    close(reason) { this.closing = true; this.socket.close(1008, reason.slice(0, 100)); }
}

class GameServer {
    constructor(port, host, onFailure, { auth, routes, testLegacy = false } = {}) {
        this._connections = {};
        this.commands = new CommandQueue(onFailure);
        this.counter = 500000;
        this._httpServer = http.createServer((req, res) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            let pathname;
            try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
            catch { res.writeHead(400).end(); return; }
            if (pathname.includes('\0')) { res.writeHead(400).end(); return; }
            if (pathname.startsWith('/api/')) {
                if (testLegacy && pathname === '/api/auth/session') {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Cache-Control', 'no-store');
                    res.end(JSON.stringify({ testLegacy: true }));
                } else if (routes) void routes.handle(req, res, pathname, this);
                else res.writeHead(503).end();
                return;
            }
            if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
            if (pathname === '/status') {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-store');
                res.end(this.status_callback ? this.status_callback() : '{}');
                return;
            }
            const isShared = pathname.startsWith('/shared/');
            const base = isShared ? shared : root;
            const relative = isShared ? pathname.slice(8) : pathname.slice(1) || 'index.html';
            const file = path.resolve(base, relative);
            if (!file.startsWith(base + path.sep) || relative.split('/').some(part => part.startsWith('.'))) {
                res.writeHead(403).end(); return;
            }
            fs.readFile(file, (err, data) => {
                if (err) { res.writeHead(404).end(); return; }
                res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.end(req.method === 'HEAD' ? undefined : data);
            });
        });
        this.wss = new WebSocketServer({ server: this._httpServer, maxPayload: 8192, perMessageDeflate: false,
            verifyClient: ({ origin, req }, done) => {
                const expected = require('./auth/routes').originFor(req);
                if (origin && origin !== expected) return done(false, 403);
                if (testLegacy) return done(true);
                if (!auth) return done(false, 503);
                auth.authenticate(req).then(principal => {
                    req.principal = principal;
                    done(Boolean(principal), 401);
                }).catch(() => done(false, 503));
            }
        });
        this.wss.on('error', error => this.commands.run(() => { throw error; }).catch(() => {}));
        this.wss.on('connection', (socket, req) => {
            if (this.stopping) { socket.close(1013, 'Server stopping'); return; }
            if (Object.keys(this._connections).length >= 250) { socket.close(1013, 'Server full'); return; }
            const connection = new Connection(++this.counter, socket, this);
            connection.auth = req.principal;
            connection.authRequest = req;
            this._connections[connection.id] = connection;
            if (this.connection_callback) this.connection_callback(connection);
        });
        this.heartbeat = setInterval(() => this.forEachConnection(connection => {
            if (!connection.alive) return connection.socket.terminate();
            connection.alive = false;
            connection.socket.ping();
            if (auth) auth.authenticate(connection.authRequest).then(principal => {
                if (!principal) connection.close('Session expired');
                else connection.auth = principal;
            }).catch(() => connection.close('Authentication unavailable'));
        }), 30000);
        this.heartbeat.unref();
        this._httpServer.listen(port, host, () => console.log('BrowserQuest: http://' + host + ':' + this._httpServer.address().port));
    }
    onConnect(callback) { this.connection_callback = callback; }
    onRequestStatus(callback) { this.status_callback = callback; }
    forEachConnection(callback) { Object.values(this._connections).forEach(callback); }
    getConnection(id) { return this._connections[id]; }
    broadcast(message) { this.forEachConnection(connection => connection.send(message)); }
}
module.exports = { GameServer };
