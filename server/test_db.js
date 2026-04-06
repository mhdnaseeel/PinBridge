const admin = require('firebase-admin');
const fs = require('fs');
const files = fs.readdirSync('.');
const keyFile = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
if (!keyFile) { console.log('No key found'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require('./' + keyFile)) });
const db = admin.firestore();
db.collection('pairings').orderBy('pairedAt', 'desc').limit(1).get().then(snap => {
  snap.forEach(doc => console.log(doc.id, '=>', doc.data()));
  process.exit(0);
}).catch(console.error);
