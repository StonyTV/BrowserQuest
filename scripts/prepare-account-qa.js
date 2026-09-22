const fs = require('node:fs');
const { MongoProfileStore } = require('../server/js/storage/mongo');
async function prepare() {
    const scenario = process.argv[2] || 'accounts';
    if (!['accounts', 'crafting'].includes(scenario)) throw new Error('Unknown browser scenario');
    const database = process.env.MONGODB_DATABASE || 'bq_qa_auth';
    if (!database.startsWith('bq_qa_')) throw new Error('Use an isolated bq_qa_ database');
    const store = await new MongoProfileStore(process.env.MONGODB_URI, database).connect();
    try {
        const session = await store.open('', 'AncienQA');
        session.profile.gold = 77; session.profile.experience = 45; await store.save(session);
        fs.mkdirSync('output', { recursive: true });
        fs.writeFileSync('output/browser-' + scenario + '-run.js', fs.readFileSync('scripts/browser-' + scenario + '.js', 'utf8')
            .replace('const fixture = null;', 'const fixture = ' + JSON.stringify({ token: session.token, id: session.profile.id }) + ';'), { mode: 0o600 });
        console.log('Account recovery fixture prepared in ' + database);
    } finally { await store.close(); }
}
prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
