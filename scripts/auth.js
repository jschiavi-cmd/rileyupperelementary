// /scripts/auth.js
import { app } from '/scripts/firebase-sdk.js';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';

const auth = getAuth(app);

// Memory cache
let currentUser = null;
let currentClaims = null;
let authReady = false;
let authReadyResolve = null;
const authReadyPromise = new Promise(resolve => { authReadyResolve = resolve; });

// Imitation state
let imitationState = null;

// School context cache
let _schoolCtx = null;

// Initialize auth listener
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  
  if (user) {
    try {
      const tokenResult = await user.getIdTokenResult();
      currentClaims = tokenResult.claims;
      
      // Load imitation state from localStorage
      const stored = localStorage.getItem('imitation');
      if (stored) {
        try {
          imitationState = JSON.parse(stored);
          // Dispatch event for UI banner
          window.dispatchEvent(new CustomEvent('imitation-active', { 
            detail: imitationState 
          }));
        } catch (e) {
          localStorage.removeItem('imitation');
          imitationState = null;
        }
      }
    } catch (err) {
      console.error('[Auth] Failed to get claims');
      currentClaims = null;
    }
  } else {
    currentClaims = null;
    imitationState = null;
    localStorage.removeItem('imitation');
  }
  
  authReady = true;
  if (authReadyResolve) {
    authReadyResolve();
    authReadyResolve = null;
  }
});

/**
 * Get current authenticated user
 * @returns {Object|null} Firebase user object
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Get current user's custom claims (roles)
 * @returns {Object|null} Claims object with roles array
 */
export function getClaims() {
  return currentClaims;
}

/**
 * Wait for auth to be ready
 * @returns {Promise<Object>} Resolves with user or throws if not authenticated
 */
export async function requireAuth() {
  await authReadyPromise;
  if (!currentUser) {
    throw new Error('Not authenticated');
  }
  return currentUser;
}

/**
 * Guard a route - redirect if not authenticated or lacking required roles
 * Blocks render by managing [data-app-ready] on body
 * @param {string[]} requiredRoles - Array of role strings (e.g., ['admin', 'teacher'])
 */
export async function guardRoute(requiredRoles = []) {
  // Remove ready state initially
  document.body.removeAttribute('data-app-ready');
  
  try {
    await requireAuth();
    
    // Check roles if specified
    if (requiredRoles.length > 0) {
      const userRoles = currentClaims?.roles || [];
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
      
      if (!hasRequiredRole) {
        console.warn('[Auth] User lacks required role');
        window.location.href = '/login.html';
        return;
      }
    }
    
    // Auth successful - allow render
    document.body.setAttribute('data-app-ready', 'true');
    
  } catch (err) {
    // Not authenticated - redirect to login
    window.location.href = '/login.html';
  }
}

/**
 * Start imitating another user (admin QA mode)
 * @param {string} targetUid - User ID to imitate
 * @param {string} asRole - Role to imitate as
 */
export function startImitate(targetUid, asRole) {
  if (!currentClaims?.roles?.includes('admin')) {
    console.error('[Auth] Only admins can imitate');
    return;
  }
  
  imitationState = { targetUid, asRole };
  localStorage.setItem('imitation', JSON.stringify(imitationState));
  
  // Dispatch event for UI banner
  window.dispatchEvent(new CustomEvent('imitation-active', { 
    detail: imitationState 
  }));
}

/**
 * Stop imitating
 */
export function stopImitate() {
  imitationState = null;
  localStorage.removeItem('imitation');
  
  // Dispatch event to remove banner
  window.dispatchEvent(new CustomEvent('imitation-stopped'));
}

/**
 * Get current imitation state
 * @returns {Object|null} { targetUid, asRole } or null
 */
export function getImitationState() {
  return imitationState;
}

/**
 * Get context object for audit logging
 * Includes imitation info if active
 * @returns {Object} { actedBy, asRole, asUserId }
 */
export function getAuditContext() {
  const user = getCurrentUser();
  const claims = getClaims();
  
  if (imitationState) {
    return {
      actedBy: user.uid,
      asRole: imitationState.asRole,
      asUserId: imitationState.targetUid
    };
  }
  
  return {
    actedBy: user.uid,
    asRole: claims?.roles?.[0] || 'unknown',
    asUserId: user.uid
  };
}

/**
 * Get school context for the current user
 * Returns cached context or loads from staff profile
 * @returns {Promise<Object>} { schoolId, user, claims, staff }
 */
export async function getSchoolContext() {
  if (_schoolCtx) return _schoolCtx;
  
  const user = getCurrentUser();
  if (!user) throw new Error('No user authenticated');
  
  const claims = getClaims();
  
  // First try to get schoolId from claims (if set via Cloud Function)
  let schoolId = claims?.schoolId;
  
  // If not in claims, load from staff profile
  if (!schoolId) {
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const db = getFirestore();
    
    // We need to find which school this user belongs to
    // In production, this should be in claims, but fallback to checking staff docs
    // This is a temporary fallback - proper setup should have schoolId in claims
    
    // For now, we'll check the default school
    // TODO: This should be improved with proper multi-tenant setup
    const defaultSchoolId = 'school_001';
    const staffRef = doc(db, `schools/${defaultSchoolId}/staff/${user.uid}`);
    const snap = await getDoc(staffRef);
    
    if (snap.exists()) {
      const staff = snap.data();
      schoolId = staff.schoolId || defaultSchoolId;
      
      _schoolCtx = { schoolId, user, claims, staff };
    } else {
      throw new Error('Staff record not found. Please contact your administrator.');
    }
  } else {
    // SchoolId is in claims, load staff profile
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const db = getFirestore();
    
    const staffRef = doc(db, `schools/${schoolId}/staff/${user.uid}`);
    const snap = await getDoc(staffRef);
    
    const staff = snap.exists() ? snap.data() : null;
    _schoolCtx = { schoolId, user, claims, staff };
  }
  
  return _schoolCtx;
}

/**
 * Clear school context cache (useful for testing or role switching)
 */
export function clearSchoolContext() {
  _schoolCtx = null;
}

/**
 * Sign in with email and password
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<UserCredential>}
 */
export async function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Sign out current user
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  stopImitate();
  return signOut(auth);
}