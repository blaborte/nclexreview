/* ============================================================
   NCLEX Review — Shared Badges Module
   Include on every practice/exam page:
     <script src="badges.js"></script>
   Works because localStorage is shared across all pages in the
   same folder/origin — a badge earned on one page shows as
   earned on every other page automatically.

   Each page's quiz code should call, once per full completion:
     NCLEXBadges.recordCompletion('<topicKey>', pctScore);

   Topic keys in use across the site:
     ati_hw1 ... ati_hw12        (ATI Homework, one per set)
     cv_meds                     (Cardiovascular Medications)
     respiratory                 (Respiratory)
     pharm_essentials            (Pharmacology Essentials)
     fluids_electrolytes         (Fluids & Electrolytes)
     acidbase                    (Acid-Base)
     safety_infection_control    (Safety & Infection Control)
     immuno_antiinfective        (Immuno / Anti-infective)
     neurological_medications    (Neurological Medications)
     iv_blood_products           (IV & Blood Products)
     comprehensive_exam          (Comprehensive NCLEX Exam)
     vestibule                   (NCLEX Final Vestibule)

   To show badges on a page, add markup:
     <div class="badges-grid" id="badgesGrid"></div>
     <span id="badgesCount"></span>
   and call: NCLEXBadges.renderBadges('badgesGrid', 'badgesCount');

   Toasts render into a fixed-position stack automatically
   injected into the page — no markup needed for that part.
   ============================================================ */

