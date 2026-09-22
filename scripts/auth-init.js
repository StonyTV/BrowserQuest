const {randomBytes} = require('node:crypto');
const fs = require('node:fs');
fs.mkdirSync('data',{recursive:true});
const filename='data/auth.env';
if (!fs.existsSync(filename)) {
    const secret=()=>randomBytes(32).toString('hex');
    fs.writeFileSync(filename,`AUTH_DB_PASSWORD=${secret()}\nAUTH_JWT_SECRET=${secret()}\nAUTH_SESSION_KEY=${secret()}\nAUTH_URL=http://127.0.0.1:54325\n`,{mode:0o600,flag:'wx'});
    console.log('Created local auth configuration in data/auth.env (ignored by Git).');
} else console.log('Existing auth configuration preserved.');
