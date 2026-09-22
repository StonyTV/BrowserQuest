define(['ui/crest-editor', 'heraldry', 'text!../../../shared/content/social.json'], function(CrestEditor, heraldry, raw) {
    var config = JSON.parse(raw).guild;
    return function(command) {
        var dialog = document.getElementById('guild-create-dialog');
        var form = document.getElementById('guild-create-form');
        var controls = document.getElementById('guild-create-crest');
        var name = form.elements.guildName, tag = form.elements.guildTag;
        var submit = document.getElementById('guild-create-submit');
        var feedback = document.getElementById('guild-create-feedback');
        var profile, crest, pending = false;
        function preview() {
            document.getElementById('guild-create-preview').innerHTML = heraldry.render(crest, 128);
            document.getElementById('guild-preview-name').textContent = name.value.trim() || 'Votre guilde';
            document.getElementById('guild-preview-tag').textContent = '[' + (tag.value.trim().toUpperCase() || 'SIGLE') + ']';
        }
        function wallet() {
            if (!profile) return;
            document.getElementById('guild-create-wallet').textContent = profile.gold + ' pièces dans votre bourse';
            document.getElementById('guild-create-cost').textContent = config.cost;
            submit.disabled = pending || profile.gold < config.cost;
            submit.textContent = pending ? 'Fondation en cours…' : 'Fonder la guilde';
            form.setAttribute('aria-busy', String(pending));
            form.querySelectorAll('input').forEach(function(input) { input.disabled = pending; });
            document.getElementById('guild-create-cancel').disabled = pending;
            document.getElementById('guild-create-close').disabled = pending;
            document.getElementById('guild-create-shortfall').hidden = profile.gold >= config.cost;
        }
        function close() { if (!pending) dialog.close(); }
        dialog.addEventListener('cancel', function(event) { if (pending) event.preventDefault(); });
        dialog.addEventListener('keydown', function(event) {
            event.stopPropagation();
            if (event.key !== 'Tab') return;
            var buttons = dialog.querySelectorAll('button:not(:disabled)');
            var first = buttons[0], last = buttons[buttons.length - 1];
            if (first && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
                event.preventDefault(); (event.shiftKey ? last : first).focus();
            }
        });
        dialog.addEventListener('close', function() { document.getElementById('social-toggle').focus(); });
        document.getElementById('guild-create-close').onclick = close;
        document.getElementById('guild-create-cancel').onclick = close;
        name.oninput = tag.oninput = preview;
        form.onsubmit = function(event) {
            event.preventDefault();
            if (pending || !form.reportValidity() || profile.gold < config.cost) return;
            pending = true; feedback.textContent = ''; wallet();
            command('guild.create', {name:name.value,tag:tag.value,crest:crest});
        };
        return {
            isOpen: function() { return dialog.open; },
            open: function(next) {
                if (dialog.open) return;
                profile = next; pending = false; form.reset(); feedback.textContent = '';
                crest = {frame:'shield',symbol:'sun',primary:'#7e2634',secondary:'#f1d27a'};
                controls.replaceChildren(CrestEditor(crest, function(value) { crest = value; preview(); }));
                preview(); wallet(); dialog.showModal(); name.focus();
            },
            profile: function(next) { profile = next; wallet(); },
            notice: function(data) {
                if (!dialog.open || data.action !== 'guild.create' || !data.error) return;
                pending = false; feedback.textContent = data.message; wallet();
            },
            complete: function() { pending = false; wallet(); dialog.close(); }
        };
    };
});
