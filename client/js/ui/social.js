define(['ui/dom', 'ui/items', 'heraldry', 'text!../../../shared/content/social.json'], function(dom, items, heraldry, raw) {
    var config = JSON.parse(raw);
    var labels = {leader: 'Meneur', officer: 'Officier', member: 'Membre'};
    return function(game, command) {
        var content = document.getElementById('social-content');
        var tabs = document.getElementById('social-tabs');
        var profile, state = { players: [], party: null, guild: null, invitations: [] }, active = 'players', service;
        var editor = false, bankSelected;
        function action(label, name, payload, className) {
            return dom.button(label, function() { command(name, payload); }, className);
        }
        function section(title) { content.append(dom.node('h3', title)); }
        function crestEditor(value, submit) {
            var form = dom.node('form', '', 'crest-editor');
            var preview = dom.node('div', '', 'crest-preview');
            var frame = dom.select('frame', heraldry.frames, value.frame);
            var symbol = dom.select('symbol', heraldry.symbols, value.symbol);
            var primary = dom.input('primary', 'color', value.primary), secondary = dom.input('secondary', 'color', value.secondary);
            function values() { return {frame:frame.value,symbol:symbol.value,primary:primary.value,secondary:secondary.value}; }
            function refresh() { preview.innerHTML = heraldry.render(values(), 100); }
            [frame, symbol, primary, secondary].forEach(function(input) { input.oninput = refresh; });
            form.append(preview, dom.field('Cadre', frame), dom.field('Emblème', symbol), dom.field('Fond', primary), dom.field('Motif', secondary));
            var name, tag;
            if (!state.guild) {
                name = dom.input('guildName'); name.required = true; name.minLength = 3; name.maxLength = 24;
                tag = dom.input('guildTag'); tag.required = true; tag.minLength = 2; tag.maxLength = 5; tag.pattern = '[A-Za-z0-9]{2,5}';
                form.append(dom.field('Nom de la guilde', name), dom.field('Sigle · 2 à 5 lettres', tag));
            }
            var save = dom.node('button', state.guild ? 'Enregistrer le blason' : 'Fonder · ' + config.guild.cost + ' or', 'primary');
            save.type = 'submit';
            form.append(save);
            form.onsubmit = function(event) { event.preventDefault(); submit(values(), name && name.value, tag && tag.value); };
            refresh();
            return form;
        }
        function guildView() {
            var guild = state.guild;
            if (!guild) {
                section('Une bannière, une aventure commune');
                content.append(dom.node('p', 'Fondez votre guilde auprès d’Ysée, au village. Invitez vos compagnons et choisissez votre blason.'));
                if (service && service.services.includes('guild')) content.append(crestEditor({frame:'shield',symbol:'sun',primary:'#7e2634',secondary:'#f1d27a'}, function(crest,name,tag) {
                    command('guild.create', {name:name,tag:tag,crest:crest});
                }));
                else content.append(dom.node('p', 'Ysée se trouve près de la fontaine du village. Coût : ' + config.guild.cost + ' or.', 'muted'));
                return;
            }
            var heading = dom.node('div', '', 'guild-heading');
            var badge = dom.node('span'); badge.innerHTML = heraldry.render(guild.crest, 72);
            heading.append(badge, dom.node('h3', guild.name + '\n[' + guild.tag + ']'));
            content.append(heading, dom.node('p', guild.members.length + ' / ' + config.guild.maxMembers + ' membres'));
            var self = guild.members.find(function(member) { return member.id === profile.id; });
            if (self && self.role === 'leader') {
                content.append(dom.button(editor ? 'Fermer l’atelier' : 'Personnaliser le blason', function() { editor = !editor; render(); }));
                if (editor) content.append(crestEditor(guild.crest, function(crest) { command('guild.crest', {crest:crest}); }));
            }
            guild.members.forEach(function(member) {
                var row = dom.node('div', '', 'social-row');
                row.append(dom.node('span', (member.online ? '● ' : '○ ') + member.name), dom.node('small', labels[member.role]));
                if (self && self.role === 'leader' && member.id !== profile.id) {
                    var role = dom.select('role', Object.keys(labels).map(function(id) {return {id:id,label:labels[id]};}), member.role);
                    role.setAttribute('aria-label', 'Rang de ' + member.name);
                    role.onchange = function() { command('guild.role', {id:member.id,role:role.value}); };
                    row.append(role, action('Exclure', 'guild.kick', {id:member.id}, 'danger'));
                }
                content.append(row);
            });
            content.append(dom.button('Quitter la guilde', function() {
                if (window.confirm('Quitter ' + guild.name + ' ?')) command('guild.leave');
            }, 'danger'));
        }
        function partyView() {
            section('Compagnons de route');
            if (!state.party) { content.append(dom.node('p', 'Invitez un joueur depuis l’onglet Joueurs pour former un groupe de cinq aventuriers.')); return; }
            state.party.members.forEach(function(member) {
                var row = dom.node('div', '', 'social-row');
                row.append(dom.node('strong', member.name + (member.id === state.party.leader ? ' · Chef' : '')));
                if (state.party.leader === profile.id && member.id !== profile.id) row.append(action('Retirer', 'party.kick', {id:member.id}));
                content.append(row);
            });
            content.append(action('Quitter le groupe', 'party.leave'));
        }
        function bankView() {
            section('Votre coffre');
            if (!service || !service.services.includes('bank')) { content.append(dom.node('p', 'Parlez à un intendant du village pour accéder à votre banque.')); return; }
            content.append(dom.node('p', profile.bank.items.length + ' / ' + config.bank.capacity + ' cases · ' + profile.bank.gold + ' or en banque'));
            var form = dom.node('form', '', 'bank-gold');
            var amount = dom.input('amount', 'number', 1); amount.min = 1; amount.max = Number.MAX_SAFE_INTEGER; amount.required = true;
            form.append(dom.field('Pièces', amount), action('Déposer', 'bank.gold', {}));
            form.lastChild.onclick = function() { if (form.reportValidity()) command('bank.gold', {amount:Number(amount.value),deposit:true}); };
            form.append(dom.button('Retirer', function() { if (form.reportValidity()) command('bank.gold', {amount:Number(amount.value),deposit:false}); }));
            form.onsubmit = function(event) {event.preventDefault();};
            content.append(form, dom.node('h4', 'Sac · choisir un objet à déposer'));
            content.append(items.grid(profile.items, profile.capacity, {equipped:profile.equipped,selected:bankSelected,label:'Sac en banque',select:function(item) {
                bankSelected = item && item.id; if (item) command('bank.item', {id:item.id,deposit:true});
            }}));
            content.append(dom.node('h4', 'Coffre · choisir un objet à retirer'));
            content.append(items.grid(profile.bank.items, config.bank.capacity, {bank:true,label:'Cases du coffre',select:function(item) {
                if (item) command('bank.item', {id:item.id,deposit:false});
            }}));
        }
        function render() {
            tabs.replaceChildren();
            [['players','Joueurs'],['party','Groupe'],['guild','Guilde'],['bank','Banque']].forEach(function(tab) {
                var button = dom.button(tab[1], function() { active = tab[0]; render(); }, active === tab[0] ? 'active' : '');
                button.setAttribute('aria-pressed', String(active === tab[0])); tabs.append(button);
            });
            content.replaceChildren();
            if (!profile) return;
            state.invitations.filter(function(invite) { return invite.expires > Date.now(); }).forEach(function(invite) {
                var row = dom.node('div', '', 'invitation');
                row.append(dom.node('p', invite.fromName + ' vous invite : ' + (invite.type === 'guild' ? 'guilde ' : 'groupe de ') + invite.label), action('Accepter', 'invitation.answer', {id:invite.id,accept:true}, 'primary'), action('Refuser', 'invitation.answer', {id:invite.id,accept:false}));
                content.append(row);
            });
            if (active === 'guild') guildView();
            else if (active === 'party') partyView();
            else if (active === 'bank') bankView();
            else {
                section('Aventuriers en ligne · ' + state.players.length);
                state.players.forEach(function(player) {
                    var row = dom.node('div', '', 'social-row');
                    row.append(dom.node('strong', player.name + (player.guildTag ? ' [' + player.guildTag + ']' : '')));
                    if (player.id === profile.id) row.append(dom.node('small', 'Vous'));
                    else {
                        row.append(action('Grouper', 'party.invite', {id:player.id}));
                        var self = state.guild && state.guild.members.find(function(member) {return member.id === profile.id;});
                        if (self && self.role !== 'member' && !player.guildTag) row.append(action('Inviter en guilde', 'guild.invite', {id:player.id}));
                    }
                    content.append(row);
                });
            }
        }
        return {
            state: function(next) {
                state = next; render();
                document.getElementById('social-toggle').textContent = 'Compagnons · G' + (state.invitations.length ? ' (' + state.invitations.length + ')' : '');
                var group = document.getElementById('party-hud'); group.replaceChildren();
                if (state.party) state.party.members.forEach(function(member) {
                    var row = dom.node('div', '', 'party-member'); row.dataset.entityId = member.entityId;
                    row.append(dom.node('strong', member.name));
                    var hp = dom.node('progress'); hp.max = member.maxHp; hp.value = member.hp;
                    hp.setAttribute('aria-label', 'Vie de ' + member.name); row.append(hp); group.append(row);
                });
            },
            profile: function(next) { profile = next; render(); },
            service: function(next) { service = next; active = next.services.includes('guild') ? 'guild' : 'bank'; render(); }
        };
    };
});
