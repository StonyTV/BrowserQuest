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
const { ProfileStore } = require('./profiles');
const profiles = new ProfileStore(process.env.BQ_DATABASE || path.join(__dirname, '../../data/characters.sqlite'));
const server = new GameServer(config.port, config.host);
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
    ready: worlds.every(world => world.zoneGroupsReady),
    worlds: worlds.map(world => ({ id: world.id, players: world.playerCount, capacity: world.maxPlayers }))
}));
function shutdown() {
    server.forEachConnection(connection => connection.close('Server stopping'));
    server._httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
