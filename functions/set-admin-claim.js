// This script uses the Firebase Admin SDK to set a custom claim on a user.
// This is how we bootstrap the very first admin.

const admin = require('firebase-admin');

// IMPORTANT: Make sure this path points to your downloaded service account key.
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// This is the UID of YOUR admin account (nvaceo101@gmail.com).
const uid = '3RyoM6HxiCO2W7rU3DtUWMsTsQ53';

// The custom claim we want to set.
const claims = { role: 'admin' };

// Set the custom claim on your admin user.
admin.auth().setCustomUserClaims(uid, claims)
  .then(() => {
    console.log(`Success! The 'admin' custom claim has been set for user: ${uid}`);
    console.log('You can now proceed to the next step.');
    process.exit(0);
  })
  .catch(error => {
    console.log('Error setting custom claim:', error);
    process.exit(1);
  });