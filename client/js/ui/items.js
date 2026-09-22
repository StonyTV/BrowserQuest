define(['ui/dom'], function(dom) {
    var names = {
        sword1: 'Épée usée', sword2: 'Épée en acier', axe: 'Hache', morningstar: 'Masse d’armes',
        bluesword: 'Épée magique', redsword: 'Épée ardente', goldensword: 'Épée dorée',
        clotharmor: 'Tunique', leatherarmor: 'Armure de cuir', mailarmor: 'Cotte de mailles',
        platearmor: 'Armure de plaques', redarmor: 'Armure rouge', goldenarmor: 'Armure dorée'
    };
    var rarities = { common: 'Commun', uncommon: 'Inhabituel', rare: 'Rare' };
    function name(item) { return names[Types.getKindAsString(item.kind)] || 'Objet'; }
    function stats(item) {
        var weapon = Types.isWeapon(item.kind);
        var rank = (weapon ? Types.getWeaponRank(item.kind) : Types.getArmorRank(item.kind)) + 1;
        return rarities[item.rarity] + ' · Rang ' + rank + ' · +' + item.bonus + (weapon ? ' dégâts' : ' défense');
    }
    function icon(item) {
        var element = dom.node('span', '', 'inventory-icon');
        element.style.backgroundImage = 'url("img/2/item-' + Types.getKindAsString(item.kind) + '.png")';
        return element;
    }
    function grid(items, capacity, options) {
        var element = dom.node('div', '', 'inventory-grid');
        element.setAttribute('aria-label', options.label || 'Cases du sac');
        for (var index = 0; index < capacity; index++) {
            (function(slot) {
                var item = options.bank ? items[slot] : items.find(function(value) { return value.slot === slot; });
                var cell = dom.button('', function() { options.select(item, slot); }, 'inventory-cell');
                cell.dataset.slot = slot;
                cell.setAttribute('aria-label', 'Case ' + (slot + 1) + (item ? ' · ' + name(item) : ' · Vide'));
                cell.title = item ? name(item) + ' — ' + stats(item) : 'Case vide';
                cell.append(dom.node('span', slot + 1, 'slot-number'));
                if (item) {
                    cell.dataset.itemId = item.id;
                    cell.classList.add(item.rarity);
                    cell.append(icon(item));
                    if (options.equipped && Object.values(options.equipped).includes(item.id)) cell.append(dom.node('span', '◆', 'equipped-mark'));
                    if (options.selected === item.id) cell.classList.add('selected');
                    if (options.move) {
                        cell.draggable = true;
                        cell.ondragstart = function(event) { event.dataTransfer.setData('text/plain', item.id); };
                    }
                }
                if (options.move) {
                    cell.ondragover = function(event) { event.preventDefault(); };
                    cell.ondrop = function(event) { event.preventDefault(); options.move(event.dataTransfer.getData('text/plain'), slot); };
                }
                element.append(cell);
            })(index);
        }
        return element;
    }
    return { name: name, stats: stats, icon: icon, grid: grid };
});
