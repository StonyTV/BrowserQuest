const content = require('../../../shared/content/mobs.json');
const Types = require('../../../shared/js/gametypes');
const Messages = require('../message');

const distance = (a, b) => Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y));
const contact = (a, b) => Math.abs(a.x-b.x) + Math.abs(a.y-b.y) <= 1;

class MobAI {
    constructor(world) { this.world = world; this.npcTiles = null; }
    reset(mob) {
        mob.ai = {mode:'idle', nextAt:0, scanAt:0, attackAt:0, path:[], goal:null, blockedSince:null};
    }
    spec(mob) { return content.monsters[Types.getKindAsString(mob.kind)]; }
    walkable(x,y) {
        if (!this.npcTiles) this.npcTiles = new Set(Object.values(this.world.npcs).map(npc => `${npc.x},${npc.y}`));
        return this.world.isValidPosition(x,y) && !this.npcTiles.has(`${x},${y}`);
    }
    inTerritory(mob, point) { return distance({x:mob.spawningX,y:mob.spawningY},point) <= content.leash; }
    validTarget(mob, player) {
        return player && !player.isDead && !player.firepotionTimeout && this.world.entities[player.id] === player && this.inTerritory(mob,player);
    }
    canHit(attacker, target) { return contact(attacker,target) && this.walkable(target.x,target.y); }
    attackTile(mob, point, target) {
        return Math.abs(point.x-target.x)+Math.abs(point.y-target.y)===1 &&
            !Object.values(this.world.mobs).some(other=>other!==mob && !other.isDead && other.x===point.x && other.y===point.y);
    }
    snapshot(mob, strike = false) {
        return new Messages.MobState(mob, mob.ai.mode, this.spec(mob).stepMs, strike);
    }
    publish(mob, strike = false) {
        this.world.pushToAdjacentGroups(mob.group, this.snapshot(mob,strike));
    }
    target(mob, player, now) {
        if (mob.target === player?.id) return;
        this.world.clearMobAggroLink(mob);
        mob.clearTarget();
        if (player) {
            mob.setTarget(player);
            player.addAttacker(mob);
            mob.ai.mode = 'chasing';
            mob.ai.nextAt = Math.max(mob.ai.nextAt,now+this.spec(mob).stepMs);
            mob.ai.attackAt = Math.max(mob.ai.attackAt,now+this.spec(mob).attackMs);
        }
        mob.ai.path = [];
        mob.ai.goal = null;
        mob.ai.blockedSince = null;
        this.publish(mob);
    }
    chooseTarget(mob, now = performance.now()) {
        let best;
        for (const hate of mob.hatelist) {
            const player = this.world.players[hate.id];
            if (this.validTarget(mob,player) && (!best || hate.hate > best.hate)) best = hate;
        }
        if (best) this.target(mob,this.world.players[best.id],now);
        else this.returnHome(mob,now);
    }
    forgetPlayer(player, now = performance.now()) {
        for (const mob of Object.values(player.haters)) {
            mob.hatelist = mob.hatelist.filter(hate => hate.id !== player.id);
            player.removeHater(mob);
            if (mob.target === player.id) this.chooseTarget(mob,now);
        }
    }
    returnHome(mob, now) {
        this.world.clearMobHateLinks(mob);
        mob.hatelist = [];
        this.target(mob,null,now);
        mob.ai.mode = 'returning';
        mob.ai.path = [];
        mob.ai.goal = null;
        mob.ai.nextAt = Math.max(mob.ai.nextAt,now+this.spec(mob).stepMs);
        this.publish(mob);
    }
    // Bounded BFS; routes stay in the spawn territory and never cross walls/NPCs.
    route(mob, goal, adjacent) {
        const queue = [[mob.x,mob.y]], previous = new Map([[queue[0].join(','),null]]);
        for (let i=0;i<queue.length && i<content.maxSearchNodes;i++) {
            const [x,y] = queue[i], point = {x,y};
            if (adjacent ? this.attackTile(mob,point,goal) : x===goal.x && y===goal.y) {
                const path = []; let cursor = queue[i];
                while (previous.get(cursor.join(','))) { path.unshift(cursor); cursor = previous.get(cursor.join(',')); }
                return path;
            }
            for (const next of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
                const key = next.join(',');
                if (previous.has(key) || !this.inTerritory(mob,{x:next[0],y:next[1]}) || !this.walkable(...next)) continue;
                previous.set(key,[x,y]); queue.push(next);
            }
        }
        return null;
    }
    detect(mob, now) {
        const spec = this.spec(mob);
        if (!spec.aggroRange || now < mob.ai.scanAt) return;
        mob.ai.scanAt = now + content.scanMs;
        const candidates = Object.values(this.world.players).filter(player => this.validTarget(mob,player) && distance(mob,player)<=spec.aggroRange)
            .sort((a,b)=>distance(mob,a)-distance(mob,b) || a.id-b.id);
        for (const player of candidates) {
            const path = this.route(mob,player,true);
            // A wall separating two nearby rooms must not trigger aggro around the building.
            if (path && path.length <= spec.aggroRange) {
                mob.increaseHateFor(player.id,1); player.addHater(mob);
                this.target(mob,player,now); return;
            }
        }
    }
    tick(now = performance.now()) {
        for (const mob of Object.values(this.world.mobs)) {
            if (mob.isDead || mob.hitPoints<=0) continue;
            const state=mob.ai, spec=this.spec(mob);
            if (state.mode==='idle') this.detect(mob,now);
            if (mob.target && !this.validTarget(mob,this.world.players[mob.target])) this.chooseTarget(mob,now);
            const target=this.world.players[mob.target];
            if (target && this.canHit(mob,target) && this.attackTile(mob,mob,target)) {
                state.path=[]; state.goal=null; state.blockedSince=null;
                if (state.mode!=='attacking') { state.mode='attacking'; this.publish(mob); }
                if (now>=state.attackAt && now>=state.nextAt) {
                    state.attackAt=now+spec.attackMs;
                    mob.orientation = target.x>mob.x ? Types.Orientations.RIGHT : target.x<mob.x ? Types.Orientations.LEFT : target.y>mob.y ? Types.Orientations.DOWN : Types.Orientations.UP;
                    this.publish(mob,true);
                    this.world.damagePlayer(mob,target);
                }
                continue;
            }
            if (!target && state.mode!=='returning') continue;
            const goal=target || {x:mob.spawningX,y:mob.spawningY};
            if (!target && mob.x===goal.x && mob.y===goal.y) {
                state.mode='idle'; state.scanAt=now+content.scanMs;
                mob.updateHitPoints(); this.world.sendEntityInfo(mob); this.publish(mob); continue;
            }
            if (now<state.nextAt) continue;
            const key=`${goal.x},${goal.y}`;
            const end=state.path.at(-1);
            if (state.goal!==key || !end || (target && !this.attackTile(mob,{x:end[0],y:end[1]},target))) {
                state.path=this.route(mob,goal,!!target) || []; state.goal=key;
            }
            state.nextAt=now+spec.stepMs; // Never catch up by taking multiple steps in one tick.
            if (!state.path.length) {
                state.blockedSince ??= now;
                if (target && now-state.blockedSince>=content.unreachableMs) this.returnHome(mob,now);
                continue;
            }
            state.blockedSince=null;
            const [x,y]=state.path.shift();
            state.mode=target ? 'chasing' : 'returning';
            mob.orientation=x>mob.x ? Types.Orientations.RIGHT : x<mob.x ? Types.Orientations.LEFT : y>mob.y ? Types.Orientations.DOWN : Types.Orientations.UP;
            mob.setPosition(x,y);
            if (this.world.handleEntityGroupMembership(mob)) this.world.pushToPreviousGroups(mob,new Messages.Destroy(mob.id));
            this.publish(mob);
        }
    }
}
module.exports = MobAI;
