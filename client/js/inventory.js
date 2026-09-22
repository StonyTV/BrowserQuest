define(function() {
    var names = {
        sword1: 'Épée usée', sword2: 'Épée en acier', axe: 'Hache', morningstar: 'Masse d’armes',
        bluesword: 'Épée magique', redsword: 'Épée ardente', goldensword: 'Épée dorée',
        clotharmor: 'Tunique', leatherarmor: 'Armure de cuir', mailarmor: 'Cotte de mailles',
        platearmor: 'Armure de plaques', redarmor: 'Armure rouge', goldenarmor: 'Armure dorée'
    };
    var rarities = { common: 'Commun', uncommon: 'Inhabituel', rare: 'Rare' };
    function text(tag, value, className) {
        var node = document.createElement(tag);
        node.textContent = value;
        if (className) node.className = className;
        return node;
    }
    return function(game) {
        var panel = document.getElementById('inventory-panel');
        var toggle = document.getElementById('inventory-toggle');
        var list = document.getElementById('inventory-items');
        var profile;
        function setOpen(open) {
            panel.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            if (open) document.getElementById('inventory-close').focus();
            else toggle.focus();
        }
        toggle.onclick = function() { setOpen(panel.hidden); };
        document.getElementById('inventory-close').onclick = function() { setOpen(false); };
        document.addEventListener('keydown', function(event) {
            if (/INPUT|TEXTAREA/.test(event.target.tagName) || !game.started) return;
            if (event.key.toLowerCase() === 'i') { setOpen(panel.hidden); event.preventDefault(); }
            if (event.key === 'Escape') { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
        });
        function command(type, id) {
            game.client.sendMessage([type, id]);
        }
        game.onProfile = function(next) {
            profile = next;
            localStorage.setItem('bq-token', profile.token);
            document.getElementById('rpg-hud').hidden = false;
            document.getElementById('gold-count').textContent = profile.gold + ' or';
            document.getElementById('inventory-summary').textContent = profile.items.length + ' / ' + profile.capacity + ' objets · ' + profile.kills + ' victoires';
            list.replaceChildren();
            profile.items.forEach(function(item) {
                var kind = Types.getKindAsString(item.kind);
                var slot = Types.isWeapon(item.kind) ? 'weapon' : 'armor';
                var equipped = profile.equipped[slot] === item.id;
                var row = text('li', '', 'inventory-item ' + item.rarity);
                var icon = text('span', '', 'inventory-icon');
                icon.style.backgroundImage = 'url("img/2/item-' + kind + '.png")';
                var details = text('div', '', 'inventory-details');
                details.appendChild(text('strong', names[kind] || kind));
                var rank = (slot === 'weapon' ? Types.getWeaponRank(item.kind) : Types.getArmorRank(item.kind)) + 1;
                details.appendChild(text('small', rarities[item.rarity] + ' · Rang ' + rank + ' · +' + item.bonus + (slot === 'weapon' ? ' dégâts' : ' défense')));
                row.appendChild(icon);
                row.appendChild(details);
                var button = text('button', equipped ? 'Équipé' : 'Équiper');
                button.disabled = equipped;
                button.onclick = function() { command(Types.Messages.INVENTORY_EQUIP, item.id); };
                row.appendChild(button);
                if (!equipped) {
                    var discard = text('button', 'Jeter', 'inventory-discard');
                    discard.setAttribute('aria-label', 'Jeter ' + (names[kind] || kind));
                    discard.onclick = function() {
                        if (window.confirm('Jeter définitivement cet objet ?')) command(Types.Messages.INVENTORY_DISCARD, item.id);
                    };
                    row.appendChild(discard);
                }
                list.appendChild(row);
            });
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
    };
});
