const fs = require('node:fs');
const {MongoProfileStore} = require('../server/js/storage/mongo');
const {createItem} = require('../server/js/profiles');

async function main() {
    const database=process.env.MONGODB_DATABASE || 'bq_qa_ai';
    if (!database.startsWith('bq_qa_')) throw new Error('Use an isolated bq_qa_ database');
    const store=await new MongoProfileStore(process.env.MONGODB_URI,database).connect();
    try {
        const fixture={};
        for (const [key,name] of [['hero','ExplorateurQA'],['observer','GuetteurQA']]) {
            const session=await store.open('',name);
            const armor=createItem(26,95);armor.slot=2;
            session.profile.items.push(armor);session.profile.equipped.armor=armor.id;
            await store.save(session);fixture[key]=session.token;
        }
        fs.mkdirSync('output',{recursive:true});
        fs.writeFileSync('output/browser-combat-run.js',fs.readFileSync('scripts/browser-combat.js','utf8').replace('QA_FIXTURE',JSON.stringify(fixture)));
        console.log('Combat fixtures prepared in '+database);
    } finally {await store.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
