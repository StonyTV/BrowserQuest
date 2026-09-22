
define(function() {

    var Camera = Class.extend({
        init: function(renderer) {
            this.renderer = renderer;
            this.x = 0;
            this.y = 0;
            this.gridX = 0;
            this.gridY = 0;
            this.offset = 0.5;
            this.rescale();
        },
    
        rescale: function() {
            this.gridW = Math.ceil(window.innerWidth / (16 * this.renderer.scale));
            this.gridH = Math.ceil(window.innerHeight / (16 * this.renderer.scale));
        },

        setPosition: function(x, y) {
            this.x = x;
            this.y = y;
    
            this.gridX = Math.floor( x / 16 );
            this.gridY = Math.floor( y / 16 );
        },

        setGridPosition: function(x, y) {
            this.gridX = x;
            this.gridY = y;
        
            this.x = this.gridX * 16;
            this.y = this.gridY * 16;
        },

        lookAt: function(entity) {
            var map = this.renderer.game.map;
            var x = Math.round(entity.x + 8 - window.innerWidth / (2 * this.renderer.scale));
            var y = Math.round(entity.y + 8 - window.innerHeight / (2 * this.renderer.scale));
            if (map) {
                x = Math.max(0, Math.min(x, Math.max(0, map.width * 16 - window.innerWidth / this.renderer.scale)));
                y = Math.max(0, Math.min(y, Math.max(0, map.height * 16 - window.innerHeight / this.renderer.scale)));
            }
            this.setPosition(x, y);
        },

        forEachVisiblePosition: function(callback, extra) {
            var extra = extra || 0;
            for(var y=this.gridY-extra, maxY=this.gridY+this.gridH+(extra*2); y < maxY; y += 1) {
                for(var x=this.gridX-extra, maxX=this.gridX+this.gridW+(extra*2); x < maxX; x += 1) {
                    callback(x, y);
                }
            }
        },
        
        isVisible: function(entity) {
            return this.isVisiblePosition(entity.gridX, entity.gridY);
        },
        
        isVisiblePosition: function(x, y) {
            if(y >= this.gridY && y < this.gridY + this.gridH
            && x >= this.gridX && x < this.gridX + this.gridW) {
                return true;
            } else {
                return false;
            }
        },
    
        focusEntity: function(entity) { this.lookAt(entity); }

    });

    return Camera;
});
