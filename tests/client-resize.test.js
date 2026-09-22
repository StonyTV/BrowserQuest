const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
test('resizing an account form before game assets load never accesses missing sprites', () => {
    let rendererMethods;
    vm.runInNewContext(readFileSync('client/js/renderer.js', 'utf8'), {
        define: (_, factory) => factory(), Class: { extend: methods => { rendererMethods = methods; return methods; } }
    });
    let selected;
    const renderer = {
        game: { renderer: {}, setSpriteScale(scale) { if (!this.spritesets) throw new Error('Sprites not loaded'); selected = scale; } },
        getScaleFactor: () => 2, createCamera() {}, initFont() {}, initFPS() {},
        context: {}, background: {}, foreground: {}, upscaledRendering: true
    };
    assert.doesNotThrow(() => rendererMethods.rescale.call(renderer, 2)); assert.equal(selected, undefined);
    renderer.game.spritesets = [{}]; rendererMethods.rescale.call(renderer, 2); assert.equal(selected, 2);
});
