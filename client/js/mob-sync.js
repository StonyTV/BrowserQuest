define(['mob'], function(Mob) {
    class MobSync {
        constructor(game) {
            this.game = game;
            game.client.handlers[Types.Messages.MOB_STATE] = this.receive.bind(this);
        }
        receive(data) {
            const [_,id,x,y,targetId,mode,stepMs,orientation,strike] = data;
            const game = this.game, mob = game.entities[id];
            if (!(mob instanceof Mob) || mob.isDying) return;
            const target = game.entities[targetId];
            if (mob.target !== target) {
                mob.disengage();
                if (target) { mob.setTarget(target); target.addAttacker(mob); }
            }
            mob.attackingMode = !!target;
            mob.serverMode = mode;
            mob.moveSpeed = stepMs;
            const moved = mob.gridX!==x || mob.gridY!==y;
            if (moved) {
                const fromX=mob.x, fromY=mob.y;
                const nearby = Math.abs(mob.gridX-x)+Math.abs(mob.gridY-y)<=2;
                game.unregisterEntityPosition(mob);
                mob.setGridPosition(x,y);
                game.registerEntityPosition(mob);
                // Only interpolate server positions. Never compute a monster route in the browser.
                mob.serverMotion = nearby ? {fromX,fromY,x:x*16,y:y*16,start:game.currentTime,duration:stepMs} : null;
                if (nearby) { mob.x=fromX; mob.y=fromY; }
                mob.walk(orientation);
                mob.forEachAttacker(function(attacker) {
                    if (!(attacker instanceof Mob) && attacker.target===mob && !attacker.isAdjacentNonDiagonal(mob)) attacker.follow(mob);
                });
            }
            if (strike) {
                mob.serverMotion=null;
                mob.setGridPosition(x,y);
                mob.hit(orientation);
            } else if (!mob.serverMotion) mob.idle(orientation);
            mob.hasMoved();
        }
        update(mob) {
            const motion=mob.serverMotion;
            if (!motion || mob.isDying) return;
            const progress=Math.min(1,Math.max(0,(this.game.currentTime-motion.start)/motion.duration));
            mob.x=Math.round(motion.fromX+(motion.x-motion.fromX)*progress);
            mob.y=Math.round(motion.fromY+(motion.y-motion.fromY)*progress);
            mob.hasMoved();
            if (progress===1) { mob.serverMotion=null; mob.idle(); }
        }
    }
    return MobSync;
});
