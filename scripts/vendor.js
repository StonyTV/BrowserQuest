const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
for (const [source, destination] of [
    ['requirejs/require.js', 'require.js'],
    ['jquery/dist/jquery.min.js', 'jquery.min.js'],
    ['underscore/underscore-umd-min.js', 'underscore.min.js']
]) fs.copyFileSync(path.join(root, 'node_modules', source), path.join(root, 'client/js/lib', destination));
