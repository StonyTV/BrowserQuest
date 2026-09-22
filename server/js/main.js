const path = require('node:path');
const fs = require('node:fs');
const config = require('../config.json');
const localPath = path.join(__dirname, '../config_local.json');
if (fs.existsSync(localPath)) Object.assign(config, JSON.parse(fs.readFileSync(localPath, 'utf8')));
config.port = Number(process.env.PORT || config.port);
config.host = process.env.HOST || '127.0.0.1';

global.log = {
    info: console.log,
    error: console.error,
    debug: config.debug_level === 'debug' ? console.debug : function() {}
};
const { GameServer } = require('./ws');
const WorldServer = require('./worldserver');
const Player = require('./player');
const { MongoProfileStore } = require('./storage/mongo');
let profiles, server, stopping = false;
async function start() {
    // SQLite is an explicit legacy/test mode. Never fall back silently when Mongo fails.
    if (process.env.BQ_DATABASE) {
        const { ProfileStore } = require('./storage/sqlite');
        profiles = new ProfileStore(process.env.BQ_DATABASE);
    } else {
        profiles = new MongoProfileStore(process.env.MONGODB_URI, process.env.MONGODB_DATABASE);
        await profiles.connect();
    }
    server = new GameServer(config.port, config.host, error => {
        console.error('Command failed; stopping to protect saved state:', error.message);
        void shutdown(1);
    });
    const worlds = Array.from({ length: config.nb_worlds }, (_, i) => {
        const world = new WorldServer('world' + (i + 1), config.nb_players_per_world, server);
        world.profiles = profiles;
        world.run(path.resolve(__dirname, '../..', config.map_filepath));
        return world;
    });
    server.onConnect(connection => {
        const world = worlds.find(world => world.zoneGroupsReady && world.playerCount < world.maxPlayers);
        if (!world) return connection.close('World unavailable');
        world.connect_callback(new Player(connection, world));
    });
    server.onRequestStatus(() => JSON.stringify({
        version: require('../../package.json').version,
        protocol: 3,
        storage: process.env.BQ_DATABASE ? 'sqlite' : 'mongodb',
        ready: !stopping && !server.commands.error && worlds.every(world => world.zoneGroupsReady),
        worlds: worlds.map(world => ({ id: world.id, players: world.playerCount, capacity: world.maxPlayers }))
    }));
}
async function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 12000);
    deadline.unref();
    if (server) {
        server.stopping = true;
        server.forEachConnection(connection => connection.close('Server stopping'));
        const force = setTimeout(() => server.forEachConnection(connection => connection.socket.terminate()), 1000);
        await Promise.all([
            new Promise(resolve => server._httpServer.close(resolve)),
            new Promise(resolve => server.wss.close(resolve))
        ]);
        clearTimeout(force);
        await server.commands.drain();
        if (server.commands.error) code = 1;
    }
    try { await profiles?.close(); }
    catch (error) { console.error('Storage close failed:', error.message); code = 1; }
    process.exit(code);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
start().catch(error => { console.error('Startup failed:', error.message); void shutdown(1); });
