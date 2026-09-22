
var _ = require('underscore'),
    Types = require("../../shared/js/gametypes");
const movement = require('../../shared/content/movement.json');

(function() {
    FormatChecker = Class.extend({
        init: function() {
            this.formats = [];
            this.formats[Types.Messages.HELLO] = ['s', 'n', 'n', 's'],
            this.formats[Types.Messages.MOVE] = ['n', 'n'],
            this.formats[Types.Messages.LOOTMOVE] = ['n', 'n', 'n'],
            this.formats[Types.Messages.AGGRO] = ['n'],
            this.formats[Types.Messages.ATTACK] = ['n'],
            this.formats[Types.Messages.HIT] = ['n'],
            this.formats[Types.Messages.HURT] = ['n'],
            this.formats[Types.Messages.CHAT] = ['s'],
            this.formats[Types.Messages.LOOT] = ['n'],
            this.formats[Types.Messages.TELEPORT] = ['n', 'n'],
            this.formats[Types.Messages.ZONE] = [],
            this.formats[Types.Messages.OPEN] = ['n'],
            this.formats[Types.Messages.CHECK] = ['n'];
            this.formats[Types.Messages.INVENTORY_EQUIP] = ['s'];
            this.formats[Types.Messages.INVENTORY_DISCARD] = ['s'];
            this.formats[Types.Messages.COMMAND] = ['s', 'o'];
            this.formats[Types.Messages.MOVE_PATH] = ['n', 'p'];
        },
        
        check: function(msg) {
            if (!Array.isArray(msg) || msg.length > 512) return false;
            var message = msg.slice(0),
                type = message[0],
                format = this.formats[type];
            
            message.shift();
            if (type === Types.Messages.MOVE_PATH && message[0] < 1) return false;
            
            if(format) {    
                if(message.length !== format.length) {
                    return false;
                }
                for(var i = 0, n = message.length; i < n; i += 1) {
                    if (format[i] === 'p' && (!Array.isArray(message[i]) || message[i].length < 1 || message[i].length > movement.maxPathLength || !message[i].every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isSafeInteger)))) return false;
                    if (format[i] === 'o' && (!message[i] || typeof message[i] !== 'object' || Array.isArray(message[i]))) return false;
                    if(format[i] === 'n' && !Number.isSafeInteger(message[i])) {
                        return false;
                    }
                    if(format[i] === 's' && (typeof message[i] !== 'string' || message[i].length > 256)) {
                        return false;
                    }
                }
                return true;
            }
            else if(type === Types.Messages.WHO) {
                // WHO messages have a variable amount of params, all of which must be numbers.
                return message.length > 0 && _.all(message, function(param) { return Number.isSafeInteger(param) });
            }
            else {
                log.error("Unknown message type: "+type);
                return false;
            }
        }
    });

    var checker = new FormatChecker;
    
    exports.check = checker.check.bind(checker);
})();
