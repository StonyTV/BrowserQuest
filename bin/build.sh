#!/bin/sh
# Compatibility entry point: the prototype serves client/ directly.
set -eu
cd "$(dirname "$0")/.."
npm run vendor
printf '%s\n' 'Client dependencies prepared. Start the game with npm start; no client-build directory is required.'
