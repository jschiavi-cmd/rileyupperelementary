// /scripts/data.js
import { app } from '/scripts/firebase-sdk.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

const db = getFirestore(app);

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Get today's date key in YYYY-MM-DD format (America/Detroit timezone)
 * @param {Date} date - Date object (defaults to now)
 * @returns {string} YYYY-MM-DD
 */
export function getTodayKey(date = new Date()) {
  const tz = 'America/Detroit';
  const fmt = new Intl.DateTimeFormat('en-CA', { 
    timeZone: tz, 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });
  const parts = fmt.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`; // YYYY-MM-DD
}

/**
 * Get week boundaries for a given date
 * @param {Date} date 
 * @returns {Object} { startISO, endISO, key }
 */
export function getWeek(date = new Date()) {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek; // Sunday of the week
  
  const sunday = new Date(d);
  sunday.setDate(diff);
  sunday.setHours(0, 0, 0, 0);
  
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  
  return {
    startISO: sunday.toISOString(),
    endISO: saturday.toISOString(),
    key: `${sunday.getFullYear()}-W${String(Math.ceil((sunday.getDate()) / 7)).padStart(2, '0')}`
  };
}

// ============================================================================
// LOADERS
// ============================================================================

/**
 * Load students for a specific teacher
 * @param {string} schoolId 
 * @param {string} teacherId 
 * @returns {Promise<Array>} Array of student documents
 */
export async function loadTeacherStudents(schoolId, teacherId) {
  const studentsRef = collection(db, 'schools', schoolId, 'students');
  const q = query(studentsRef, where('teacherId', '==', teacherId));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Load all students for a specials teacher on a specific day
 * @param {string} schoolId 
 * @param {string} dayCode - e.g., 'A', 'B', 'M', 'F'
 * @param {string} subjectId 
 * @returns {Promise<Array>} Array of students with their plans
 */
export async function loadSpecialsDay(schoolId, dayCode, subjectId) {
  // Load all students
  const studentsRef = collection(db, 'schools', schoolId, 'students');
  const studentsSnapshot = await getDocs(studentsRef);
  
  const students = [];
  
  for (const studentDoc of studentsSnapshot.docs) {
    const student = { id: studentDoc.id, ...studentDoc.data() };
    
    if (student.activePlanId) {
      // Load their active plan
      const planDoc = await getDoc(doc(db, 'schools', schoolId, 'plans', student.activePlanId));
      if (planDoc.exists()) {
        const plan = planDoc.data();
        
        // Check if this day code exists in their schedule
        const hasDayCode = plan.schedule?.some(period => 
          period.label === dayCode || period.id === dayCode
        );
        
        if (hasDayCode) {
          students.push({
            ...student,
            plan: { id: planDoc.id, ...plan }
          });
        }
      }
    }
  }
  
  return students;
}

/**
 * Load a specific plan
 * @param {string} schoolId 
 * @param {string} planId 
 * @returns {Promise<Object|null>}
 */
export async function loadPlan(schoolId, planId) {
  const planDoc = await getDoc(doc(db, 'schools', schoolId, 'plans', planId));
  if (!planDoc.exists()) return null;
  
  return {
    id: planDoc.id,
    ...planDoc.data()
  };
}

/**
 * Load day data for a specific plan
 * @param {string} schoolId 
 * @param {string} planId 
 * @param {string} dayKey - YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
export async function loadDay(schoolId, planId, dayKey) {
  const dayDoc = await getDoc(doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey));
  if (!dayDoc.exists()) return null;
  
  return dayDoc.data();
}

/**
 * Load school configuration
 * @param {string} schoolId 
 * @returns {Promise<Object|null>}
 */
export async function loadSchool(schoolId) {
  const schoolDoc = await getDoc(doc(db, 'schools', schoolId));
  if (!schoolDoc.exists()) return null;
  
  return {
    id: schoolDoc.id,
    ...schoolDoc.data()
  };
}

/**
 * Load staff member
 * @param {string} schoolId 
 * @param {string} uid 
 * @returns {Promise<Object|null>}
 */
export async function loadStaff(schoolId, uid) {
  const staffDoc = await getDoc(doc(db, 'schools', schoolId, 'staff', uid));
  if (!staffDoc.exists()) return null;
  
  return {
    id: staffDoc.id,
    ...staffDoc.data()
  };
}

/**
 * Load accommodations for a student
 * @param {string} schoolId 
 * @param {string} studentId 
 * @returns {Promise<Object|null>}
 */
export async function loadAccommodations(schoolId, studentId) {
  const accomDoc = await getDoc(doc(db, 'schools', schoolId, 'accommodations', studentId));
  if (!accomDoc.exists()) return null;
  
  return accomDoc.data();
}

// ============================================================================
// WRITERS (All include audit logging)
// ============================================================================

/**
 * Save a single matrix cell value
 * @param {string} schoolId 
 * @param {string} planId 
 * @param {string} dayKey 
 * @param {string} periodId 
 * @param {string} goalId 
 * @param {number|boolean} value 
 * @param {Object} ctx - Audit context from auth
 */
export async function saveMatrixCell(schoolId, planId, dayKey, periodId, goalId, value, ctx) {
  const dayRef = doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey);
  
  // Update the specific cell
  await setDoc(dayRef, {
    [`matrix.${periodId}.${goalId}`]: value,
    lastModified: serverTimestamp()
  }, { merge: true });
  
  // Recalculate totals
  await recalculateDayTotals(schoolId, planId, dayKey);
  
  // Audit log
  await audit(schoolId, {
    ...ctx,
    action: 'matrix_cell_update',
    target: `${planId}/${dayKey}`,
    details: { periodId, goalId, value }
  });
}

/**
 * Save a comment (teacher or specials)
 * @param {string} schoolId 
 * @param {string} planId 
 * @param {string} dayKey 
 * @param {string} role - 'teacher' or specials subject ID
 * @param {string} text 
 * @param {Object} ctx 
 */
export async function saveComment(schoolId, planId, dayKey, role, text, ctx) {
  const dayRef = doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey);
  
  if (role === 'teacher') {
    await updateDoc(dayRef, {
      'comments.teacher': text,
      lastModified: serverTimestamp()
    });
  } else {
    // Specials comment
    await updateDoc(dayRef, {
      [`comments.specials.${role}`]: text,
      lastModified: serverTimestamp()
    });
  }
  
  await audit(schoolId, {
    ...ctx,
    action: 'comment_save',
    target: `${planId}/${dayKey}`,
    details: { role, textLength: text.length }
  });
}

/**
 * Log a custom incident from a button
 * @param {string} schoolId 
 * @param {string} planId 
 * @param {string} dayKey 
 * @param {Object} button - { id, label, colorHex }
 * @param {string} note - Optional note
 * @param {string} source - 'teacher' or 'specials'
 * @param {Object} ctx 
 */
export async function logCustomIncident(schoolId, planId, dayKey, button, note, source, ctx) {
  const dayRef = doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey);
  
  const incident = {
    id: `inc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    label: button.label,
    colorHex: button.colorHex,
    note: note || null,
    ts: Date.now(),
    source
  };
  
  const dayDoc = await getDoc(dayRef);
  const currentIncidents = dayDoc.exists() ? (dayDoc.data().incidents || []) : [];
  
  await setDoc(dayRef, {
    incidents: [...currentIncidents, incident],
    lastModified: serverTimestamp()
  }, { merge: true });
  
  await audit(schoolId, {
    ...ctx,
    action: 'incident_log',
    target: `${planId}/${dayKey}`,
    details: { label: button.label, source, hasNote: !!note }
  });
}

