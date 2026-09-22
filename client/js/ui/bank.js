define(['ui/dom', 'ui/items', 'text!../../../shared/content/social.json'], function(dom, items, raw) {
    var config = JSON.parse(raw).bank;
    return function(command) {
        var content = document.getElementById('bank-content'), profile;
        var summary = dom.node('p', '', 'bank-summary');
        var form = dom.node('form', '', 'bank-gold');
        var amount = dom.input('amount', 'number', 1);
        amount.min = 1; amount.max = Number.MAX_SAFE_INTEGER; amount.required = true;
        function gold(deposit) { if (form.reportValidity()) command('bank.gold', {amount:Number(amount.value),deposit:deposit}); }
        form.append(dom.field('Pièces', amount), dom.button('Déposer', function() { gold(true); }), dom.button('Retirer', function() { gold(false); }));
        form.onsubmit = function(event) { event.preventDefault(); };
        var bag = dom.node('div'), vault = dom.node('div', '', 'bank-vault');
        content.append(summary, form, dom.node('h3', 'Votre sac'), dom.node('p', 'Choisissez un objet à déposer.', 'muted'), bag, dom.node('h3', 'Votre coffre'), dom.node('p', 'Choisissez un objet à retirer.', 'muted'), vault);
        return {
            profile: function(next) {
                profile = next;
                summary.textContent = profile.bank.items.length + ' / ' + config.capacity + ' cases · ' + profile.bank.gold + ' pièces au coffre';
                bag.replaceChildren(items.grid(profile.items, profile.capacity, {equipped:profile.equipped,label:'Sac en banque',select:function(item) {
                    if (item) command('bank.item', {id:item.id,deposit:true});
                }}));
                vault.replaceChildren(items.grid(profile.bank.items, config.capacity, {bank:true,label:'Cases du coffre',select:function(item) {
                    if (item) command('bank.item', {id:item.id,deposit:false});
                }}));
            }
        };
    };
});
