const config = require('../../../shared/content/movement.json');
const Types = require('../../../shared/js/gametypes');
const Messages = require('../message');

// Clients propose routes. Only this clock changes authoritative player positions.
class Movement {
    constructor(world) { this.world = world; }
    reset(player) { player.movement = { path: [], sequence: 0, nextAt: 0, door: null }; }
    report(player, status) {
        player.send([Types.Messages.POSITION, player.movement.sequence, player.x, player.y, status]);
    }
    reject(player) {
        player.movement.path = [];
        player.movement.door = null;
        this.report(player, 'rejected');
    }
    walkable(x, y) {
        return this.world.isValidPosition(x, y) && !Object.values(this.world.npcs).some(npc => npc.x === x && npc.y === y);
    }
    request(player, sequence, proposed, now = performance.now()) {
        const state = player.movement;
        if (sequence <= state.sequence) return;
        state.sequence = sequence;
        state.door = null;
        let path = proposed;
        const current = path.findIndex(([x,y]) => x === player.x && y === player.y);
        if (current >= 0) path = path.slice(current);
        else {
            // A predicted turn may start a few already-approved steps ahead.
            const ahead = state.path.slice(0, config.maxPredictionSteps).findIndex(([x,y]) => x === path[0][0] && y === path[0][1]);
            if (ahead >= 0) path = [[player.x,player.y], ...state.path.slice(0,ahead), ...path];
        }
        const valid = path.length <= config.maxPathLength && path[0][0] === player.x && path[0][1] === player.y &&
            path.slice(1).every(([x,y], i) => this.walkable(x,y) && Math.abs(x-path[i][0]) + Math.abs(y-path[i][1]) === 1);
        if (!valid) { this.reject(player); return; }
        if (!state.path.length) state.nextAt = now + config.stepMs;
        state.path = path.slice(1);
        player.clearTarget();
        this.report(player, state.path.length ? 'accepted' : 'arrived');
    }
    teleport(player, x, y) {
        const state = player.movement;
        const end = state.path.at(-1) || [player.x, player.y];
        const door = this.world.map.doors.find(door => door.x === end[0] && door.y === end[1] && door.tx === x && door.ty === y);
        if (!door || !this.world.isValidPosition(x,y)) { this.reject(player); return; }
        state.door = door;
        if (!state.path.length) this.enterDoor(player);
    }
    enterDoor(player) {
        const state = player.movement, door = state.door;
        if (!door || player.x !== door.x || player.y !== door.y) return;
        state.door = null;
        player.setPosition(door.tx,door.ty);
        player.clearTarget();
        player.serviceId = null;
        player.broadcast(new Messages.Teleport(player));
        this.world.handlePlayerVanish(player);
        this.world.pushToPreviousGroups(player, new Messages.Destroy(player));
        this.world.pushRelevantEntityListTo(player);
        this.report(player, 'teleport');
    }
    tick(now = performance.now()) {
        for (const player of Object.values(this.world.players)) {
            const state = player.movement;
            if (!state || player.isDead || !state.path.length || now < state.nextAt) continue;
            const [x,y] = state.path.shift();
            if (!this.walkable(x,y)) { this.reject(player); continue; }
            player.orientation = x > player.x ? Types.Orientations.RIGHT : x < player.x ? Types.Orientations.LEFT : y > player.y ? Types.Orientations.DOWN : Types.Orientations.UP;
            player.setPosition(x,y);
            state.nextAt = now + config.stepMs;
            player.zone_callback(); // Visibility follows actual tiles, never a client ZONE claim.
            player.broadcast(new Messages.Move(player));
            player.move_callback?.(x,y);
            this.report(player, state.path.length ? 'moving' : 'arrived');
            if (!state.path.length) this.enterDoor(player);
        }
    }
}
module.exports = Movement;
