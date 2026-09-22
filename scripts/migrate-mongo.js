const path = require('node:path');
const { MongoProfileStore } = require('../server/js/storage/mongo');
const { migrateSqlite } = require('../server/js/storage/migrate-sqlite');

async function main() {
    const store = new MongoProfileStore(process.env.MONGODB_URI, process.env.MONGODB_DATABASE);
    try {
        await store.connect();
        const result = await migrateSqlite(path.resolve(process.argv[2] || 'data/characters.sqlite'), store);
        console.log('SQLite → MongoDB:', result);
    } finally { await store.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
