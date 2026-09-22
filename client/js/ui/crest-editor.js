define(['ui/dom', 'heraldry'], function(dom, heraldry) {
    return function(initial, onChange) {
        var value = Object.assign({}, initial);
        var root = dom.node('div', '', 'crest-controls');
        function choices(key, title, options) {
            var field = dom.node('fieldset', '', 'crest-options');
            field.append(dom.node('legend', title));
            var list = dom.node('div', '', 'crest-choice-list');
            options.forEach(function(option) {
                var label = dom.node('label', '', 'crest-choice');
                var input = dom.input('crest-' + key, 'radio', option.id);
                input.checked = value[key] === option.id;
                input.setAttribute('aria-label', option.label);
                input.onchange = function() { value[key] = input.value; onChange(value); };
                var icon = dom.node('span'); icon.setAttribute('aria-hidden', 'true');
                icon.innerHTML = heraldry.render(Object.assign({}, initial, {[key]:option.id}), 40);
                label.append(input, icon, dom.node('span', option.label));
                list.append(label);
            });
            field.append(list); root.append(field);
        }
        choices('frame', 'Le cadre', heraldry.frames);
        choices('symbol', 'L’emblème', heraldry.symbols);
        var colors = dom.node('div', '', 'crest-colors');
        [['primary','Couleur du fond'],['secondary','Couleur du motif']].forEach(function(pair) {
            var input = dom.input(pair[0], 'color', value[pair[0]]);
            input.oninput = function() { value[pair[0]] = input.value; onChange(value); };
            colors.append(dom.field(pair[1], input));
        });
        root.append(colors);
        return root;
    };
});