/**
 * Recalculate day totals based on matrix data
 * @param {string} schoolId 
 * @param {string} planId 
 * @param {string} dayKey 
 */
async function recalculateDayTotals(schoolId, planId, dayKey) {
  const planDoc = await getDoc(doc(db, 'schools', schoolId, 'plans', planId));
  if (!planDoc.exists()) return;
  
  const plan = planDoc.data();
  const dayDoc = await getDoc(doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey));
  if (!dayDoc.exists()) return;
  
  const dayData = dayDoc.data();
  const matrix = dayData.matrix || {};
  
  let totalPoints = 0;
  let totalPossible = 0;
  let amPoints = 0;
  let amPossible = 0;
  let pmPoints = 0;
  let pmPossible = 0;
  
  // Calculate based on plan type
  for (const period of (plan.schedule || [])) {
    const periodData = matrix[period.id] || {};
    
    for (const goal of (plan.goals || [])) {
      const value = periodData[goal.id];
      
      if (value !== undefined && value !== null) {
        if (goal.kind === 'stepper') {
          totalPoints += Number(value);
          totalPossible += 2;
          
          if (period.am) {
            amPoints += Number(value);
            amPossible += 2;
          } else {
            pmPoints += Number(value);
            pmPossible += 2;
          }
        } else if (goal.kind === 'checkbox') {
          totalPoints += value ? 1 : 0;
          totalPossible += 1;
          
          if (period.am) {
            amPoints += value ? 1 : 0;
            amPossible += 1;
          } else {
            pmPoints += value ? 1 : 0;
            pmPossible += 1;
          }
        }
      }
    }
  }
  
  const totals = {
    pct: totalPossible > 0 ? Math.round((totalPoints / totalPossible) * 100) : 0
  };
  
  if (plan.planType.includes('AMPM')) {
    totals.amPct = amPossible > 0 ? Math.round((amPoints / amPossible) * 100) : 0;
    totals.pmPct = pmPossible > 0 ? Math.round((pmPoints / pmPossible) * 100) : 0;
  }
  
  await updateDoc(doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey), {
    totals
  });
}

/**
 * Set school theme
 * @param {string} schoolId 
 * @param {Object} theme - { mode, vars }
 */
export async function setTheme(schoolId, theme) {
  await updateDoc(doc(db, 'schools', schoolId), {
    theme
  });
}

/**
 * Audit log helper
 * @param {string} schoolId 
 * @param {Object} entry - Audit entry
 */
