// Seed only the dedicated MongoDB QA database; never the playable database.
const fs = require('node:fs');
const { MongoProfileStore } = require('../server/js/storage/mongo');
const { createItem } = require('../server/js/profiles');

async function prepare() {
    const database = process.env.MONGODB_DATABASE || 'bq_qa_social';
    if (!database.startsWith('bq_qa_')) throw new Error('QA databases must start with bq_qa_');
    fs.mkdirSync('output', {recursive:true});
    const store = new MongoProfileStore(process.env.MONGODB_URI, database);
    try {
        await store.connect();
        const leader = await store.open('', 'ChefQA'), member = await store.open('', 'AmiQA');
        leader.profile.gold = 100;
        leader.profile.items.push(createItem(61,95));
        await store.save(leader);
        const fixture = {leader:leader.token, member:member.token};
        const script = fs.readFileSync('scripts/browser-social.js', 'utf8')
            .replace('const fixture = null;', 'const fixture = ' + JSON.stringify(fixture) + ';')
            .replaceAll('Veilleurs QA', 'Veilleurs ' + Date.now().toString(36))
            .replaceAll('VQA', 'Q' + Date.now().toString(36).slice(-4).toUpperCase());
        fs.writeFileSync('output/browser-social-run.js', script);
        console.log('Isolated MongoDB social QA characters prepared in ' + database);
    } finally { await store.close(); }
}
prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
