
define(['character'], function(Character) {
    
    var Mob = Character.extend({
        init: function(id, kind) {
            this._super(id, kind);
        },
        // Legacy character callbacks may request following; only MOB_STATE moves a mob.
        follow: function() {}
    });
    return Mob;
});
