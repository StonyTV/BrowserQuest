define(['ui/dom', 'ui/items', 'text!../../../shared/content/crafting.json'], function(dom, items, raw) {
    var content = JSON.parse(raw);
    return function(game, command) {
        var panel = document.getElementById('crafting-panel'), root = document.getElementById('crafting-content');
        var notice = document.getElementById('crafting-notice'), title = document.getElementById('crafting-title');
        var profile, service, pending = false, lastState;
        function level(xp) { return content.levels.filter(function(value) { return (xp || 0) >= value; }).length; }
        function count(kind) { return profile.items.filter(function(item) { return item.kind === kind; }).reduce(function(total, item) { return total + item.quantity; }, 0); }
        function available(recipe) { return level(profile.professions[recipe.profession]) >= recipe.level && profile.gold >= recipe.gold && recipe.ingredients.every(function(input) { return count(input.kind) >= input.quantity; }); }
        function profession(id) {
            var spec = content.professions[id], xp = profile.professions[id] || 0, rank = level(xp);
            var card = dom.node('article', null, 'profession-card');
            card.append(dom.node('strong', spec.name), dom.node('span', 'Niv. ' + rank, 'profession-level'), dom.node('small', spec.description));
            var progress = dom.node('progress'); progress.max = (content.levels[rank] || xp + 1) - content.levels[rank - 1]; progress.value = rank === content.levels.length ? progress.max : xp - content.levels[rank - 1]; progress.setAttribute('aria-label', 'Expérience ' + spec.name);
            card.append(progress, dom.node('small', rank === content.levels.length ? 'Maîtrise maximale' : (xp - content.levels[rank - 1]) + ' / ' + progress.max + ' XP'));
            return card;
        }
        function render() {
            if (!profile) return;
            root.replaceChildren();
            if (service?.resource) { renderResource(); return; }
            title.textContent = service ? 'L’atelier de Brann' : 'Métiers & savoir-faire';
            var professions = dom.node('div', null, 'profession-grid');
            Object.keys(content.professions).forEach(function(id) { professions.append(profession(id)); }); root.append(professions);
            root.append(dom.node('h3', 'Les premières créations'), dom.node('p', service ? 'Les ressources viennent de votre sac. Chaque pièce reçoit sa rareté et ses bonus à la forge.' : 'Récoltez les frênes et les gisements autour du village, puis rejoignez Brann, près de la banque.', 'muted'));
            content.recipes.forEach(function(recipe) {
                var row = dom.node('article', null, 'recipe-card'), heading = dom.node('div', null, 'recipe-heading');
                heading.append(items.icon({kind:recipe.output}), dom.node('h4', recipe.name), dom.node('small', 'Forgeron ' + recipe.level));
                var costs = dom.node('div', null, 'recipe-costs');
                recipe.ingredients.forEach(function(input) {
                    var spec = content.resources.find(function(resource) { return resource.kind === input.kind; });
                    var item = dom.node('span', count(input.kind) + ' / ' + input.quantity + ' ' + spec.name, count(input.kind) >= input.quantity ? 'enough' : 'missing'); costs.append(item);
                });
                costs.append(dom.node('span', recipe.gold + ' pièces', profile.gold >= recipe.gold ? 'enough' : 'missing'));
                var button = dom.button(pending ? 'À la forge…' : 'Fabriquer', function() {
                    pending = true; notice.textContent = ''; render(); command('craft.make', { recipe: recipe.id });
                }, 'primary');
                button.setAttribute('aria-label', 'Fabriquer ' + recipe.name); button.disabled = !service || !available(recipe) || pending;
                row.append(heading, costs, dom.node('small', '+' + recipe.experience + ' XP Forgeron · équipement à bonus aléatoires', 'muted'), button); root.append(row);
            });
            if (!service) root.append(dom.node('p', 'Fabrication disponible à l’atelier de Brann.', 'crafting-hint'));
        }
        function state() { return game.entityInfo?.[service?.id]?.harvest || service?.harvest; }
        function renderResource() {
            title.textContent = service.name;
            var resource = service.resource, current = state(), picture = dom.node('img');
            picture.src = 'img/1/' + Types.getKindAsString(resource.nodeKind) + '.png'; picture.alt = ''; picture.className = 'harvest-picture';
            root.append(picture, profession(resource.profession), dom.node('p', 'Récolte : ' + resource.quantity + ' × ' + resource.name + ' · +' + resource.experience + ' XP', 'harvest-yield'));
            var progress = dom.node('progress'); progress.id = 'harvest-progress'; progress.max = resource.durationMs; progress.value = 0; progress.setAttribute('aria-label', 'Avancement de la récolte');
            var description = dom.node('p', '', 'harvest-status'); description.id = 'harvest-status';
            var button = dom.button('Récolter', function() { pending = true; render(); command('resource.harvest', { id: service.id }); }, 'primary');
            button.disabled = pending || current?.state !== 'ready';
            root.append(progress, description, button, dom.node('p', 'Restez immobile. Bouger ou combattre interrompt la récolte. La ressource est partagée avec les autres aventuriers.', 'muted'));
            lastState = current?.state + ':' + current?.until; updateProgress();
        }
        function updateProgress() {
            var current = state(), status = document.getElementById('harvest-status'), progress = document.getElementById('harvest-progress');
            if (!current || !status) return;
            var remaining = Math.max(0, Math.ceil((current.until - Date.now()) / 1000));
            status.textContent = current.state === 'harvesting' ? current.actor + ' récolte · ' + remaining + ' s' : current.state === 'depleted' ? 'Renouvellement dans ' + remaining + ' s' : 'Prêt à récolter';
            progress.value = current.state === 'harvesting' ? Math.max(0, service.resource.durationMs - (current.until - Date.now())) : 0;
        }
        setInterval(function() {
            if (panel.hidden || !service?.resource) return;
            var current = state(), key = current?.state + ':' + current?.until;
            if (lastState !== key) render(); else updateProgress();
        }, 200);
        return {
            profile: function(value) { profile = value; render(); },
            show: function() { service = null; notice.textContent = ''; render(); },
            service: function(value) { service = value; pending = false; notice.textContent = ''; render(); },
            event: function(type, value) { pending = false; notice.textContent = value.message || 'Récolte en cours…'; render(); },
            notice: function(value) { if (value.action === 'craft.make' || value.action === 'resource.harvest') { pending = false; notice.textContent = value.message; render(); } }
        };
    };
});