(function(global){

  const STORAGE_KEY = 'nclex_badge_state_v1';

  // Topic keys considered "ATI homework sets" for the ATI Champion badge.
  const ATI_KEYS = ['ati_hw1','ati_hw2','ati_hw3','ati_hw4','ati_hw5','ati_hw6',
                     'ati_hw7','ati_hw8','ati_hw9','ati_hw10','ati_hw11','ati_hw12'];

  // Every non-ATI topic test on the site (used for "Well Rounded" / "Full Coverage").
  const TOPIC_KEYS = ['cv_meds','respiratory','pharm_essentials','fluids_electrolytes',
                       'acidbase','safety_infection_control','immuno_antiinfective',
                       'neurological_medications','iv_blood_products'];

  const BADGES = [
    // --- Milestones (site-wide, count any completed test/set) ---
    { id:'first_steps', icon:'🎯', name:'First Steps', tier:'milestone',
      desc:'Complete any practice test or homework set in full.',
      check: s => s.completedSetIds.length >= 1 },
    { id:'on_a_roll', icon:'🔥', name:'On a Roll', tier:'milestone',
      desc:'Complete 3 different tests or homework sets.',
      check: s => s.completedSetIds.length >= 3 },
    { id:'halfway_there', icon:'🏅', name:'Halfway There', tier:'milestone',
      desc:'Complete 10 different tests or homework sets.',
      check: s => s.completedSetIds.length >= 10 },
    { id:'nclex_legend', icon:'👑', name:'NCLEX Legend', tier:'milestone',
      desc:'Complete 20 different tests or homework sets across the site.',
      check: s => s.completedSetIds.length >= 20 },

    // --- Score-based (site-wide) ---
    { id:'perfect_score', icon:'💯', name:'Perfect Score', tier:'score',
      desc:'Score 100% on any test or homework set.',
      check: s => s.perfectSetIds.length >= 1 },
    { id:'double_perfect', icon:'🌟', name:'Double Perfect', tier:'score',
      desc:'Score 100% on two different tests or sets.',
      check: s => s.perfectSetIds.length >= 2 },
    { id:'top_of_class', icon:'🏆', name:'Top of the Class', tier:'score',
      desc:'Score 100% on five different tests or sets.',
      check: s => s.perfectSetIds.length >= 5 },
    { id:'comeback_kid', icon:'📈', name:'Comeback Kid', tier:'score',
      desc:'Improve your score on a retake of the same test.',
      check: s => !!s.comebackAchieved },

    // --- Habit / behavior ---
    { id:'night_owl', icon:'🌙', name:'Night Owl', tier:'habit',
      desc:'Complete a test between midnight and 4am.',
      check: s => !!s.nightOwlAchieved },
    { id:'marathoner', icon:'⚡', name:'Marathoner', tier:'habit',
      desc:'Complete 3 tests or homework sets in a single day.',
      check: s => !!s.marathonerAchieved },
    { id:'streak_3', icon:'📅', name:'3-Day Streak', tier:'habit',
      desc:'Complete at least one test on 3 different days in a row.',
      check: s => (s.currentStreak || 0) >= 3 || (s.bestStreak || 0) >= 3 },
    { id:'streak_7', icon:'🗓️', name:'7-Day Streak', tier:'habit',
      desc:'Complete at least one test on 7 different days in a row.',
      check: s => (s.currentStreak || 0) >= 7 || (s.bestStreak || 0) >= 7 },

    // --- Breadth across topics ---
    { id:'well_rounded', icon:'🗺️', name:'Well Rounded', tier:'breadth',
      desc:'Complete a test from 4 different topic areas.',
      check: s => countDistinctTopics(s) >= 4 },
    { id:'full_coverage', icon:'🧭', name:'Full Coverage', tier:'breadth',
      desc:'Complete at least one test from every topic area.',
      check: s => countDistinctTopics(s) >= TOPIC_KEYS.length },

    // --- ATI-specific ---
    { id:'ati_champion', icon:'🩺', name:'ATI Champion', tier:'ati',
      desc:'Complete all 12 ATI homework sets.',
      check: s => ATI_KEYS.every(k => s.completedSetIds.includes(k)) },
    { id:'peds_pro', icon:'👶', name:'Peds Pro', tier:'ati',
      desc:'Score 100% on ATI HW-9 (pediatric nursing).',
      check: s => s.perfectSetIds.includes('ati_hw9') },
    { id:'infection_control_pro', icon:'🦠', name:'Infection Control Pro', tier:'ati',
      desc:'Score 100% on ATI HW-10 (infection control & immunology).',
      check: s => s.perfectSetIds.includes('ati_hw10') },
    { id:'bone_up', icon:'🦴', name:'Bone Up', tier:'ati',
      desc:'Score 100% on ATI HW-11 (musculoskeletal nursing).',
      check: s => s.perfectSetIds.includes('ati_hw11') },

    // --- Topic-flagship badges ---
    { id:'cardio_certified', icon:'❤️', name:'Cardio Certified', tier:'topic',
      desc:'Score 100% on the Cardiovascular Medications test.',
      check: s => s.perfectSetIds.includes('cv_meds') || s.perfectSetIds.includes('ati_hw12') },
    { id:'breathe_easy', icon:'🫁', name:'Breathe Easy', tier:'topic',
      desc:'Score 100% on the Respiratory test.',
      check: s => s.perfectSetIds.includes('respiratory') },
    { id:'pharm_prodigy', icon:'💊', name:'Pharm Prodigy', tier:'topic',
      desc:'Score 100% on the Pharmacology Essentials test.',
      check: s => s.perfectSetIds.includes('pharm_essentials') },
    { id:'fluid_genius', icon:'💧', name:'Fluid Genius', tier:'topic',
      desc:'Score 100% on the Fluids & Electrolytes test.',
      check: s => s.perfectSetIds.includes('fluids_electrolytes') },
    { id:'acidbase_ace', icon:'⚗️', name:'Acid-Base Ace', tier:'topic',
      desc:'Score 100% on the Acid-Base test.',
      check: s => s.perfectSetIds.includes('acidbase') },
    { id:'neuro_navigator', icon:'🧠', name:'Neuro Navigator', tier:'topic',
      desc:'Score 100% on the Neurological Medications test.',
      check: s => s.perfectSetIds.includes('neurological_medications') },
    { id:'blood_bank_boss', icon:'🩸', name:'Blood Bank Boss', tier:'topic',
      desc:'Score 100% on the IV & Blood Products test.',
      check: s => s.perfectSetIds.includes('iv_blood_products') },
    { id:'immuno_expert', icon:'🧬', name:'Immuno Expert', tier:'topic',
      desc:'Score 100% on the Immuno / Anti-infective test.',
      check: s => s.perfectSetIds.includes('immuno_antiinfective') },
    { id:'endocrine_expert', icon:'🦋', name:'Hormone Whisperer', tier:'topic',
      desc:'Score 100% on the Endocrine Medications test.',
      check: s => s.perfectSetIds.includes('endocrine') },

    // --- Exams ---
    { id:'comprehensive_conqueror', icon:'🎓', name:'Comprehensive Conqueror', tier:'exam',
      desc:'Complete the Comprehensive NCLEX Exam.',
      check: s => s.completedSetIds.includes('comprehensive_exam') },
    { id:'vestibule_cleared', icon:'🚪', name:'Vestibule Cleared', tier:'exam',
      desc:'Complete the NCLEX Final Vestibule Questions.',
      check: s => s.completedSetIds.includes('vestibule') },
  ];

  function countDistinctTopics(state){
    const set = new Set();
    state.completedSetIds.forEach(id=>{
      if(TOPIC_KEYS.includes(id)) set.add(id);
    });
    return set.size;
  }

  function defaultState(){
    return {
      completions: {},
      completedSetIds: [],
      perfectSetIds: [],
      unlocked: [],
      comebackAchieved: false,
      nightOwlAchieved: false,
      marathonerAchieved: false,
      dailyCompletions: {},
      lastCompletionDay: null,
      currentStreak: 0,
      bestStreak: 0
    };
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    }catch(e){
      return defaultState();
    }
  }

  function saveState(state){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  function dayKeyFor(date){ return date.toISOString().slice(0,10); }

  function updateStreak(state, now){
    const today = dayKeyFor(now);
    if(state.lastCompletionDay === today){
      // already counted today, streak unchanged
    } else {
      const yesterday = dayKeyFor(new Date(now.getTime() - 86400000));
      if(state.lastCompletionDay === yesterday){
        state.currentStreak = (state.currentStreak || 0) + 1;
      } else {
        state.currentStreak = 1;
      }
      state.lastCompletionDay = today;
      state.bestStreak = Math.max(state.bestStreak || 0, state.currentStreak);
    }
  }

  /**
   * Record a full completion of a test/homework set.
   * @param {string} key - unique topic key, e.g. 'ati_hw3', 'respiratory', 'comprehensive_exam'
   * @param {number} pct - integer percent score, 0-100
   * @returns {Array} newly unlocked badge objects (also auto-shows toasts)
   */
  function recordCompletion(key, pct){
    const state = loadState();

    if(!state.completedSetIds.includes(key)) state.completedSetIds.push(key);
    if(pct === 100 && !state.perfectSetIds.includes(key)) state.perfectSetIds.push(key);

    const prev = state.completions[key];
    if(prev && pct > prev.lastPct) state.comebackAchieved = true;
    state.completions[key] = {
      attempts: (prev ? prev.attempts : 0) + 1,
      bestPct: Math.max(pct, prev ? prev.bestPct : 0),
      lastPct: pct
    };

    const now = new Date();
    if(now.getHours() < 4) state.nightOwlAchieved = true;
    const dk = dayKeyFor(now);
    state.dailyCompletions[dk] = (state.dailyCompletions[dk] || 0) + 1;
    if(state.dailyCompletions[dk] >= 3) state.marathonerAchieved = true;
    updateStreak(state, now);

    const previouslyUnlocked = new Set(state.unlocked);
    const newlyUnlocked = [];
    BADGES.forEach(b=>{
      if(!previouslyUnlocked.has(b.id) && b.check(state)){
        state.unlocked.push(b.id);
        newlyUnlocked.push(b);
      }
    });

    saveState(state);
    renderBadges();
    newlyUnlocked.forEach((b, i)=> setTimeout(()=> showToast(b), i*550));
    return newlyUnlocked;
  }

  function ensureToastStack(){
    let stack = document.getElementById('badgeToastStack');
    if(!stack){
      stack = document.createElement('div');
      stack.id = 'badgeToastStack';
      stack.className = 'badge-toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function ensureStylesInjected(){
    if(document.getElementById('nclex-badges-css')) return;
    const style = document.createElement('style');
    style.id = 'nclex-badges-css';
    style.textContent = `
      .badges-section{margin:8px 0 30px;}
      .badges-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap;}
      .badges-head h2{font-family:'Fraunces',serif;font-weight:600;font-size:19px;margin:0;}
      .badges-count{font-family:'JetBrains Mono',monospace;font-size:12px;color:#7C8B94;}
      .badges-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
      .badge-chip{position:relative;background:#fff;border:1px solid #DCE6E4;border-radius:12px;padding:14px 12px;text-align:center;cursor:default;transition:transform .18s ease, box-shadow .18s ease;}
      .badge-chip:hover{transform:translateY(-2px);box-shadow:0 10px 22px -10px rgba(18,40,61,.25);}
      .badge-chip .badge-icon{font-size:26px;line-height:1;margin-bottom:8px;}
      .badge-chip.locked{opacity:.42;}
      .badge-chip.locked .badge-icon{filter:grayscale(1);}
      .badge-chip .badge-name{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;letter-spacing:.02em;}
      .badge-chip .badge-desc{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%) translateY(4px);width:190px;background:#12283D;color:#fff;font-size:11.5px;line-height:1.4;padding:9px 11px;border-radius:9px;opacity:0;pointer-events:none;transition:opacity .16s ease, transform .16s ease;z-index:20;box-shadow:0 10px 24px -8px rgba(18,40,61,.4);}
      .badge-chip .badge-desc::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:6px solid transparent;border-top-color:#12283D;}
      .badge-chip:hover .badge-desc{opacity:1;transform:translateX(-50%) translateY(0);}
      .badge-toast-stack{position:fixed;top:18px;right:18px;z-index:999;display:flex;flex-direction:column;gap:10px;align-items:flex-end;}
      .badge-toast{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #DCE6E4;border-radius:14px;padding:12px 16px;box-shadow:0 16px 34px -10px rgba(18,40,61,.35);min-width:230px;max-width:300px;animation:badgeIn .45s cubic-bezier(.22,.9,.32,1.15) forwards, badgeOut .5s ease forwards 3.6s;}
      .badge-toast .bt-icon{font-size:28px;line-height:1;flex-shrink:0;}
      .badge-toast .bt-text{display:flex;flex-direction:column;gap:1px;}
      .badge-toast .bt-label{font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#f4826b;}
      .badge-toast .bt-name{font-family:'Fraunces',serif;font-weight:600;font-size:15px;}
      @keyframes badgeIn{from{opacity:0;transform:translateX(24px) scale(.96);}to{opacity:1;transform:translateX(0) scale(1);}}
      @keyframes badgeOut{from{opacity:1;}to{opacity:0;transform:translateX(24px);}}
    `;
    document.head.appendChild(style);
  }

  function showToast(badge){
    ensureStylesInjected();
    const stack = ensureToastStack();
    const toast = document.createElement('div');
    toast.className = 'badge-toast';
    const icon = document.createElement('div');
    icon.className = 'bt-icon';
    icon.textContent = badge.icon;
    const text = document.createElement('div');
    text.className = 'bt-text';
    const label = document.createElement('div');
    label.className = 'bt-label';
    label.textContent = 'Badge unlocked';
    const name = document.createElement('div');
    name.className = 'bt-name';
    name.textContent = badge.name;
    text.appendChild(label);
    text.appendChild(name);
    toast.appendChild(icon);
    toast.appendChild(text);
    stack.appendChild(toast);
    setTimeout(()=> toast.remove(), 4100);
  }

  /**
   * Render the badge grid + count into the given element ids.
   * Safe to call even if those ids don't exist on the page.
   */
  function renderBadges(gridId, countId){
    gridId = gridId || 'badgesGrid';
    countId = countId || 'badgesCount';
    ensureStylesInjected();
    const grid = document.getElementById(gridId);
    const countEl = document.getElementById(countId);
    const state = loadState();
    const unlockedSet = new Set(state.unlocked);
    if(grid){
      grid.innerHTML = '';
      BADGES.forEach(b=>{
        const isUnlocked = unlockedSet.has(b.id);
        const chip = document.createElement('div');
        chip.className = 'badge-chip' + (isUnlocked ? '' : ' locked');
        const icon = document.createElement('div');
        icon.className = 'badge-icon';
        icon.textContent = b.icon;
        const name = document.createElement('div');
        name.className = 'badge-name';
        name.textContent = b.name;
        const desc = document.createElement('div');
        desc.className = 'badge-desc';
        desc.textContent = isUnlocked ? b.desc : '🔒 ' + b.desc;
        chip.appendChild(icon);
        chip.appendChild(name);
        chip.appendChild(desc);
        grid.appendChild(chip);
      });
    }
    if(countEl) countEl.textContent = state.unlocked.length + ' / ' + BADGES.length + ' earned';
  }

  function getState(){ return loadState(); }
  function getBadges(){ return BADGES.slice(); }

  global.NCLEXBadges = {
    recordCompletion,
    renderBadges,
    getState,
    getBadges,
    STORAGE_KEY
  };

  document.addEventListener('DOMContentLoaded', function(){
    renderBadges();
  });

})(window);
