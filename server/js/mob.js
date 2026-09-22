
var cls = require("./lib/class"),
    _ = require("underscore"),
    Messages = require("./message"),
    Properties = require("./properties"),
    Types = require("../../shared/js/gametypes");

module.exports = Mob = Character.extend({
    init: function(id, kind, x, y) {
        this._super(id, "mob", kind, x, y);
        
        this.updateHitPoints();
        this.spawningX = x;
        this.spawningY = y;
        this.armorLevel = Properties.getArmorLevel(this.kind);
        this.weaponLevel = Properties.getWeaponLevel(this.kind);
        this.hatelist = [];
        this.respawnTimeout = null;
        this.isDead = false;
    },
    
    destroy: function() {
        this.isDead = true;
        this.hatelist = [];
        this.clearTarget();
        this.updateHitPoints();
        this.resetPosition();
        
        this.handleRespawn();
    },
    
    receiveDamage: function(points, playerId) {
        this.hitPoints -= points;
    },
    
    hates: function(playerId) {
        return _.any(this.hatelist, function(obj) { 
            return obj.id === playerId; 
        });
    },
    
    increaseHateFor: function(playerId, points) {
        if(this.hates(playerId)) {
            _.detect(this.hatelist, function(obj) {
                return obj.id === playerId;
            }).hate += points;
        }
        else {
            this.hatelist.push({ id: playerId, hate: points });
        }

    },

    drop: function(item) {
        if(item) {
            return new Messages.Drop(this, item);
        }
    },
    
    handleRespawn: function() {
        var delay = 30000,
            self = this;
        
        if(this.area && this.area instanceof MobArea) {
            // Respawn inside the area if part of a MobArea
            this.area.respawnMob(this, delay);
        }
        else {
            if(this.area && this.area instanceof ChestArea) {
                this.area.removeFromArea(this);
            }
            
            setTimeout(function() {
                if(self.respawn_callback) {
                    self.respawn_callback();
                }
            }, delay);
        }
    },
    
    onRespawn: function(callback) {
        this.respawn_callback = callback;
    },
    
    resetPosition: function() {
        this.setPosition(this.spawningX, this.spawningY);
    },
    
    updateHitPoints: function() {
        this.resetHitPoints(Properties.getHitPoints(this.kind));
    }
});
