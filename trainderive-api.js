/* ════════════════════════════════════════════════════════════════════════
   TRAINDERIVE API — everything the web app needs from Supabase, in one place.

   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="trainderive-core.js"></script>
   <script src="trainderive-api.js"></script>
   <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>  (optional, for .xlsx)

   const sb  = supabase.createClient(SUPABASE_URL, 'sb_publishable_…');
   const api = TrainDeriveApi(sb, TD);            // works logged out: getDay / getCalendar / getSettings
   sb.auth.onAuthStateChange((_event, session) => {
     api.setUserId(session ? session.user.id : null);
     render();                                     // re-draw: show results boxes when signed in
   });

   Logged out, account-only methods return { error: { code: 'auth_required' } } — show a
   "Sign in to log results" prompt instead of an error.
   Every method returns { data, error } like supabase-js — never throws on network/DB errors.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  // Columns visitors are allowed to read (keep in sync with the anon grant in supabase-schema.sql)
  const DAY_COLUMNS = 'day, tab_name, status, daily_note, is_rest_day, day_lb, blocks, published_at';
  const AUTH_REQUIRED = Object.freeze({ code: 'auth_required', message: 'Sign in to log results and see leaderboards' });

  function TrainDeriveApi(db, TD, opts) {
    opts = opts || {};
    let userId = opts.userId || null;
    const me = () => userId;
    const wrap = async p => { try { const r = await p; return { data: r.data, error: r.error || null }; } catch (e) { return { data: null, error: e }; } };
    // Row security makes forbidden updates/deletes affect 0 rows instead of failing; report that clearly.
    const denied = async (p, message, single) => {
      const r = await wrap(p);
      if (r.error) return r;
      if (!r.data || !r.data.length) return { data: null, error: { code: 'not_allowed', message } };
      return { data: single ? r.data[0] : r.data, error: null };
    };
    // Wraps account-only methods: logged out → { error: AUTH_REQUIRED } without touching the network
    const member = fn => function () { return userId ? fn.apply(this, arguments) : Promise.resolve({ data: null, error: AUTH_REQUIRED }); };

    return {
      // ── Session ──────────────────────────────────────────────────────
      setUserId: id => { userId = id || null; },
      isSignedIn: () => !!userId,

      /** Self-serve account. With "Confirm email" on, the user must click the emailed link before signing in. */
      /** captchaToken only if CAPTCHA protection is enabled in Supabase (hCaptcha / Turnstile widget result).
       *  division (e.g. 'Male' / 'Female') is saved with the account; the app copies it to the profile on first sign-in. */
      signUp: (email, password, displayName, redirectTo, captchaToken, division) => wrap(db.auth.signUp({
        email, password,
        options: { data: { display_name: String(displayName || '').trim().slice(0, 60), division: division || null }, emailRedirectTo: redirectTo, captchaToken },
      })),
      signIn: (email, password, captchaToken) => wrap(db.auth.signInWithPassword({ email, password, options: { captchaToken } })),
      signOut: () => wrap(db.auth.signOut()),
      sendPasswordReset: (email, redirectTo) => wrap(db.auth.resetPasswordForEmail(email, { redirectTo })),
      /** Call on the page the reset email links to, after Supabase signs the user in from that link. */
      setNewPassword: password => wrap(db.auth.updateUser({ password })),

      // ── Program (public — no account needed) ─────────────────────────
      /** Full day for rendering: blocks → sections (title, text, score spec, leaderboard).
       *  data is null when there is no programming for that date — or, for visitors, when it's
       *  beyond the public window (compare with getSettings().public_days_ahead to explain which).
       *  Includes coach_notes when the viewer may see them (see coach_notes_visibility). */
      getDay: async day => {
        const [d, n] = await Promise.all([
          wrap(db.from('program_days').select(DAY_COLUMNS).eq('day', day).maybeSingle()),
          wrap(db.rpc('get_coach_notes', { p_day: day })),
        ]);
        // coach_notes: { day?, A?, B?, … } — or null when the viewer isn't allowed to see them.
        // Notes are optional: a notes error never hides the day.
        if (d.data) d.data.coach_notes = n.error ? null : (n.data || null);
        return d;
      },

      /** Light list for a calendar/week strip. */
      getCalendar: (from, to) => wrap(db.from('program_days')
        .select('day, is_rest_day, status, tab_name').gte('day', from).lte('day', to).order('day')),

      /** { public_days_ahead, timezone, coach_notes_visibility: 'everyone' | 'coaches' } */
      getSettings: () => wrap(db.from('app_settings').select('public_days_ahead, timezone, coach_notes_visibility').maybeSingle()),
      /** Coaches only (the database rejects everyone else). */
      updateSettings: member(fields => {
        const allowed = {}; ['public_days_ahead', 'timezone', 'coach_notes_visibility'].forEach(k => { if (k in fields) allowed[k] = fields[k]; });
        return wrap(db.from('app_settings').update(allowed).eq('id', true).select('public_days_ahead, timezone, coach_notes_visibility').maybeSingle());
      }),

      /** Parser warnings for coaches ("B: Ignored 'wobble'"). */
      getWarnings: member((from, to) => wrap(db.from('program_days')
        .select('day, tab_name, warnings').gte('day', from).lte('day', to).neq('warnings', '[]').order('day'))),

      // ── My results ───────────────────────────────────────────────────
      /** My scores + feel for one day → { scores: {A: row, …}, feel } */
      getMyDay: member(async function (day) {
        const [s, f] = await Promise.all([
          wrap(db.from('scores').select('*, editor:profiles!edited_by(display_name)').eq('user_id', me()).eq('day', day)),
          wrap(db.from('day_logs').select('feel').eq('user_id', me()).eq('day', day).maybeSingle()),
        ]);
        if (s.error || f.error) return { data: null, error: s.error || f.error };
        const scores = {}; (s.data || []).forEach(r => { scores[r.section_key] = r; });
        return { data: { scores, feel: f.data ? f.data.feel : null }, error: null };
      }),

      /**
       * Validate + score + save one section.
       * section: an item from day.blocks[].sections (has key, title, score)
       * entry:   { level, sets: [...], unit?, notes? }  — see TD.computeScore for set shapes
       * opts:    { userId } — coaches only: add or edit this athlete's result instead of your own
       */
      saveScore: member(async function (day, section, entry, opts) {
        const r = TD.computeScore(section.score, entry);
        if (!r.ok) return { data: null, error: { message: r.errors.join(' · '), validation: r.errors } };
        return wrap(db.from('scores').upsert({
          user_id: (opts && opts.userId) || me(), day, section_key: section.key, section_title: section.title,
          score_type: r.type, score_spec: TD.normalizeSpec(section.score),
          level: r.level, sets: r.sets, value: r.value, rank_value: r.rankValue,
          display: r.display, is_capped: r.capped,
          notes: entry.notes ? String(entry.notes).slice(0, 2000) : null,
        }, { onConflict: 'user_id,day,section_key' }).select().single());
      }),

      deleteScore: member((day, sectionKey) => wrap(db.from('scores').delete()
        .eq('user_id', me()).eq('day', day).eq('section_key', sectionKey))),

      /** One full result by id (coaches use this to prefill the editor for someone else's result). */
      getScore: member(id => wrap(db.from('scores').select('*').eq('id', id).maybeSingle())),

      /** Delete any result you're allowed to (your own; anyone's if you're a coach). */
      deleteScoreById: member(id => denied(db.from('scores').delete().eq('id', id).select('id'), 'Only coaches can delete other people’s results')),

      setFeel: member((day, feel) => wrap(db.from('day_logs')
        .upsert({ user_id: me(), day, feel }, { onConflict: 'user_id,day' }).select().single())),

      /** My history for a movement, e.g. every "Back Squat" I've logged (for PRs / progress charts). */
      getHistory: member((titleContains, limit) => wrap(db.from('scores')
        .select('day, section_title, score_type, level, display, value, sets')
        .eq('user_id', me()).ilike('section_title', '%' + titleContains + '%')
        .order('day', { ascending: false }).limit(limit || 100))),

      // ── Leaderboard ──────────────────────────────────────────────────
      /** Ranked rows for a section. level: 'rx' | 'scaled'. division filter re-ranks client-side. */
      getLeaderboard: member(async function (day, sectionKey, o) {
        o = o || {};
        let q = db.from('leaderboard').select('*').eq('day', day).eq('section_key', sectionKey);
        if (o.level) q = q.eq('level', o.level);
        const res = await wrap(q.order('place', { ascending: true, nullsFirst: false }).order('created_at'));
        if (res.error || !o.division) return res;
        let place = 0, prev = null, n = 0;
        res.data = res.data.filter(r => r.division === o.division).map(r => {
          n++; if (r.rank_value !== prev) { place = n; prev = r.rank_value; }
          return Object.assign({}, r, { place: r.rank_value === null ? null : place });
        });
        return res;
      }),

      // ── Social ───────────────────────────────────────────────────────
      like:   member(scoreId => wrap(db.from('likes').upsert({ score_id: scoreId, user_id: me() }, { onConflict: 'score_id,user_id', ignoreDuplicates: true }))),
      unlike: member(scoreId => wrap(db.from('likes').delete().eq('score_id', scoreId).eq('user_id', me()))),

      getComments: member(scoreId => wrap(db.from('comments')
        .select('id, body, created_at, user_id, author:profiles(display_name, avatar_url)')
        .eq('score_id', scoreId).order('created_at'))),

      addComment: member((scoreId, body) => wrap(db.from('comments')
        .insert({ score_id: scoreId, user_id: me(), body: String(body || '').trim().slice(0, 1000) }).select().single())),

      deleteComment: member(id => denied(db.from('comments').delete().eq('id', id).select('id'), 'You can’t delete that comment')),

      /** Authors can edit their own comments; coaches can edit any. */
      updateComment: member((id, body) => {
        const text = String(body || '').trim().slice(0, 1000);
        if (!text) return Promise.resolve({ data: null, error: { message: 'A comment can’t be empty' } });
        return denied(db.from('comments').update({ body: text }).eq('id', id).select(), 'You can’t edit that comment', true);
      }),

      // ── People (coaches) ─────────────────────────────────────────────
      /** [{ id, display_name, email, role, division, created_at, last_sign_in_at, score_count }] */
      listPeople: member(() => wrap(db.rpc('list_people'))),
      /** role: 'athlete' | 'coach'. The database refuses to demote the last coach. */
      setRole: member((userId, role) => wrap(db.rpc('set_person_role', { p_user: userId, p_role: role }))),
      updatePerson: member((userId, fields) => {
        const allowed = {}; ['display_name', 'division', 'unit_pref'].forEach(k => { if (k in fields) allowed[k] = fields[k]; });
        return denied(db.from('profiles').update(allowed).eq('id', userId).select(), 'Only coaches can change other people’s details', true);
      }),

      // ── Profile ──────────────────────────────────────────────────────
      getProfile: member(id => wrap(db.from('profiles').select('*').eq('id', id || me()).single())),
      updateProfile: member(fields => {
        const allowed = {}; ['display_name', 'avatar_url', 'division', 'unit_pref'].forEach(k => { if (k in fields) allowed[k] = fields[k]; });
        return wrap(db.from('profiles').update(allowed).eq('id', me()).select().single());
      }),

      // ── Export: coaches get everyone. Athletes get what they can see (own + public boards);
      //    pass { userId: api-user-id } to export only your own. ──
      exportRows: member(async function (from, to, filter) {
        filter = filter || {};
        const rows = [];
        for (let offset = 0; ; offset += 1000) {
          let q = db.from('score_export').select('*').gte('day', from).lte('day', to);
          if (filter.scoreType) q = q.eq('score_type', filter.scoreType);
          if (filter.titleContains) q = q.ilike('section_title', '%' + filter.titleContains + '%');
          if (filter.userId) q = q.eq('user_id', filter.userId);
          const r = await wrap(q.order('day').order('athlete').order('section_key').order('set_number').range(offset, offset + 999));
          if (r.error) return r;
          rows.push.apply(rows, r.data);
          if (r.data.length < 1000) break;
        }
        return { data: rows, error: null };
      }),
    };
  }

  // ── File helpers (browser) ─────────────────────────────────────────────
  const EXPORT_COLUMNS = ['day', 'athlete', 'division', 'section_key', 'section_title', 'score_type', 'level',
    'score', 'score_value', 'is_capped', 'set_number', 'set_value', 'set_unit', 'set_lb', 'set_kg',
    'set_seconds', 'set_rounds', 'set_reps', 'set_missed', 'set_text', 'notes', 'updated_at'];

  // Neutralize spreadsheet formulas in athlete-typed text
  const cellSafe = v => (typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v);

  function rowsToCsv(rows) {
    const esc = v => { v = cellSafe(v); if (v === null || v === undefined) return ''; v = String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [EXPORT_COLUMNS.join(',')].concat(rows.map(r => EXPORT_COLUMNS.map(c => esc(r[c])).join(','))).join('\r\n');
  }

  /** Two sheets: "Sets" (one row per set) and "Scores" (one row per result). Needs SheetJS (XLSX). */
  function rowsToWorkbook(XLSX, rows) {
    const clean = rows.map(r => { const o = {}; EXPORT_COLUMNS.forEach(c => { o[c] = cellSafe(r[c]); }); return o; });
    const seen = {}, scores = [];
    clean.forEach(r => { const k = r.day + '|' + r.athlete + '|' + r.section_key; if (!seen[k]) { seen[k] = 1; scores.push(r); } });
    const scoreCols = ['day', 'athlete', 'division', 'section_key', 'section_title', 'score_type', 'level', 'score', 'score_value', 'is_capped', 'notes'];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clean, { header: EXPORT_COLUMNS }), 'Sets');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scores.map(r => { const o = {}; scoreCols.forEach(c => { o[c] = r[c]; }); return o; }), { header: scoreCols }), 'Scores');
    return wb;
  }

  function downloadCsv(rows, filename) {
    const blob = new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename || 'scores.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function downloadXlsx(XLSX, rows, filename) { XLSX.writeFile(rowsToWorkbook(XLSX, rows), filename || 'scores.xlsx'); }

  const exported = { TrainDeriveApi, AUTH_REQUIRED, rowsToCsv, rowsToWorkbook, downloadCsv, downloadXlsx, EXPORT_COLUMNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  Object.assign(root, exported);
})(typeof globalThis !== 'undefined' ? globalThis : this);
