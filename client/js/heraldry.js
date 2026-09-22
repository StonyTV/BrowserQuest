define(function () {
    "use strict";

    var frames = [
        { id: "shield", label: "Écu" },
        { id: "round", label: "Médaillon" },
        { id: "banner", label: "Bannière" }
    ];

    var symbols = [
        { id: "sun", label: "Soleil" },
        { id: "oak", label: "Chêne" },
        { id: "sword", label: "Épée" },
        { id: "stag", label: "Cerf" }
    ];

    var frameIds = { shield: true, round: true, banner: true };
    var symbolIds = { sun: true, oak: true, sword: true, stag: true };
    var metalLight = "#f4da8a";
    var metalDark = "#765126";

    var framePaths = {
        shield: {
            outer: '<path d="M10 9h80v39c0 21-16 34-40 44C26 82 10 69 10 48V9z"',
            inner: '<path d="M17 16h66v32c0 16-12 27-33 36C29 75 17 64 17 48V16z"'
        },
        round: {
            outer: '<circle cx="50" cy="50" r="41"',
            inner: '<circle cx="50" cy="50" r="34"'
        },
        banner: {
            outer: '<path d="M12 10h76v64l-10 16-10-12-18 13-18-13-10 12-10-16V10z"',
            inner: '<path d="M19 17h62v53L70 78l-20-14-20 14-11-8V17z"'
        }
    };

    var emblems = {
        sun: '<g fill="PRIMARY" stroke="SECONDARY" stroke-width="2" stroke-linejoin="round"><path d="M50 21l4 15 12-9-5 14 15-1-13 9 13 9-15-1 5 14-12-9-4 15-4-15-12 9 5-14-15 1 13-9-13-9 15 1-5-14 12 9 4-15z"/><circle cx="50" cy="51" r="14" fill="SECONDARY"/><circle cx="50" cy="51" r="8" fill="PRIMARY" stroke="none"/></g>',
        oak: '<g fill="PRIMARY" stroke="SECONDARY" stroke-width="3" stroke-linejoin="round"><path d="M47 72h7V48h-7z"/><path d="M49 52C34 51 26 43 30 33c1-5 6-8 11-7-1-8 6-13 13-9 5-7 15-4 16 4 8-2 13 5 10 12 8 2 9 12 3 17-6 5-15 4-21 2-3 5-7 7-13 7z"/><path d="M50 49c-7-8-13-13-19-16M51 48c7-9 14-14 23-18" fill="none"/></g>',
        sword: '<g fill="PRIMARY" stroke="SECONDARY" stroke-width="3" stroke-linejoin="round"><path d="M56 24l10 10-23 23-7-7z"/><path d="M37 50l13 13-5 5-13-13z"/><path d="M29 57l14 14-5 5-14-14z"/><path d="M24 76l5-14 9 9z"/><path d="M51 57l8 8-5 5-8-8z"/></g>',
        stag: '<g fill="PRIMARY" stroke="SECONDARY" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M39 72c-4-9-4-16 1-23 3-5 8-7 14-6 7 1 11 6 11 13 0 7-5 12-12 14l-1 8h-8l-1-8-4 2z"/><path d="M42 47c-5-5-8-11-7-18 1-5-2-9-6-12M36 29c-5 0-9-2-12-6M38 35c-5-2-8-5-10-9M59 46c5-4 8-10 8-17 0-5 3-9 7-11M67 28c5 0 9-2 12-5M65 34c5-1 8-4 11-8" fill="none"/><circle cx="47" cy="56" r="2" fill="SECONDARY" stroke="none"/><circle cx="58" cy="56" r="2" fill="SECONDARY" stroke="none"/></g>'
    };

    function option(value, lookup, fallback) {
        return Object.prototype.hasOwnProperty.call(lookup, value) ? value : fallback;
    }

    function color(value, fallback) {
        return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
    }

    function boundedSize(value) {
        var number = Number(value);
        if (!isFinite(number)) {
            return 64;
        }
        return Math.max(16, Math.min(128, Math.round(number)));
    }

    function replaceColors(markup, primary, secondary) {
        return markup.replace(/PRIMARY/g, primary).replace(/SECONDARY/g, secondary);
    }

    function render(crest, size) {
        crest = crest || {};
        var frame = option(crest.frame, frameIds, "shield");
        var symbol = option(crest.symbol, symbolIds, "sun");
        var primary = color(crest.primary, "#7e2634");
        var secondary = color(crest.secondary, "#f1d27a");
        var pixels = boundedSize(size);
        var shape = framePaths[frame];
        var emblem = replaceColors(emblems[symbol], primary, secondary);

        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + pixels + '" height="' + pixels + '" viewBox="0 0 100 100" role="img" aria-label="Blason de guilde">' +
            '<g id="base" stroke-linejoin="round">' +
            shape.outer + ' fill="' + metalDark + '" stroke="' + metalDark + '" stroke-width="6"/>' +
            shape.outer + ' fill="' + secondary + '" stroke="' + metalLight + '" stroke-width="3"/>' +
            shape.inner + ' fill="' + primary + '" stroke="' + metalDark + '" stroke-width="2"/>' +
            '</g>' +
            '<g id="emblem">' + emblem + '</g>' +
            '</svg>';
    }

    return {
        frames: frames,
        symbols: symbols,
        render: render
    };
});
