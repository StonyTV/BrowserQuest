define(['text!../../shared/content/movement.json'], function(raw) {
    var config = JSON.parse(raw);
    class Movement {
        constructor(game) {
            this.game = game;
            this.stepMs = config.stepMs;
            this.sequence = 0;
            this.door = null;
            this.pendingLoot = null;
            game.client.handlers[Types.Messages.POSITION] = this.receive.bind(this);
        }
        reset() {
            this.sequence = 0;
            this.door = null;
            this.pendingLoot = null;
            this.game.player.moveSpeed = this.stepMs;
        }
        send(path) {
            this.door = null;
            this.pendingLoot = null;
            this.game.client.sendMessage([Types.Messages.MOVE_PATH, ++this.sequence, path]);
        }
        loot(item) {
            const position = this.game.authoritativePosition, player = this.game.player;
            if (!player.isMoving() && (!this.sequence || (position?.sequence === this.sequence && position.x === player.gridX && position.y === player.gridY))) this.game.client.sendLoot(item);
            else this.pendingLoot = item;
        }
        teleport(destination) {
            this.door = destination;
            this.game.client.sendTeleport(destination.x, destination.y);
        }
        receive(data) {
            const game = this.game, player = game.player;
            const [_, sequence, x, y, status] = data;
            game.authoritativePosition = {sequence, x, y, status};
            if (sequence !== this.sequence || player.isDead) return;
            if (status === 'arrived' && this.pendingLoot) {
                game.client.sendLoot(this.pendingLoot);
                this.pendingLoot = null;
            }
            const teleport = status === 'teleport';
            if (status !== 'rejected' && !teleport && !(status === 'arrived' && !player.isMoving() && (player.gridX !== x || player.gridY !== y))) return;
            game.unregisterEntityPosition(player);
            player.movement.stop();
            player.path = null;
            player.newDestination = null;
            player.interrupted = false;
            player.disengage();
            player.setGridPosition(x,y);
            player.nextGridX = x; player.nextGridY = y;
            player.idle(teleport && this.door ? this.door.orientation : player.orientation);
            game.registerEntityPosition(player);
            game.selectedCellVisible = false;
            game.previousClickPosition = {};
            if (teleport) {
                if (Object.keys(player.attackers).length) setTimeout(function() { game.tryUnlockingAchievement('COWARD'); },500);
                player.forEachAttacker(function(attacker) { attacker.disengage(); attacker.idle(); });
                game.camera.focusEntity(player);
                game.resetZone();
                game.assignBubbleTo(player);
                game.updatePlateauMode();
                game.checkUndergroundAchievement();
                game.audioManager.updateMusic();
                if (this.door?.portal) game.audioManager.playSound('teleport');
            }
            this.door = null;
            this.pendingLoot = null;
            if (status === 'rejected') game.showNotification('Déplacement interrompu. Choisissez une nouvelle destination.');
        }
    }
    return Movement;
});
