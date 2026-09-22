define(['ui/dom', 'ui/items', 'ui/social', 'ui/chat'], function(dom, items, SocialUI, ChatUI) {
    return function(game) {
        var panel = document.getElementById('inventory-panel');
        var toggle = document.getElementById('inventory-toggle');
        var list = document.getElementById('inventory-items');
        var details = document.getElementById('inventory-details');
        var profile, selected, moving = false;
        function command(action, payload) { game.client.sendMessage([Types.Messages.COMMAND, action, payload || {}]); }
        var social = SocialUI(game, command);
        var chat = ChatUI(game, command);
        document.getElementById('sound-toggle').onclick = function() {
            game.audioManager.toggle();
            this.textContent = game.audioManager.enabled ? 'Son' : 'Muet';
            this.setAttribute('aria-pressed', String(!game.audioManager.enabled));
            this.setAttribute('aria-label', game.audioManager.enabled ? 'Couper les effets sonores' : 'Activer les effets sonores');
        };
        function open(name) {
            ['inventory', 'social'].forEach(function(id) {
                document.getElementById(id + '-panel').hidden = id !== name;
                document.getElementById(id + '-toggle').setAttribute('aria-expanded', String(id === name));
            });
        }
        toggle.onclick = function() { open(panel.hidden ? 'inventory' : null); };
        document.getElementById('inventory-close').onclick = function() { open(null); toggle.focus(); };
        document.getElementById('social-toggle').onclick = function() { open(document.getElementById('social-panel').hidden ? 'social' : null); };
        document.getElementById('social-close').onclick = function() { open(null); };
        document.addEventListener('keydown', function(event) {
            if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || !game.started) return;
            if (event.key.toLowerCase() === 'i') { toggle.click(); event.preventDefault(); }
            if (event.key.toLowerCase() === 'g') { document.getElementById('social-toggle').click(); event.preventDefault(); }
            if (event.key === 'Escape') open(null);
        });
        function move(id, slot) { moving = false; command('inventory.move', { id: id, slot: slot }); }
        function render() {
            document.getElementById('gold-count').textContent = profile.gold + ' or';
            document.getElementById('inventory-summary').textContent = profile.items.length + ' / ' + profile.capacity + ' cases · ' + profile.kills + ' victoires';
            list.replaceChildren(items.grid(profile.items, profile.capacity, {
                selected: selected, equipped: profile.equipped, move: move,
                select: function(item, slot) {
                    if (moving && selected) { move(selected, slot); return; }
                    selected = item && item.id; render();
                }
            }));
            details.replaceChildren();
            var item = profile.items.find(function(value) { return value.id === selected; });
            if (item) {
                var equipped = Object.values(profile.equipped).includes(item.id);
                details.className = 'item-details ' + item.rarity;
                details.append(items.icon(item), dom.node('h3', items.name(item)), dom.node('p', items.stats(item)));
                var equip = dom.button(equipped ? 'Équipé' : 'Équiper', function() { game.client.sendMessage([Types.Messages.INVENTORY_EQUIP, item.id]); }, 'primary');
                equip.disabled = equipped;
                details.append(equip, dom.button(moving ? 'Annuler' : 'Déplacer', function() { moving = !moving; render(); }));
                if (!equipped) details.append(dom.button('Jeter', function() {
                    if (window.confirm('Jeter définitivement ' + items.name(item) + ' ?')) game.client.sendMessage([Types.Messages.INVENTORY_DISCARD, item.id]);
                }, 'danger'));
                details.append(dom.node('p', moving ? 'Choisissez une case de destination.' : 'Glissez cet objet vers une autre case.', 'muted'));
            } else {
                details.className = 'item-details empty-details';
                details.append(dom.node('h3', 'Le butin vous attend'), dom.node('p', 'Touchez un objet pour voir ses caractéristiques et l’équiper.'));
            }
            var gear = document.getElementById('equipped-items');
            gear.replaceChildren();
            ['weapon', 'armor'].forEach(function(slot) {
                var item = profile.items.find(function(value) { return value.id === profile.equipped[slot]; });
                if (!item) return;
                var button = dom.button('', function() { selected = item.id; render(); }, 'equipment-slot ' + item.rarity);
                button.append(items.icon(item), dom.node('span', (slot === 'weapon' ? 'Arme' : 'Armure') + '\n' + items.name(item)));
                gear.append(button);
            });
            social.profile(profile);
        }
        game.onProfile = function(next) {
            profile = next;
            game.profile = next;
            localStorage.setItem('bq-token', profile.token);
            document.getElementById('rpg-hud').hidden = false;
            document.getElementById('rpg-chat').hidden = false;
            document.body.classList.add('rpg-playing');
            render();
            var weapon = profile.items.find(function(item) { return item.id === profile.equipped.weapon; });
            var armor = profile.items.find(function(item) { return item.id === profile.equipped.armor; });
            game.player.setWeaponName(Types.getKindAsString(weapon.kind));
            game.player.setSpriteName(Types.getKindAsString(armor.kind));
            if (!game.player.invincible) game.player.setSprite(game.sprites[game.player.getSpriteName()]);
            game.player.maxHitPoints = profile.maxHitPoints;
            game.player.hitPoints = profile.hitPoints;
            game.updateBars();
            if (game.equipment_callback) game.equipment_callback();
        };
        game.onEvent = function(type, data) {
            if (type === 'chat') chat.message(data);
            else if (type === 'notice') chat.notice(data.message);
            else if (type === 'social') { social.state(data); chat.social(data); }
            else if (type === 'service') { social.service(data); open('social'); }
        };
    };
});
