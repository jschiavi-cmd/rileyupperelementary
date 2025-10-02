const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/**
 * Set custom claims for a user (admin only)
 * Call from admin.html when roles change
 */
exports.setCustomClaims = functions.https.onCall(async (data, context) => {
  // Verify caller is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated', 
      'Must be logged in to set claims'
    );
  }

  // Verify caller is admin (check existing claims or allow first admin)
  const callerClaims = context.auth.token;
  const isAdmin = callerClaims.roles?.includes('admin');
  
  // For first admin setup, allow if no existing claims
  const firstTimeSetup = !callerClaims.roles;
  
  if (!isAdmin && !firstTimeSetup) {
    throw new functions.https.HttpsError(
      'permission-denied', 
      'Only admins can set custom claims'
    );
  }

  const { uid, roles, schoolId } = data;

  // Validate input
  if (!uid || !Array.isArray(roles) || !schoolId) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'uid, roles array, and schoolId are required'
    );
  }

  try {
    // Set custom claims on the user
    await admin.auth().setCustomUserClaims(uid, { 
      roles, 
      schoolId 
    });

    // Also update staff document
    await admin.firestore()
      .doc(`schools/${schoolId}/staff/${uid}`)
      .set({
        roles,
        schoolId,
        claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    return { success: true, message: 'Claims updated successfully' };
    
  } catch (error) {
    console.error('Error setting claims:', error);
    throw new functions.https.HttpsError(
      'internal', 
      'Failed to set custom claims: ' + error.message
    );
  }
});

/**
 * Trigger: When staff document is created/updated
 * Automatically sync custom claims
 * Only runs when roles or schoolId fields change
 */
exports.syncStaffClaims = functions.firestore
  .document('schools/{schoolId}/staff/{uid}')
  .onWrite(async (change, context) => {
    const { schoolId, uid } = context.params;
    
    // If document deleted, skip
    if (!change.after.exists) {
      console.log(`Staff document deleted for ${uid}, skipping claim sync`);
      return null;
    }
    
    const newData = change.after.data();
    const oldData = change.before.exists ? change.before.data() : {};
    
    const roles = newData.roles || [];
    
    // Only sync if roles or schoolId actually changed
    const rolesChanged = JSON.stringify(oldData.roles) !== JSON.stringify(roles);
    const schoolIdChanged = oldData.schoolId !== schoolId;
    
    if (!rolesChanged && !schoolIdChanged && change.before.exists) {
      console.log(`No role/schoolId changes for ${uid}, skipping claim sync`);
      return null;
    }
    
    try {
      // Set custom claims
      await admin.auth().setCustomUserClaims(uid, {
        roles,
        schoolId
      });
      
      console.log(`Claims synced for ${uid}:`, { roles, schoolId });
      return null;
      
    } catch (error) {
      console.error(`Error syncing claims for ${uid}:`, error);
      return null;
    }
  });