define(['ui/dom'], function(dom) {
    return function(app, game) {
        var screen = document.getElementById('account-screen'), content = document.getElementById('account-content');
        var notice = document.getElementById('account-notice'), title = document.getElementById('account-title');
        var account, providers = [], email = '', busy = false, selected, characters = [], recovery;
        var legacy = /^[a-f0-9]{64}$/.test(localStorage.getItem('bq-token') || '') ? localStorage.getItem('bq-token') : null;
        var behind = Array.from(document.body.children).filter(function(element) { return element !== screen && !/SCRIPT|STYLE/.test(element.tagName); });
        behind.forEach(function(element) { element.inert = true; });
        function message(text, error) { notice.textContent = text || ''; notice.classList.toggle('is-error', Boolean(error)); }
        async function api(path, data) {
            var response = await fetch('/api/' + path, { method: data ? 'POST' : 'GET', credentials: 'same-origin',
                headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
            var result = await response.json();
            if (!response.ok) throw new Error(result.error || 'La connexion a échoué. Réessayez.');
            return result;
        }
        async function action(work) {
            if (busy) return;
            busy = true; message(''); screen.setAttribute('aria-busy', 'true');
            content.querySelectorAll('button').forEach(function(button) { button.disabled = true; });
            try { await work(); }
            catch (error) { message(error.message || 'Le serveur est injoignable. Réessayez.', true); }
            finally {
                busy = false; screen.removeAttribute('aria-busy');
                content.querySelectorAll('button').forEach(function(button) { button.disabled = button.dataset.unavailable === 'true'; });
            }
        }
        function heading(text, subtitle) {
            title.textContent = text; title.tabIndex = -1; title.focus({preventScroll: true}); content.replaceChildren(); message('');
            content.append(dom.node('p', subtitle, 'account-intro'));
            screen.classList.toggle('character-selection', text === 'Vos personnages');
        }
        function field(form, label, type, name, autocomplete) {
            var input = dom.input(name, type); input.required = true; input.autocomplete = autocomplete;
            input.maxLength = type === 'email' ? 254 : 128;
            if (type === 'password') input.minLength = 8;
            form.append(dom.field(label, input)); return input;
        }
        function submit(form, label, work) {
            var button = dom.node('button', label, 'account-primary'); button.type = 'submit'; form.append(button);
            form.onsubmit = function(event) { event.preventDefault(); void action(work); };
            content.append(form);
        }
        function link(label, work) { content.append(dom.button(label, function() { if (!busy) work(); }, 'account-link')); }
        function credentials(signup) {
            heading(signup ? 'Votre aventure commence' : 'Bon retour, aventurier', signup ? 'Un compte pour retrouver vos personnages, votre butin et vos compagnons.' : 'Le village vous attend. Reprenez votre aventure.');
            if (providers.length) {
                var socials = dom.node('div', null, 'account-providers');
                providers.forEach(function(provider) { socials.append(dom.button('Continuer avec ' + (provider === 'google' ? 'Google' : 'Apple'), function() {
                    void action(async function() { location.assign((await api('auth/oauth', { provider: provider })).url); });
                })); });
                content.append(socials, dom.node('p', 'ou avec votre e-mail', 'account-divider'));
            }
            var form = dom.node('form');
            var mail = field(form, 'Adresse e-mail', 'email', 'email', 'email'); mail.value = email;
            var password = field(form, 'Mot de passe', 'password', 'password', signup ? 'new-password' : 'current-password');
            if (signup) form.append(dom.node('small', 'Au moins 8 caractères. Votre adresse sera confirmée par un code.', 'account-muted'));
            submit(form, signup ? 'Créer mon compte' : 'Se connecter', async function() {
                email = mail.value.trim();
                var result = await api(signup ? 'auth/signup' : 'auth/signin', { email: email, password: password.value });
                password.value = '';
                if (signup) verification(false);
                else { account = result.account; await selection(); }
            });
            link(signup ? 'J’ai déjà un compte' : 'Créer un compte', function() { email = mail.value.trim(); credentials(!signup); });
            if (!signup) {
                link('Mot de passe oublié ?', function() { email = mail.value.trim(); recover(); });
                link('J’ai déjà reçu un code de confirmation', function() { email = mail.value.trim(); verification(false); });
            }
        }
        function recover() {
            heading('Retrouvez votre chemin', 'Recevez un code pour choisir un nouveau mot de passe.');
            var form = dom.node('form'), mail = field(form, 'Adresse e-mail', 'email', 'email', 'email'); mail.value = email;
            submit(form, 'Recevoir un code', async function() {
                email = mail.value.trim(); await api('auth/recover', { email: email }); verification(true);
            });
            link('Retour à la connexion', function() { credentials(false); });
        }
        function verification(reset) {
            heading(reset ? 'Un nouveau départ' : 'Ouvrez les portes', reset ? 'Si cette adresse possède un compte, un code vient de lui être envoyé.' : 'Saisissez le code à 6 chiffres envoyé à votre adresse e-mail.');
            var form = dom.node('form'), mail = field(form, 'Adresse e-mail', 'email', 'email', 'email'); mail.value = email;
            var code = field(form, 'Code de confirmation', 'text', 'code', 'one-time-code');
            code.inputMode = 'numeric'; code.pattern = '[0-9]{6}'; code.maxLength = 6; code.className = 'account-code';
            var password = reset ? field(form, 'Nouveau mot de passe', 'password', 'password', 'new-password') : null;
            submit(form, reset ? 'Enregistrer et se connecter' : 'Confirmer mon adresse', async function() {
                email = mail.value.trim();
                var result = await api(reset ? 'auth/reset-password' : 'auth/verify', { email: email, code: code.value, ...(password ? { password: password.value } : {}) });
                account = result.account; await selection();
            });
            link('Renvoyer le code', function() { void action(async function() {
                email = mail.value.trim(); await api(reset ? 'auth/recover' : 'auth/resend', { email: email }); message('Un nouveau code a été demandé. Vérifiez votre boîte e-mail.');
            }); });
            link('Retour à la connexion', function() { credentials(false); });
        }
        function avatar(character) {
            var portrait = dom.node('div', null, 'account-avatar');
            var sprite = dom.node('span'); sprite.style.backgroundImage = 'url("img/3/' + Types.getKindAsString(character.armor) + '.png")';
            portrait.append(sprite); return portrait;
        }
        async function selection() {
            characters = (await api('characters')).characters;
            selected = characters.find(function(character) { return character.id === selected?.id; }) || characters[0];
            recovery = null;
            if (legacy) {
                try { recovery = (await api('characters/legacy', { token: legacy })).character; }
                catch { /* Recovery is optional; a missing legacy character never blocks the account. */ }
            }
            renderSelection();
        }
        function renderSelection() {
            heading('Vos personnages', 'Choisissez qui franchira les portes du village.');
            var grid = dom.node('div', null, 'account-characters');
            for (var index = 0; index < 3; index++) {
                var character = characters[index];
                if (character) {
                    (function(hero) {
                        var card = dom.button('', function() { selected = hero; renderSelection(); }, 'account-character' + (selected?.id === hero.id ? ' selected' : ''));
                        card.setAttribute('aria-pressed', String(selected?.id === hero.id)); card.setAttribute('aria-label', hero.name + ', niveau ' + hero.level);
                        card.append(avatar(hero), dom.node('strong', hero.name), dom.node('small', 'Niveau ' + hero.level), dom.node('span', hero.active ? 'En jeu' : hero.gold + ' pièces', 'account-muted')); grid.append(card);
                    })(character);
                } else {
                    var empty = dom.button('', function() { create(); }, 'account-character empty');
                    empty.append(dom.node('span', '+', 'account-new'), dom.node('strong', 'Nouveau personnage'), dom.node('small', 'Une nouvelle histoire')); grid.append(empty);
                }
            }
            content.append(grid);
            if (selected) content.append(dom.button('Jouer avec ' + selected.name, function() {
                void action(async function() {
                    var session = await api('auth/session');
                    if (!session.account) { account = null; credentials(false); message('Votre session a expiré. Reconnectez-vous.', true); return; }
                    game.selectedCharacterId = selected.id;
                    app.storage.selectCharacter(selected.id);
                    message('Le village se prépare…');
                    content.querySelectorAll('button').forEach(function(button) { button.dataset.unavailable = 'true'; });
                    app.tryStartingGame(selected.name);
                });
            }, 'account-primary'));
            if (recovery && !characters.some(function(hero) { return hero.id === recovery.id; })) {
                var recoverButton = dom.button('Récupérer ' + recovery.name + ' · ancien personnage', function() { create(true); }, 'account-recovery');
                content.append(recoverButton);
            }
            content.append(dom.node('p', account.email, 'account-email'));
            link('Déconnexion', function() { void action(async function() { await api('auth/logout', {}); account = null; credentials(false); }); });
        }
        function create(claim) {
            heading(claim ? 'Retrouvez votre personnage' : 'Nommez votre aventurier', claim ? 'Votre équipement, votre guilde et votre progression seront rattachés à ce compte.' : 'Trois emplacements, autant d’histoires à écrire.');
            content.append(avatar(claim ? recovery : { armor: 21 }));
            var form = dom.node('form'), name = field(form, 'Nom du personnage', 'text', 'name', 'off');
            name.minLength = 3; name.maxLength = 15; name.value = claim ? recovery.name : '';
            form.append(dom.node('small', '3 à 15 caractères. Ce nom sera visible par les autres joueurs.', 'account-muted'));
            submit(form, claim ? 'Rattacher à mon compte' : 'Créer le personnage', async function() {
                var result = await api(claim ? 'characters/claim' : 'characters', { name: name.value, ...(claim ? { token: legacy } : {}) });
                selected = result.character;
                if (claim) {
                    if (localStorage.getItem('data') && !localStorage.getItem('bq-character:' + selected.id)) localStorage.setItem('bq-character:' + selected.id, localStorage.getItem('data'));
                    localStorage.removeItem('bq-token'); legacy = null;
                }
                await selection();
            });
            link('Retour aux personnages', renderSelection);
        }
        game.accountReady = function() { behind.forEach(function(element) { element.inert = false; }); screen.hidden = true; document.body.classList.remove('account-open'); };
        document.getElementById('account-toggle').onclick = function() { document.getElementById('account-dialog').showModal(); };
        document.getElementById('account-close').onclick = function() { document.getElementById('account-dialog').close(); };
        document.getElementById('account-switch').onclick = function() { game.client?.connection?.close(); location.reload(); };
        document.getElementById('account-logout').onclick = async function() {
            this.disabled = true;
            try { await api('auth/logout', {}); location.reload(); }
            catch (error) { document.getElementById('account-dialog-error').textContent = error.message; this.disabled = false; }
        };
        document.addEventListener('bq-connection-lost', function(event) {
            if (screen.hidden) return;
            content.replaceChildren(dom.button('Retour aux personnages', function() { location.reload(); }, 'account-primary'));
            var reasons = { 'Account already playing in another window': 'Votre compte joue déjà dans une autre fenêtre. Fermez-la pour reprendre ici.',
                'Unknown character; create a new character': 'Ce personnage n’est pas disponible pour ce compte.',
                'Character already connected in another window': 'Ce personnage est déjà connecté dans une autre fenêtre.' };
            message(reasons[event.detail] || 'La connexion au monde a été interrompue. Réessayez.', true);
        });
        function boot() { void action(async function() {
            var session = await api('auth/session');
            if (session.testLegacy) {
                game.accountReady(); document.body.classList.remove('account-mode'); document.getElementById('account-toggle').hidden = true; return;
            }
            providers = session.providers; account = session.account;
            if (account) await selection(); else credentials(false);
            if (new URLSearchParams(location.search).has('auth_error')) {
                message('La connexion externe a été annulée ou a expiré. Vous pouvez réessayer.', true);
                history.replaceState(null, '', location.pathname);
            }
        }); }
        content.append(dom.button('Réessayer', boot, 'account-link'));
        boot();
    };
});
