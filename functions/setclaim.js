// setclaim.js
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

// Initialize using your downloaded service account credential
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uid = "UXXmUojGbtWyFJE4RdC9yDFj0Iv1"; // Replace with your actual UID

admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log("SUCCESS: Admin custom claims written to new account!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("ERROR setting claims:", error);
    process.exit(1);
  });