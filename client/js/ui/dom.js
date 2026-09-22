define(function() {
    function node(tag, value, className) {
        var element = document.createElement(tag);
        if (value != null) element.textContent = value;
        if (className) element.className = className;
        return element;
    }
    function button(label, action, className) {
        var element = node('button', label, className);
        element.type = 'button';
        element.onclick = action;
        return element;
    }
    function field(label, control) {
        var element = node('label', label, 'rpg-field');
        control.setAttribute('aria-label', label);
        element.append(control);
        return element;
    }
    function input(name, type, value) {
        var element = node('input');
        element.name = name;
        element.type = type || 'text';
        if (value != null) element.value = value;
        return element;
    }
    function select(name, options, value) {
        var element = node('select');
        element.name = name;
        options.forEach(function(option) {
            var child = node('option', option.label);
            child.value = option.id;
            element.append(child);
        });
        if (value != null) element.value = value;
        return element;
    }
    return { node: node, button: button, field: field, input: input, select: select };
});
