
var cls = require("./lib/class"),
    _ = require("underscore"),
    Messages = require("./message"),
    Utils = require("./utils"),
    Properties = require("./properties"),
    RPG = require("./profiles"),
    Formulas = require("./formulas"),
    check = require("./format").check,
    Types = require("../../shared/js/gametypes");

module.exports = Player = Character.extend({
    init: function(connection, worldServer) {
        var self = this;
        
        this.server = worldServer;
        this.connection = connection;

        this._super(this.connection.id, "player", Types.Entities.WARRIOR, 0, 0, "");

        this.hasEnteredGame = false;
        this.isDead = false;
        this.haters = {};
        this.lastCheckpoint = null;
        this.formatChecker = new FormatChecker();
        this.disconnectTimeout = null;
        
        this.connection.listen(async function(message) {
            var action = parseInt(message[0]);
            
            log.debug("Received action: "+action);
            if(!check(message)) {
                self.connection.close("Invalid "+Types.getMessageTypeAsString(action)+" message format");
                return;
            }
            
            if(!self.hasEnteredGame && action !== Types.Messages.HELLO) { // HELLO must be the first message
                self.connection.close("Invalid handshake message");
                return;
            }
            if(self.hasEnteredGame && !self.isDead && action === Types.Messages.HELLO) { // HELLO can be sent only once
                self.connection.close("Cannot initiate handshake twice");
                return;
            }
            
            if (self.isDead && action !== Types.Messages.HELLO) return;
            self.resetTimeout();
            
            if(action === Types.Messages.HELLO) {
                var name = Utils.sanitize(message[1]);
                
                // If name was cleared by the sanitizer, give a default name.
                // Always ensure that the name is not longer than a maximum length.
                // (also enforced by the maxlength attribute of the name input element).
                self.name = (name === "") ? "lorem ipsum" : name.substr(0, 15);
                
                self.kind = Types.Entities.WARRIOR;
                if (!self.session) {
                    self.session = await self.server.profiles.open(message[4], self.name);
                    if (!self.session) return self.connection.close("Unknown character; create a new character");
                    if (self.server.profiles.sessions.has(self.session.token)) {
                        return self.connection.close("Character already connected in another window");
                    }
                    self.server.profiles.sessions.set(self.session.token, self);
                }
                self.name = self.session.profile.name;
                self.applyEquipment();
                self.orientation = Utils.randomOrientation();
                self.updateHitPoints();
                self.updatePosition();
                self.server.movement.reset(self);
                
                self.server.addPlayer(self);
                self.server.enter_callback(self);

                self.send([Types.Messages.WELCOME, self.id, self.name, self.x, self.y, self.hitPoints]);
                self.hasEnteredGame = true;
                self.isDead = false;
                self.syncProfile();
                await self.server.gameplay.social.connect(self);
            }
            else if(action === Types.Messages.INVENTORY_EQUIP || action === Types.Messages.INVENTORY_DISCARD) {
                var profile = structuredClone(self.session.profile);
                var changed = action === Types.Messages.INVENTORY_EQUIP
                    ? RPG.equip(profile, message[1]) : RPG.discard(profile, message[1]);
                if (changed) {
                    await self.saveProfile(profile);
                    self.applyEquipment();
                    self.broadcast(self.equip(self.armor));
                    self.broadcast(self.equip(self.weapon));
                    self.syncProfile();
                }
            }
            else if(action === Types.Messages.COMMAND) {
                await self.server.gameplay.handle(self, message[1], message[2]);
            }
            else if(action === Types.Messages.WHO) {
                message.shift();
                self.server.pushSpawnsToPlayer(self, message);
            }
            else if(action === Types.Messages.ZONE) {
                self.zone_callback();
            }
            else if(action === Types.Messages.CHAT) {
                await self.server.gameplay.handle(self, 'chat.send', {channel: 'zone', body: message[1]});
            }
            else if(action === Types.Messages.MOVE_PATH) {
                self.server.movement.request(self, message[1], message[2]);
            }
            else if(action === Types.Messages.MOVE || action === Types.Messages.LOOTMOVE) {
                self.server.movement.reject(self);
            }
            else if(action === Types.Messages.AGGRO) {
                if(self.move_callback) {
                    var enemy = self.server.getEntityById(message[1]);
                    if (enemy && enemy.type === 'mob' && self.near(enemy, 12)) self.server.handleMobHate(enemy.id, self.id, 5);
                }
            }
            else if(action === Types.Messages.ATTACK) {
                var mob = self.server.getEntityById(message[1]);
                
                if(mob && mob.type === 'mob' && self.near(mob, 12)) {
                    self.setTarget(mob);
                    self.server.broadcastAttacker(self);
                }
            }
            else if(action === Types.Messages.HIT) {
                var mob = self.server.getEntityById(message[1]);
                if(mob && mob.type === 'mob' && mob.hitPoints > 0 && self.near(mob, 2) && Date.now() - (self.lastHit || 0) >= 600) {
                    self.lastHit = Date.now();
                    var dmg = Formulas.dmg(self.weaponLevel, mob.armorLevel) + RPG.equipment(self.session.profile, 'weapon').bonus;
                    
                    if(dmg > 0) {
                        mob.receiveDamage(dmg, self.id);
                        self.server.handleMobHate(mob.id, self.id, dmg);
                        await self.server.handleHurtEntity(mob, self, dmg);
                    }
                }
            }
            else if(action === Types.Messages.HURT) {
                // Damage from creatures is scheduled by the server, independently of the client.
            }
            else if(action === Types.Messages.LOOT) {
                var item = self.server.getEntityById(message[1]);
                
                if(item && item.type === 'item' && self.near(item, 2)) {
                    var kind = item.kind;
                    var isEquipment = Types.isArmor(kind) || Types.isWeapon(kind);
                    if (isEquipment && self.session.profile.items.length >= RPG.CAPACITY) {
                        self.send([Types.Messages.LOOT_RESULT, item.id, false, "Sac plein : libérez une place."]);
                        return;
                    }
                    
                    if(Types.isItem(kind)) {
                        if (isEquipment) {
                            var profile = structuredClone(self.session.profile);
                            profile.items.push(RPG.createItem(kind));
                            await self.saveProfile(profile);
                            self.syncProfile();
                        }
                        self.send([Types.Messages.LOOT_RESULT, item.id, true, isEquipment ? "Objet ajouté au sac. Appuyez sur I pour vous équiper." : "Objet ramassé."]);
                        self.broadcast(item.despawn());
                        self.server.removeEntity(item);
                        
                        if(kind === Types.Entities.FIREPOTION) {
                            self.updateHitPoints();
                            self.broadcast(self.equip(Types.Entities.FIREFOX));
                            clearTimeout(self.firepotionTimeout);
                            self.firepotionTimeout = setTimeout(function() {
                                self.broadcast(self.equip(self.armor)); // return to normal after 15 sec
                                self.firepotionTimeout = null;
                            }, 15000);
                            self.send(new Messages.HitPoints(self.maxHitPoints).serialize());
                        } else if(Types.isHealingItem(kind)) {
                            var amount;
                            
                            switch(kind) {
                                case Types.Entities.FLASK: 
                                    amount = 40;
                                    break;
                                case Types.Entities.BURGER: 
                                    amount = 100;
                                    break;
                            }
                            
                            if(!self.hasFullHealth()) {
                                self.regenHealthBy(amount);
                                self.server.pushToPlayer(self, self.health());
                                self.server.sendEntityInfo(self);
                            }
                        }
                    }
                }
            }
            else if(action === Types.Messages.TELEPORT) {
                self.server.movement.teleport(self, message[1], message[2]);
            }
            else if(action === Types.Messages.OPEN) {
                var chest = self.server.getEntityById(message[1]);
                if(chest && chest instanceof Chest && self.near(chest, 2)) {
                    self.server.handleOpenedChest(chest, self);
                }
            }
            else if(action === Types.Messages.CHECK) {
                var checkpoint = self.server.map.getCheckpoint(message[1]);
                if(checkpoint && self.x >= checkpoint.x - 1 && self.x <= checkpoint.x + checkpoint.width &&
                    self.y >= checkpoint.y - 1 && self.y <= checkpoint.y + checkpoint.height) {
                    self.lastCheckpoint = checkpoint;
                }
            }
            else {
                if(self.message_callback) {
                    self.message_callback(message);
                }
            }
        });
        
        this.connection.onClose(function() {
            if(self.firepotionTimeout) {
                clearTimeout(self.firepotionTimeout);
            }
            clearTimeout(self.disconnectTimeout);
            if (self.session && self.server.profiles.sessions.get(self.session.token) === self) {
                self.server.profiles.sessions.delete(self.session.token);
            }
            if(self.exit_callback) {
                self.exit_callback();
            }
        });
        
        this.connection.sendUTF8("go"); // Notify client that the HELLO/WELCOME handshake can start
    },
    
    near: function(entity, distance) {
        return Utils.distanceTo(this.x, this.y, entity.x, entity.y) <= distance;
    },

    applyEquipment: function() {
        this.equipArmor(RPG.equipment(this.session.profile, 'armor').kind);
        this.equipWeapon(RPG.equipment(this.session.profile, 'weapon').kind);
        this.maxHitPoints = Formulas.hp(this.armorLevel);
        this.hitPoints = Math.min(this.hitPoints || this.maxHitPoints, this.maxHitPoints);
    },

    saveProfile: async function(profile) {
        var draft = { ...this.session, profile };
        await this.server.profiles.save(draft);
        this.session = draft;
    },

    syncProfile: function() {
        this.send([Types.Messages.PROFILE, { token: this.session.token, capacity: RPG.CAPACITY, maxHitPoints: this.maxHitPoints, hitPoints: this.hitPoints, ...this.session.profile }]);
        this.server.sendEntityInfo(this);
    },

    destroy: function() {
        var self = this;
        
        this.forEachAttacker(function(mob) {
            mob.clearTarget();
        });
        this.attackers = {};
        
        this.forEachHater(function(mob) {
            mob.forgetPlayer(self.id);
        });
        this.haters = {};
    },
    
    getState: function() {
        var basestate = this._getBaseState(),
            state = [this.name, this.orientation, this.armor, this.weapon];

        if(this.target) {
            state.push(this.target);
        }
        
        return basestate.concat(state);
    },
    
    send: function(message) {
        this.connection.send(message);
    },
    
    broadcast: function(message, ignoreSelf) {
        if(this.broadcast_callback) {
            this.broadcast_callback(message, ignoreSelf === undefined ? true : ignoreSelf);
        }
    },
    
    broadcastToZone: function(message, ignoreSelf) {
        if(this.broadcastzone_callback) {
            this.broadcastzone_callback(message, ignoreSelf === undefined ? true : ignoreSelf);
        }
    },
    
    onExit: function(callback) {
        this.exit_callback = callback;
    },
    
    onMove: function(callback) {
        this.move_callback = callback;
    },
    
    onZone: function(callback) {
        this.zone_callback = callback;
    },
    
    onOrient: function(callback) {
        this.orient_callback = callback;
    },
    
    onMessage: function(callback) {
        this.message_callback = callback;
    },
    
    onBroadcast: function(callback) {
        this.broadcast_callback = callback;
    },
    
    onBroadcastToZone: function(callback) {
        this.broadcastzone_callback = callback;
    },
    
    equip: function(item) {
        return new Messages.EquipItem(this, item);
    },
    
    addHater: function(mob) {
        if(mob) {
            if(!(mob.id in this.haters)) {
                this.haters[mob.id] = mob;
            }
        }
    },
    
    removeHater: function(mob) {
        if(mob && mob.id in this.haters) {
            delete this.haters[mob.id];
        }
    },
    
    forEachHater: function(callback) {
        _.each(this.haters, function(mob) {
            callback(mob);
        });
    },
    
    equipArmor: function(kind) {
        this.armor = kind;
        this.armorLevel = Properties.getArmorLevel(kind);
    },
    
    equipWeapon: function(kind) {
        this.weapon = kind;
        this.weaponLevel = Properties.getWeaponLevel(kind);
    },
    
    equipItem: function(item) {
        if(item) {
            log.debug(this.name + " equips " + Types.getKindAsString(item.kind));
            
            if(Types.isArmor(item.kind)) {
                this.equipArmor(item.kind);
                this.updateHitPoints();
                this.send(new Messages.HitPoints(this.maxHitPoints).serialize());
            } else if(Types.isWeapon(item.kind)) {
                this.equipWeapon(item.kind);
            }
        }
    },
    
    updateHitPoints: function() {
        this.resetHitPoints(Formulas.hp(this.armorLevel));
    },
    
    updatePosition: function() {
        if(this.requestpos_callback) {
            var pos = this.requestpos_callback();
            this.setPosition(pos.x, pos.y);
        }
    },
    
    onRequestPosition: function(callback) {
        this.requestpos_callback = callback;
    },
    
    resetTimeout: function() {
        clearTimeout(this.disconnectTimeout);
        this.disconnectTimeout = setTimeout(this.timeout.bind(this), 1000 * 60 * 15); // 15 min.
    },
    
    timeout: function() {
        this.connection.sendUTF8("timeout");
        this.connection.close("Player was idle for too long");
    }
});