export async function audit(schoolId, entry) {
  await addDoc(collection(db, 'schools', schoolId, 'audit_logs'), {
    ts: serverTimestamp(),
    ...entry
  });
}

// ============================================================================
// DEMO SEEDING
// ============================================================================

/**
 * Seed demo data for testing
 * @param {string} schoolId 
 * @param {Object} options - { seed: number, specialsMode: 'AE'|'MF' }
 */
export async function seedDemo(schoolId, options = {}) {
  const { seed = 1337, specialsMode = 'AE' } = options;
  
  // Use deterministic seed for reproducible data
  const rng = seededRandom(seed);
  
  const batch = writeBatch(db);
  
  // Create demo students
  const studentNames = [
    'Emma Johnson', 'Liam Smith', 'Olivia Brown', 'Noah Davis', 'Ava Wilson',
    'Ethan Martinez', 'Sophia Anderson', 'Mason Taylor', 'Isabella Moore', 'Lucas Jackson'
  ];
  
  const grades = ['3rd', '4th', '5th'];
  const teacherIds = ['teacher_001', 'teacher_002'];
  
  const studentIds = [];
  
  for (let i = 0; i < 10; i++) {
    const studentId = `demo_student_${i + 1}`;
    studentIds.push(studentId);
    
    const studentRef = doc(db, 'schools', schoolId, 'students', studentId);
    batch.set(studentRef, {
      name: studentNames[i],
      grade: grades[Math.floor(rng() * grades.length)],
      teacherId: teacherIds[Math.floor(rng() * teacherIds.length)],
      activePlanId: `demo_plan_${i + 1}`,
      parentEmails: [`parent${i + 1}@example.com`],
      parentPortalId: `portal_${i + 1}`
    });
    
    // Create plan for student
    const schedule = specialsMode === 'AE' 
      ? [
          { id: 'A1', label: 'A', am: true },
          { id: 'A2', label: 'A', am: false },
          { id: 'B1', label: 'B', am: true },
          { id: 'B2', label: 'B', am: false },
          { id: 'C1', label: 'C', am: true },
          { id: 'C2', label: 'C', am: false },
          { id: 'D1', label: 'D', am: true },
          { id: 'D2', label: 'D', am: false },
          { id: 'E1', label: 'E', am: true },
          { id: 'E2', label: 'E', am: false }
        ]
      : [
          { id: 'M1', label: 'M', am: true },
          { id: 'M2', label: 'M', am: false },
          { id: 'T1', label: 'T', am: true },
          { id: 'T2', label: 'T', am: false },
          { id: 'W1', label: 'W', am: true },
          { id: 'W2', label: 'W', am: false },
          { id: 'TH1', label: 'TH', am: true },
          { id: 'TH2', label: 'TH', am: false },
          { id: 'F1', label: 'F', am: true },
          { id: 'F2', label: 'F', am: false }
        ];
    
    const goals = [
      { id: 'goal_1', label: 'On Task', kind: 'stepper' },
      { id: 'goal_2', label: 'Following Directions', kind: 'stepper' },
      { id: 'goal_3', label: 'Respectful', kind: 'checkbox' }
    ];
    
    const planRef = doc(db, 'schools', schoolId, 'plans', `demo_plan_${i + 1}`);
    batch.set(planRef, {
      studentId,
      teacherId: teacherIds[Math.floor(rng() * teacherIds.length)],
      active: true,
      planType: 'PercentageAMPM',
      schedule,
      goals,
      incentives: {
        thresholds: [
          { pct: 70, label: 'Bronze Star' },
          { pct: 85, label: 'Silver Star' },
          { pct: 95, label: 'Gold Star' }
        ]
      },
      customButtons: [
        { id: 'btn_1', label: 'Great Job!', colorHex: '#4CAF50' },
        { id: 'btn_2', label: 'Needs Redirect', colorHex: '#FF9800' }
      ],
      accommodations: []
    });
    
    // Create sample week of data
    const today = new Date();
    for (let dayOffset = -7; dayOffset < 0; dayOffset++) {
      const date = new Date(today);
      date.setDate(date.getDate() + dayOffset);
      const dayKey = getTodayKey(date);
      
      const matrix = {};
      for (const period of schedule) {
        matrix[period.id] = {};
        for (const goal of goals) {
          if (goal.kind === 'stepper') {
            matrix[period.id][goal.id] = Math.floor(rng() * 3); // 0, 1, or 2
          } else {
            matrix[period.id][goal.id] = rng() > 0.3; // 70% true
          }
        }
      }
      
      const dayRef = doc(db, 'schools', schoolId, 'plans', `demo_plan_${i + 1}`, 'days', dayKey);
      batch.set(dayRef, {
        matrix,
        totals: { pct: 70 + Math.floor(rng() * 25), amPct: 75, pmPct: 80 },
        comments: {
          teacher: rng() > 0.5 ? 'Great progress today!' : ''
        },
        incidents: []
      });
    }
  }
  
  await batch.commit();
  
  return { studentsCreated: studentIds.length };
}

/**
 * Seeded random number generator for reproducible demo data
 */
function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}