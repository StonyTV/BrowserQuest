
var Area = require('./area'),
    Types = require("../../shared/js/gametypes");

module.exports = MobArea = Area.extend({
    init: function(id, nb, kind, x, y, width, height, world) {
        this._super(id, x, y, width, height, world);
        this.nb = nb;
        this.kind = kind;
        this.respawns = [];
        this.setNumberOfEntities(this.nb);
        
    },
    
    spawnMobs: function() {
        for(var i = 0; i < this.nb; i += 1) {
            this.addToArea(this._createMobInsideArea());
        }
    },
    
    _createMobInsideArea: function() {
        var k = Types.getKindFromString(this.kind),
            pos = this._getRandomPositionInsideArea(),
            mob = new Mob('1' + this.id + ''+ k + ''+ this.entities.length, k, pos.x, pos.y);
        

        return mob;
    },
    
    respawnMob: function(mob, delay) {
        var self = this;
        
        this.removeFromArea(mob);
        
        setTimeout(function() {
            var pos = self._getRandomPositionInsideArea();
            
            mob.x = mob.spawningX = pos.x;
            mob.y = mob.spawningY = pos.y;
            mob.isDead = false;
            self.addToArea(mob);
        }, delay);
    },

    createReward: function() {
        var pos = this._getRandomPositionInsideArea();
        
        return { x: pos.x, y: pos.y, kind: Types.Entities.CHEST };
    }
});
