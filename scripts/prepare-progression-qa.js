const fs = require('node:fs');
const {MongoProfileStore} = require('../server/js/storage/mongo');

async function prepare() {
    const database = process.env.MONGODB_DATABASE || 'bq_qa_progression';
    if (!database.startsWith('bq_qa_')) throw new Error('Use an isolated bq_qa_ database');
    const store = await new MongoProfileStore(process.env.MONGODB_URI, database).connect();
    try {
        const fixture = {};
        for (const [key,name] of [['hero','ÉclaireurQA'],['ally','CompagnonQA']]) {
            const session = await store.open('',name);
            session.profile.experience = 35; await store.save(session);
            fixture[key] = session.token;
        }
        fs.mkdirSync('output',{recursive:true});
        fs.writeFileSync('output/browser-progression-run.js',fs.readFileSync('scripts/browser-progression.js','utf8').replace('QA_FIXTURE',JSON.stringify(fixture)));
        console.log('Progression fixtures prepared in '+database);
    } finally { await store.close(); }
}
prepare().catch(error=>{console.error(error.message);process.exitCode=1;});
