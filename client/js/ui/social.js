define(['ui/dom', 'ui/crest-editor', 'heraldry', 'text!../../../shared/content/social.json'], function(dom, CrestEditor, heraldry, raw) {
    var config = JSON.parse(raw);
    var labels = {leader: 'Meneur', officer: 'Officier', member: 'Membre'};
    return function(game, command) {
        var content = document.getElementById('social-content');
        var tabs = document.getElementById('social-tabs');
        var profile, state = { players: [], party: null, guild: null, invitations: [] }, active = 'players';
        var editor = false, editorDraft, invitationTimer;
        function action(label, name, payload, className) {
            return dom.button(label, function() { command(name, payload); }, className);
        }
        function section(title) { content.append(dom.node('h3', title)); }
        function crestEditor() {
            var form = dom.node('form', '', 'crest-editor');
            var preview = dom.node('div', '', 'crest-preview');
            function refresh() { preview.innerHTML = heraldry.render(editorDraft, 100); }
            form.append(preview, CrestEditor(editorDraft, function(value) { editorDraft = value; refresh(); }));
            var save = dom.node('button', 'Enregistrer le blason', 'primary'); save.type = 'submit'; form.append(save);
            form.onsubmit = function(event) { event.preventDefault(); command('guild.crest', {crest:editorDraft}); };
            refresh(); return form;
        }
        function guildView() {
            var guild = state.guild;
            if (!guild) {
                section('Une bannière, une aventure commune');
                content.append(dom.node('p', 'Fondez votre guilde auprès d’Ysée, au village. Invitez vos compagnons et choisissez votre blason.'));
                content.append(dom.node('p', 'Ysée se trouve près de la fontaine du village. Coût : ' + config.guild.cost + ' or.', 'muted'));
                return;
            }
            var heading = dom.node('div', '', 'guild-heading');
            var badge = dom.node('span'); badge.innerHTML = heraldry.render(guild.crest, 72);
            heading.append(badge, dom.node('h3', guild.name + '\n[' + guild.tag + ']'));
            content.append(heading, dom.node('p', guild.members.length + ' / ' + config.guild.maxMembers + ' membres'));
            var self = guild.members.find(function(member) { return member.id === profile.id; });
            if (self && self.role === 'leader') {
                content.append(dom.button(editor ? 'Fermer l’atelier' : 'Personnaliser le blason', function() { editor = !editor; editorDraft = Object.assign({}, guild.crest); render(); }));
                if (editor) content.append(crestEditor());
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
        function render() {
            var invitations = state.invitations.filter(function(invite) { return invite.expires > Date.now(); });
            clearTimeout(invitationTimer);
            if (invitations.length) invitationTimer = setTimeout(render, Math.max(1, Math.min.apply(null, invitations.map(function(invite) { return invite.expires; })) - Date.now() + 20));
            var badge = document.getElementById('social-badge'); badge.textContent = invitations.length; badge.hidden = !invitations.length;
            document.getElementById('social-toggle').setAttribute('aria-label', 'Compagnons · G' + (invitations.length ? ' · ' + invitations.length + ' invitation' + (invitations.length > 1 ? 's' : '') : ''));
            tabs.replaceChildren();
            [['players','Joueurs'],['party','Groupe'],['guild','Guilde']].forEach(function(tab) {
                var button = dom.button(tab[1], function() { active = tab[0]; render(); }, active === tab[0] ? 'active' : '');
                button.setAttribute('aria-label', tab[1]);
                var count = invitations.filter(function(invite) { return tab[0] === 'players' || invite.type === tab[0]; }).length;
                if (count) { var marker = dom.node('span', count, 'social-tab-badge'); marker.setAttribute('aria-hidden', 'true'); button.append(marker); }
                button.setAttribute('aria-pressed', String(active === tab[0])); tabs.append(button);
            });
            content.replaceChildren();
            if (!profile) return;
            invitations.filter(function(invite) { return active === 'players' || invite.type === active; }).forEach(function(invite) {
                var row = dom.node('div', '', 'invitation');
                row.append(dom.node('p', invite.fromName + ' vous invite : ' + (invite.type === 'guild' ? 'guilde ' : 'groupe de ') + invite.label), action('Accepter', 'invitation.answer', {id:invite.id,accept:true}, 'primary'), action('Refuser', 'invitation.answer', {id:invite.id,accept:false}));
                content.append(row);
            });
            if (active === 'guild') guildView();
            else if (active === 'party') partyView();
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
                var group = document.getElementById('party-hud'); group.replaceChildren();
                if (state.party) state.party.members.forEach(function(member) {
                    var row = dom.node('div', '', 'party-member'); row.dataset.entityId = member.entityId;
                    row.append(dom.node('strong', member.name));
                    var hp = dom.node('progress'); hp.max = member.maxHp; hp.value = member.hp;
                    hp.setAttribute('aria-label', 'Vie de ' + member.name); row.append(hp); group.append(row);
                });
            },
            profile: function(next) { profile = next; render(); },
            show: function(tab) { active = tab; editor = false; render(); }
        };
    };
});
