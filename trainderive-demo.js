/* ════════════════════════════════════════════════════════════════════════
   TRAINDERIVE DEMO BACKEND
   An in-memory stand-in for trainderive-api.js with the same method names and
   return shapes. The app uses it automatically when CONFIG.SUPABASE_URL is blank,
   so you can click through every screen before Supabase is connected.
   Sample programming is parsed with the real TD parser, tags and all.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  function TrainDeriveDemo(TD) {
    const ok = data => Promise.resolve({ data, error: null });
    const fail = (message, code) => Promise.resolve({ data: null, error: { message, code } });  // eslint-disable-line
    const AUTH = { code: 'auth_required', message: 'Sign in to log results and see leaderboards' };
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
    const today = iso(new Date());
    let seed = 20261107;
    const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const between = (a, b) => Math.round(a + rand() * (b - a));
    let nextId = 1; const uid = p => p + (nextId++);

    // ── Sample week (Mon → Sun), repeated for last, this and next week ──
    const WEEK = [
      'NOTE: New cycle starts today. Leave a rep in the tank on the squats.\n* Coaches: set up squat racks in pairs before the 6am class.\n+\nBack Squat\n5x3 at 75–80%\nRest 2:00 between sets\n* Brace before every rep and keep the bar over midfoot.\n* If depth or bar speed breaks down, drop 10 lb.\n[SCORE: load, 5 sets]\n+\n"Cindy"\n20-minute AMRAP\n5 pull-ups\n10 push-ups\n15 air squats\n[SCORE: rr]\n+\nAccessory\n3 rounds: 10 dumbbell rows each arm, 15 hollow rocks\nWrite down the weight you used',
      'Double-under practice\n10 minutes, singles to doubles\n[SCORE: check]\n+\n21-15-9 for time\nThrusters (95/65 lb)\nChest-to-bar pull-ups\n10-minute cap\n[SCORE: time, cap 10:00]\n+\nCool-down\nEasy bike 10 minutes, then pigeon stretch\n[SCORE: none]',
      'Deadlift\nBuild to a heavy single for the day\n[SCORE: load]\n[LB: off]\n_____\nRow\n2,000 m for time\nNegative split: second 1,000 faster than the first\n[SCORE: time]',
      'NOTE: Partner up for the finisher. Scale the burpees before you scale the pace.\n* Stagger heats so every athlete gets a judge for Fran.\n+\nPower Clean\nEvery minute for 10 minutes: 2 reps\nBuild across the minutes, finish at your heaviest clean double\nDemo: https://www.youtube.com/watch?v=VIDEO_ID_HERE&t=15\n[SCORE: load]\n+\n"Fran"\n21-15-9 for time\nThrusters (95/65 lb)\nPull-ups\n10-minute cap\n* Stimulus: fast and uncomfortable. Most athletes should finish in 4 to 8 minutes.\n* Scaling: pick a thruster load you can do 10+ unbroken when fresh.\n*\n* Movement standards: https://youtu.be/VIDEO_ID_HERE\n[SCORE: time, cap 10:00]\n+\nTabata Burpees\n8 rounds of 20 seconds on, 10 seconds off\nScore is your lowest round\nHow to pace it: https://www.youtube.com/shorts/VIDEO_ID_HERE\n[SCORE: reps, 8 sets, min]\n+\nSession feedback\nHow did today land?\n[SCORE: emoji]',
      'WIP\nFront Squat\n3x5, same weight across all sets\n[SCORE: load, 3 sets]\n+\nAssault Bike\nMax calories in 5 minutes\n[SCORE: cals]',
      'Team "Murph"\nPartner up and split reps however you like\n1-mile run\n100 pull-ups\n200 push-ups\n300 air squats\n1-mile run\nRoute map: https://example.com/murph-route\n[SCORE: time, capp 45:00]',
      '',
    ];
    const monday = (() => { const d = new Date(today + 'T12:00:00'); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return iso(d); })();
    const program = {};
    for (let w = -1; w <= 1; w++) {
      for (let i = 0; i < 7; i++) {
        const day = addDays(monday, w * 7 + i);
        const cell = TD.finalizeSections(TD.parseTrainingCell(WEEK[i]));
        const coachNotes = {}; if (cell.coachNotes) coachNotes.day = cell.coachNotes;
        cell.blocks.forEach(b => b.sections.forEach(sec => { if (sec.coachNotes) coachNotes[sec.key] = sec.coachNotes; delete sec.coachNotes; }));
        program[day] = {
          day, tab_name: 'Demo program', status: cell.status, daily_note: cell.dailyNote,
          is_rest_day: cell.isRestDay, day_lb: cell.dayLb, blocks: cell.blocks, coach_notes: coachNotes,
          published_at: new Date().toISOString(), warnings: cell.warnings,
        };
      }
    }
    const sectionOf = (day, key) => { const d = program[day]; if (!d) return null; for (const b of d.blocks) for (const s of b.sections) if (s.key === key) return s; return null; };

    // ── People ──
    const profiles = {};
    [['Maria Lopez', 'Female'], ['Jake Turner', 'Male'], ['Priya Shah', 'Female'], ['Marcus Reed', 'Male'], ['Hannah Cole', 'Female'],
     ['Diego Alvarez', 'Male'], ['Tessa Nguyen', 'Female'], ['Chris Park', 'Male'], ['Lauren Mills', 'Female']].forEach(([n, d], i) => {
      const id = 'athlete-' + i;
      profiles[id] = { id, display_name: n, division: d, role: 'athlete', unit_pref: 'lb', avatar_url: null, email: n.toLowerCase().replace(/\s+/g, '.') + '@example.com' };
    });
    profiles['coach-1'] = { id: 'coach-1', display_name: 'Coach Frank', division: null, role: 'coach', unit_pref: 'lb', avatar_url: null, email: 'coach@example.com' };
    Object.values(profiles).forEach(p => { p.created_at = new Date(Date.now() - 86400000 * 90).toISOString(); });

    const scores = [], likes = [], comments = [], feels = {};
    let settings = { public_days_ahead: null, timezone: 'America/Chicago', coach_notes_visibility: 'everyone' };
    let userId = null;
    const listeners = [];

    function storeScore(user, day, section, entry, actor) {
      const r = TD.computeScore(section.score, entry);
      if (!r.ok) return { error: { message: r.errors.join(' · '), validation: r.errors } };
      let row = scores.find(s => s.user_id === user && s.day === day && s.section_key === section.key);
      const fields = {
        user_id: user, day, section_key: section.key, section_title: section.title, score_type: r.type,
        score_spec: TD.normalizeSpec(section.score), level: r.level, sets: r.sets, value: r.value,
        rank_value: r.rankValue, display: r.display, is_capped: r.capped,
        notes: entry.notes ? String(entry.notes).slice(0, 2000) : null, updated_at: new Date().toISOString(),
        edited_by: actor && actor !== user ? actor : null,
      };
      if (row) Object.assign(row, fields);
      else { row = Object.assign({ id: uid('s'), created_at: new Date(Date.now() - between(0, 7200000)).toISOString() }, fields); scores.push(row); }
      return { data: Object.assign({}, row) };
    }

    // ── Seed results for past days and today ──
    const fakeEntry = (spec, p, title) => {
      const men = p.division === 'Male', level = rand() < 0.75 ? 'rx' : 'scaled';
      const s = TD.normalizeSpec(spec), n = s.sets;
      const t = (title || '').toLowerCase();
      switch (s.type) {
        case 'load': {
          const base = /squat/.test(t) ? (men ? between(205, 285) : between(125, 185)) : /dead/.test(t) ? (men ? between(315, 425) : between(185, 265)) : (men ? between(155, 225) : between(95, 145));
          return { level, sets: Array.from({ length: n }, (_, i) => ({ value: Math.round((base - (n - 1 - i) * 10) / 5) * 5, missed: i === n - 1 && rand() < 0.15 })) };
        }
        case 'rr': return { level, sets: [{ rounds: between(13, 22), reps: between(0, 29) }] };
        case 'reps': return { level, sets: Array.from({ length: n }, () => ({ value: between(9, 17) })) };
        case 'cals': return { level, sets: [{ value: men ? between(70, 95) : between(48, 72) }] };
        case 'check': return { level, sets: [{ done: true }] };
        case 'emoji': return { level, sets: [{ rating: between(3, 5) }] };
        case 'text': return { level, sets: [{ text: ['35 lb dumbbells, hollow rocks unbroken', 'Used 40s on the rows, broke rocks into 8/7', '30 lb DBs. Scaled hollow rocks to tuck rocks', '45s felt heavy by round 3', '50 lb rows, all unbroken'][between(0, 4)] }] };
        case 'time':
          if (s.cap && rand() < 0.2) return { level, sets: [{ capped: true, reps: between(52, 88) }] };
          if (/row/.test(t)) return { level, sets: [{ time: between(400, 540) }] };
          if (/murph/.test(t)) return { level, sets: [{ time: between(2100, 3300) }] };
          return { level, sets: [{ time: between(175, s.cap ? s.cap - 20 : 560) }] };
        default: return null;
      }
    };
    const NOTES = ['Unbroken on the first round', 'Grip gave out in round 2', 'PR 🎉', 'Felt smooth today', 'Paced it too hot early', null, null, null];
    Object.keys(program).filter(d => d <= today).forEach(day => {
      program[day].blocks.forEach(b => b.sections.forEach(sec => {
        Object.values(profiles).filter(p => p.role === 'athlete').forEach(p => {
          if (rand() > (day === today ? 0.7 : 0.85)) return;
          const e = fakeEntry(sec.score, p, sec.title);
          if (!e) return;
          e.notes = NOTES[between(0, NOTES.length - 1)];
          storeScore(p.id, day, sec, e);
        });
      }));
    });
    const todayFran = scores.filter(s => s.day === today && /fran/i.test(s.section_title));
    todayFran.forEach(s => {
      Object.keys(profiles).forEach(pid => { if (pid !== s.user_id && rand() < 0.35) likes.push({ score_id: s.id, user_id: pid }); });
    });
    if (todayFran[0]) {
      comments.push({ id: uid('c'), score_id: todayFran[0].id, user_id: 'coach-1', body: 'Great pacing on the thrusters. Try linking one more rep on the 15s next time.', created_at: new Date(Date.now() - 3600000).toISOString() });
      comments.push({ id: uid('c'), score_id: todayFran[0].id, user_id: 'athlete-3', body: 'Fast! 🔥', created_at: new Date(Date.now() - 1800000).toISOString() });
    }

    // ── Helpers mirroring database rules ──
    const me = () => userId;
    const isCoach = () => !!(userId && profiles[userId] && profiles[userId].role === 'coach');
    const NOT_ALLOWED = message => Promise.resolve({ data: null, error: { code: 'not_allowed', message } });
    const canSee = s => {
      if (s.user_id === userId || isCoach()) return true;
      const sec = sectionOf(s.day, s.section_key);
      return !!(sec && sec.leaderboard === 'on');
    };
    const dayIsPublic = day => settings.public_days_ahead === null || day <= addDays(today, settings.public_days_ahead);
    const member = fn => function () { return userId ? fn.apply(null, arguments) : Promise.resolve({ data: null, error: AUTH }); };
    const emit = event => listeners.forEach(fn => fn(event, userId ? { user: { id: userId } } : null));

    function signInAs(email, name, division) {
      const id = /coach/i.test(email) ? 'coach-1' : 'demo-' + email.toLowerCase();
      if (!profiles[id]) profiles[id] = { id, display_name: name || email.split('@')[0], division: division || null, role: 'athlete', unit_pref: 'lb', avatar_url: null, email: email.toLowerCase(), created_at: new Date().toISOString() };
      userId = id;
      emit('SIGNED_IN');
      return { user: { id, email } };
    }

    return {
      isDemo: true,
      AUTH_REQUIRED: AUTH,
      onAuthChange: fn => { listeners.push(fn); },
      setUserId: id => { userId = id || null; },
      isSignedIn: () => !!userId,

      signUp: (email, password, displayName, redirectTo, captchaToken, division) => {
        if (!/^\S+@\S+\.\S+$/.test(email || '')) return fail('Enter a valid email address');
        if (String(password || '').length < 8) return fail('Use at least 8 characters for your password');
        return ok(Object.assign(signInAs(email, displayName, division), { session: {} }));
      },
      signIn: (email, password) => {
        if (!/^\S+@\S+\.\S+$/.test(email || '') || !password) return fail('Enter your email and password');
        return ok(signInAs(email));
      },
      signOut: () => { userId = null; emit('SIGNED_OUT'); return ok(null); },
      sendPasswordReset: () => ok({}),
      setNewPassword: () => ok({}),

      getDay: day => ok(program[day] && (userId || dayIsPublic(day)) ? (() => {
        const d = Object.assign({}, program[day]); delete d.warnings;
        d.coach_notes = isCoach() || settings.coach_notes_visibility === 'everyone' ? d.coach_notes : null;
        return d;
      })() : null),
      getCalendar: (from, to) => ok(Object.values(program).filter(d => d.day >= from && d.day <= to && (userId || dayIsPublic(d.day)))
        .map(d => ({ day: d.day, is_rest_day: d.is_rest_day, status: d.status, tab_name: d.tab_name })).sort((a, b) => a.day < b.day ? -1 : 1)),
      getSettings: () => ok(Object.assign({}, settings)),
      updateSettings: member(fields => {
        if (!isCoach()) return ok(null);
        ['public_days_ahead', 'timezone', 'coach_notes_visibility'].forEach(k => { if (k in fields) settings[k] = fields[k]; });
        return ok(Object.assign({}, settings));
      }),
      getWarnings: member((from, to) => ok(Object.values(program).filter(d => d.day >= from && d.day <= to && d.warnings.length)
        .map(d => ({ day: d.day, tab_name: d.tab_name, warnings: d.warnings })).sort((a, b) => a.day < b.day ? -1 : 1))),

      getMyDay: member(day => {
        const out = {};
        scores.filter(s => s.user_id === me() && s.day === day).forEach(s => {
          out[s.section_key] = Object.assign({}, s, { editor: s.edited_by ? { display_name: (profiles[s.edited_by] || {}).display_name } : null });
        });
        return ok({ scores: out, feel: feels[me() + '|' + day] || null });
      }),
      saveScore: member((day, section, entry, opts) => {
        const real = sectionOf(day, section.key);
        if (!real || real.score.type === 'none') return fail('This section does not take scores');
        const target = (opts && opts.userId) || me();
        if (target !== me() && !isCoach()) return fail('new row violates row-level security policy for table "scores"');
        const r = storeScore(target, day, real, entry, me());
        return Promise.resolve({ data: r.data || null, error: r.error || null });
      }),
      deleteScore: member((day, key) => {
        const i = scores.findIndex(s => s.user_id === me() && s.day === day && s.section_key === key);
        if (i >= 0) scores.splice(i, 1);
        return ok(null);
      }),
      getScore: member(id => { const s = scores.find(x => x.id === id); return ok(s && canSee(s) ? Object.assign({}, s) : null); }),
      deleteScoreById: member(id => {
        const i = scores.findIndex(s => s.id === id);
        if (i < 0 || (scores[i].user_id !== me() && !isCoach())) return NOT_ALLOWED('Only coaches can delete other people’s results');
        const [gone] = scores.splice(i, 1);
        for (let j = comments.length - 1; j >= 0; j--) if (comments[j].score_id === gone.id) comments.splice(j, 1);
        for (let j = likes.length - 1; j >= 0; j--) if (likes[j].score_id === gone.id) likes.splice(j, 1);
        return ok([{ id }]);
      }),
      setFeel: member((day, feel) => { feels[me() + '|' + day] = feel; return ok({ day, feel }); }),
      getHistory: member((q, limit) => ok(scores.filter(s => s.user_id === me() && (s.section_title || '').toLowerCase().includes(String(q).toLowerCase()))
        .sort((a, b) => a.day < b.day ? 1 : -1).slice(0, limit || 100))),

      getLeaderboard: member((day, key, o) => {
        o = o || {};
        let rows = scores.filter(s => s.day === day && s.section_key === key && canSee(s) && (!o.level || s.level === o.level));
        if (o.division) rows = rows.filter(s => (profiles[s.user_id] || {}).division === o.division);
        const byLevel = {};
        rows.forEach(s => { (byLevel[s.level] = byLevel[s.level] || []).push(s); });
        const out = [];
        Object.values(byLevel).forEach(list => {
          list.sort((a, b) => (b.rank_value ?? -Infinity) - (a.rank_value ?? -Infinity));
          let place = 0, prev = null;
          list.forEach((s, i) => {
            if (s.rank_value !== prev) { place = i + 1; prev = s.rank_value; }
            const p = profiles[s.user_id] || {};
            out.push(Object.assign({}, s, {
              score_id: s.id, display_name: p.display_name, avatar_url: null, division: p.division,
              place: s.rank_value === null ? null : place,
              like_count: likes.filter(l => l.score_id === s.id).length,
              comment_count: comments.filter(c => c.score_id === s.id).length,
              liked_by_me: likes.some(l => l.score_id === s.id && l.user_id === me()),
              edited_by_name: s.edited_by ? (profiles[s.edited_by] || {}).display_name : null,
            }));
          });
        });
        out.sort((a, b) => (a.place ?? 1e9) - (b.place ?? 1e9) || (a.created_at < b.created_at ? -1 : 1));
        return ok(out);
      }),

      like: member(id => { if (!likes.some(l => l.score_id === id && l.user_id === me())) likes.push({ score_id: id, user_id: me() }); return ok(null); }),
      unlike: member(id => { const i = likes.findIndex(l => l.score_id === id && l.user_id === me()); if (i >= 0) likes.splice(i, 1); return ok(null); }),
      getComments: member(id => ok(comments.filter(c => c.score_id === id).map(c => Object.assign({}, c, { author: { display_name: (profiles[c.user_id] || {}).display_name, avatar_url: null } })))),
      addComment: member((id, body) => {
        const s = scores.find(x => x.id === id);
        if (!s || !canSee(s)) return fail('You can only comment on results you can see');
        const text = String(body || '').trim().slice(0, 1000);
        if (!text) return fail('Write a comment first');
        const c = { id: uid('c'), score_id: id, user_id: me(), body: text, created_at: new Date().toISOString() };
        comments.push(c); return ok(c);
      }),
      deleteComment: member(id => {
        const i = comments.findIndex(c => c.id === id);
        if (i < 0) return NOT_ALLOWED('You can’t delete that comment');
        const c = comments[i], s = scores.find(x => x.id === c.score_id);
        if (!(c.user_id === me() || isCoach() || (s && s.user_id === me()))) return NOT_ALLOWED('You can’t delete that comment');
        comments.splice(i, 1);
        return ok([{ id }]);
      }),
      updateComment: member((id, body) => {
        const text = String(body || '').trim().slice(0, 1000);
        if (!text) return fail('A comment can’t be empty');
        const c = comments.find(x => x.id === id);
        if (!c || !(c.user_id === me() || isCoach())) return NOT_ALLOWED('You can’t edit that comment');
        c.body = text; c.edited_at = new Date().toISOString();
        return ok(Object.assign({}, c));
      }),

      listPeople: member(() => {
        if (!isCoach()) return fail('Only coaches can see the people list');
        return ok(Object.values(profiles).map(p => ({
          id: p.id, display_name: p.display_name, email: p.email, role: p.role, division: p.division,
          created_at: p.created_at, last_sign_in_at: null, score_count: scores.filter(s => s.user_id === p.id).length,
        })).sort((a, b) => a.display_name.toLowerCase() < b.display_name.toLowerCase() ? -1 : 1));
      }),
      setRole: member((id, role) => {
        if (!isCoach()) return fail('Only coaches can change roles');
        if (['athlete', 'coach'].indexOf(role) < 0) return fail('Role must be athlete or coach');
        const p = profiles[id]; if (!p) return fail('That person was not found');
        const coaches = Object.values(profiles).filter(x => x.role === 'coach').length;
        if (p.role === 'coach' && role === 'athlete' && coaches <= 1) return fail('Make someone else a coach before changing the last coach');
        p.role = role;
        return ok(Object.assign({}, p));
      }),
      updatePerson: member((id, fields) => {
        if (!isCoach() && id !== me()) return NOT_ALLOWED('Only coaches can change other people’s details');
        const p = profiles[id]; if (!p) return NOT_ALLOWED('That person was not found');
        ['display_name', 'division', 'unit_pref'].forEach(k => { if (k in fields) p[k] = fields[k]; });
        return ok(Object.assign({}, p));
      }),

      getProfile: member(id => ok(Object.assign({}, profiles[id || me()]))),
      updateProfile: member(fields => {
        const p = profiles[me()];
        ['display_name', 'avatar_url', 'division', 'unit_pref'].forEach(k => { if (k in fields) p[k] = fields[k]; });
        return ok(Object.assign({}, p));
      }),

      exportRows: member((from, to, filter) => {
        filter = filter || {};
        const rows = [];
        scores.filter(s => s.day >= from && s.day <= to && canSee(s)
          && (!filter.scoreType || s.score_type === filter.scoreType)
          && (!filter.userId || s.user_id === filter.userId)
          && (!filter.titleContains || (s.section_title || '').toLowerCase().includes(filter.titleContains.toLowerCase())))
          .forEach(s => {
            const p = profiles[s.user_id] || {};
            (s.sets.length ? s.sets : [{}]).forEach((st, i) => rows.push({
              day: s.day, athlete: p.display_name, division: p.division, user_id: s.user_id,
              section_key: s.section_key, section_title: s.section_title, score_type: s.score_type, level: s.level,
              score: s.display, score_value: s.value, is_capped: s.is_capped, notes: s.notes, set_number: i + 1,
              set_value: st.value ?? null, set_unit: st.unit ?? null, set_lb: st.lb ?? null, set_kg: st.kg ?? null,
              set_seconds: st.seconds ?? null, set_rounds: st.rounds ?? null, set_reps: st.reps ?? null,
              set_missed: !!st.missed, set_text: st.text ?? null, created_at: s.created_at, updated_at: s.updated_at,
            }));
          });
        return ok(rows.sort((a, b) => (a.day + a.athlete + a.section_key + a.set_number) < (b.day + b.athlete + b.section_key + b.set_number) ? -1 : 1));
      }),
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = TrainDeriveDemo;
  root.TrainDeriveDemo = TrainDeriveDemo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
