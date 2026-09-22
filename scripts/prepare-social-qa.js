// Run before PORT=8086 BQ_DATABASE=output/social-qa.sqlite npm start.
// Uses an ignored, isolated database. The main playable database is untouched.
const fs = require('node:fs');
const { ProfileStore, createItem } = require('../server/js/profiles');
fs.mkdirSync('output', {recursive:true});
const store = new ProfileStore('output/social-qa.sqlite');
const leader = store.open('', 'ChefQA'), member = store.open('', 'AmiQA');
leader.profile.gold = 100;
leader.profile.items.push(createItem(61,95));
store.save(leader);
store.close();
const fixture = {leader:leader.token, member:member.token};
const script = fs.readFileSync('scripts/browser-social.js', 'utf8')
    .replace('const fixture = null;', 'const fixture = ' + JSON.stringify(fixture) + ';')
    .replaceAll('Veilleurs QA', 'Veilleurs ' + Date.now().toString(36))
    .replaceAll('VQA', 'Q' + Date.now().toString(36).slice(-4).toUpperCase());
fs.writeFileSync('output/browser-social-run.js', script);
console.log('Isolated social QA characters prepared.');
