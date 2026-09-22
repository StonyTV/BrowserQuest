define(['ui/dom', 'text!../../../shared/content/social.json'], function(dom, content) {
    var channels = JSON.parse(content).channels;
    return function(game, command) {
        var root = document.getElementById('rpg-chat');
        var log = document.getElementById('rpg-chat-log');
        var form = document.getElementById('rpg-chat-form');
        var input = document.getElementById('rpg-chat-input');
        var channel = dom.select('channel', Object.keys(channels).map(function(id) { return {id: id, label: channels[id].label}; }));
        channel.setAttribute('aria-label', 'Canal de discussion');
        form.prepend(channel);
        form.onsubmit = function(event) {
            event.preventDefault();
            if (input.value.trim()) command('chat.send', { channel: channel.value, body: input.value.trim() });
            input.value = '';
        };
        document.getElementById('chat-toggle').onclick = function() { root.classList.toggle('collapsed'); };
        document.addEventListener('keydown', function(event) {
            if (document.querySelector('dialog[open]')) return;
            if (event.key === 'Enter' && game.started && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)) {
                root.classList.remove('collapsed'); input.focus(); event.preventDefault();
            }
            if (event.key === 'Escape' && event.target === input) input.blur();
        });
        function append(node) {
            log.append(node);
            while (log.children.length > 80) log.firstChild.remove();
            log.scrollTop = log.scrollHeight;
        }
        return {
            message: function(data) {
                var line = dom.node('p', '', 'chat-' + data.channel);
                line.append(dom.node('b', '[' + channels[data.channel].label + '] ' + data.name + ' : '), document.createTextNode(data.body));
                append(line);
                if (data.channel === 'zone' && game.entities[data.entityId]) {
                    game.createBubble(data.entityId, data.body);
                    game.assignBubbleTo(game.entities[data.entityId]);
                }
            },
            notice: function(message) { append(dom.node('p', message, 'chat-notice')); root.classList.remove('collapsed'); },
            social: function(data) {
                Array.from(channel.options).forEach(function(option) {
                    option.disabled = (option.value === 'guild' && !data.guild) || (option.value === 'party' && !data.party);
                });
                if (channel.selectedOptions[0].disabled) channel.value = 'zone';
            }
        };
    };
});
