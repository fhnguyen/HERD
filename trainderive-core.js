/* ════════════════════════════════════════════════════════════════════════
   TRAINDERIVE CORE — program parser + scoring engine
   Pure JavaScript, zero dependencies. The same file runs in:
     • the web app            <script src="trainderive-core.js"></script>  → window.TD
     • Google Apps Script     paste as a .gs file                          → TD (global)
     • Node (tests/tools)     const TD = require('./trainderive-core.js')
   Keep ONE copy of this file so the sheet is always interpreted identically.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════
  // CONFIG — program-wide defaults (change here, re-publish)
  // ══════════════════════════════════════════════════════════════════════
  const DEFAULTS = {
    leaderboardRanked:   'on',   // sections with a ranked score type and no [LB] tag
    leaderboardUnranked: 'on',   // check / emoji / text sections (including untagged ones) with no [LB] tag
    untaggedType:        'text', // sections with no [SCORE] tag keep the classic free-text results box
    loadUnit:            'lb',   // default unit for load when the tag doesn't say
  };

  // ══════════════════════════════════════════════════════════════════════
  // SCORE TYPES  (union of Strivee + SugarWOD)
  //   input  → which input widget the app shows
  //   sort   → default leaderboard order ('asc' = lower is better)
  //   calc   → default multi-set calculation
  // ══════════════════════════════════════════════════════════════════════
  const TYPES = {
    time:   { label: 'Time',          input: 'time',    unit: '',     sort: 'asc',  calc: 'sum', ranked: true },
    rr:     { label: 'Rounds + Reps', input: 'rr',      unit: '',     sort: 'desc', calc: 'sum', ranked: true },
    reps:   { label: 'Reps',          input: 'integer', unit: 'reps', sort: 'desc', calc: 'sum', ranked: true },
    load:   { label: 'Load',          input: 'decimal', unit: 'lb',   sort: 'desc', calc: 'max', ranked: true },
    cals:   { label: 'Calories',      input: 'integer', unit: 'cal',  sort: 'desc', calc: 'sum', ranked: true },
    meters: { label: 'Meters',        input: 'decimal', unit: 'm',    sort: 'desc', calc: 'sum', ranked: true },
    feet:   { label: 'Feet',          input: 'decimal', unit: 'ft',   sort: 'desc', calc: 'max', ranked: true },
    inches: { label: 'Inches',        input: 'decimal', unit: 'in',   sort: 'desc', calc: 'max', ranked: true },
    cm:     { label: 'Centimeters',   input: 'decimal', unit: 'cm',   sort: 'desc', calc: 'max', ranked: true },
    points: { label: 'Points',        input: 'integer', unit: 'pts',  sort: 'desc', calc: 'sum', ranked: true },
    watts:  { label: 'Watts',         input: 'integer', unit: 'W',    sort: 'desc', calc: 'max', ranked: true },
    rpm:    { label: 'RPM',           input: 'integer', unit: 'rpm',  sort: 'desc', calc: 'avg', ranked: true },
    bpm:    { label: 'BPM',           input: 'integer', unit: 'bpm',  sort: 'desc', calc: 'avg', ranked: true },
    spm:    { label: 'SPM',           input: 'integer', unit: 'spm',  sort: 'desc', calc: 'avg', ranked: true },
    check:  { label: 'Done',          input: 'check',   unit: '',     ranked: false },
    emoji:  { label: 'Rating (1–5)',  input: 'rating',  unit: '',     ranked: false },
    text:   { label: 'Notes',         input: 'text',    unit: '',     ranked: false },
    none:   { label: 'Unscored',      input: 'none',    unit: '',     ranked: false },
  };

  const TYPE_ALIASES = {
    'for time': 'time', fortime: 'time',
    'rounds+reps': 'rr', 'rounds + reps': 'rr', 'rounds & reps': 'rr', 'r+r': 'rr', amrap: 'rr',
    rep: 'reps',
    weight: 'load', lift: 'load',
    calories: 'cals', calorie: 'cals', cal: 'cals',
    meter: 'meters', m: 'meters', distance: 'meters',
    foot: 'feet', ft: 'feet',
    inch: 'inches', in: 'inches',
    centimeters: 'cm', centimeter: 'cm',
    point: 'points', pts: 'points',
    watt: 'watts', w: 'watts',
    checkbox: 'check', done: 'check', complete: 'check', validation: 'check',
    rating: 'emoji', feedback: 'emoji',
    notes: 'text', note: 'text',
    unscored: 'none',
  };

  const CALCS = ['max', 'min', 'sum', 'avg', 'first', 'last'];
  const CALC_ALIASES = { total: 'sum', average: 'avg', mean: 'avg', highest: 'max', lowest: 'min' };
  const SORT_ALIASES = { asc: 'asc', ascending: 'asc', lower: 'asc', low: 'asc',
                         desc: 'desc', descending: 'desc', higher: 'desc', high: 'desc' };
  const LB_ALIASES = { on: 'on', yes: 'on', show: 'on', true: 'on', public: 'on',
                       off: 'off', no: 'off', hide: 'off', false: 'off',
                       coach: 'coach', coaches: 'coach', private: 'coach' };
  const FILLER = { is: 1, better: 1, of: 1, 'time-cap': 0, '@': 1, at: 1 };

  const KG_PER_LB = 0.45359237;
  const CAP_TIER  = 1e7; // finishers rank above anyone who hit the cap

  // ══════════════════════════════════════════════════════════════════════
  // SMALL UTILS
  // ══════════════════════════════════════════════════════════════════════
  function toAlpha(i) {
    let s = ''; i = i + 1;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  const round = (x, dp) => { const f = Math.pow(10, dp); return Math.round(x * f) / f; };
  const trimNum = x => String(round(x, 2)).replace(/\.0+$/, '');
  const isBlank = v => v === null || v === undefined || String(v).trim() === '';

  function resolveType(str) {
    const k = String(str || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (TYPES[k]) return k;
    if (TYPE_ALIASES[k]) return TYPE_ALIASES[k];
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // TIME
  // ══════════════════════════════════════════════════════════════════════
  // Accepts "12:34", "1:02:03", "12:34.5", 754 (seconds), "754"
  function parseTime(input) {
    if (isBlank(input)) return null;
    if (typeof input === 'number') return isFinite(input) && input >= 0 ? input : null;
    const s = String(input).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    const m = s.match(/^(?:(\d+):)?(\d+):(\d{1,2}(?:\.\d+)?)$/);
    if (!m) return null;
    const h = m[1] ? +m[1] : 0, mi = +m[2], se = parseFloat(m[3]);
    if (se >= 60 || (m[1] && mi >= 60)) return null;
    return h * 3600 + mi * 60 + se;
  }

  function formatTime(sec) {
    if (sec === null || sec === undefined || !isFinite(sec)) return '';
    const neg = sec < 0; sec = Math.abs(sec);
    const whole = Math.floor(sec), frac = round(sec - whole, 2);
    const h = Math.floor(whole / 3600), m = Math.floor((whole % 3600) / 60), s = whole % 60;
    const ss = String(s).padStart(2, '0') + (frac ? String(frac).slice(1) : '');
    return (neg ? '-' : '') + (h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss);
  }

  // ══════════════════════════════════════════════════════════════════════
  // [SCORE: ...] SPEC PARSER
  // ══════════════════════════════════════════════════════════════════════
  // Canonical:  [SCORE: load, 5 sets, max]
  // Tolerant:   [SCORE: load 5x3 best kg]   [SCORE: for time, cap 12 rr]
  function parseScoreSpec(input) {
    const warnings = [];
    const raw = String(input || '').trim();
    if (!raw) return normalizeSpec({ type: DEFAULTS.untaggedType, implicit: true });

    const parts = raw.split(/[,|;]/).map(p => p.trim()).filter(Boolean);
    let type = null, rest = [];

    // Type = the first 1–3 words of the first part that resolve to a type
    const headWords = parts[0].split(/\s+/);
    for (let k = Math.min(3, headWords.length); k >= 1 && !type; k--) {
      const t = resolveType(headWords.slice(0, k).join(' '));
      if (t) { type = t; rest = headWords.slice(k); }
    }
    if (!type) {
      warnings.push('Unknown score type "' + parts[0] + '" — treated as Notes');
      type = 'text';
    }

    const tokens = rest.concat(parts.slice(1).join(' ').split(/\s+/)).filter(Boolean)
                       .map(t => t.toLowerCase());
    const spec = { type };

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i], next = tokens[i + 1];
      let m;
      if ((m = t.match(/^(\d+)x(\d+)$/))) { spec.sets = +m[1]; spec.repsEach = +m[2]; continue; }
      if ((m = t.match(/^(\d+)x$/)) || (m = t.match(/^x(\d+)$/))) { spec.sets = +m[1]; continue; }
      if (/^\d+(?:[-/]\d+)+$/.test(t)) { spec.reps = t.split(/[-/]/).map(Number); continue; }
      if ((m = t.match(/^@?(\d+(?:\.\d+)?(?:[-/]\d+(?:\.\d+)?)*)%$/))) { spec.pcts = m[1].split(/[-/]/).map(Number); continue; }
      if (/^\d+$/.test(t) && /^sets?$/.test(next || '')) { spec.sets = +t; i++; continue; }
      if (/^sets?$/.test(t) && /^\d+$/.test(next || '')) { spec.sets = +next; i++; continue; }
      if (CALCS.indexOf(t) >= 0 || CALC_ALIASES[t]) { spec.calc = CALC_ALIASES[t] || t; continue; }
      if (t === 'best' || t === 'worst') { spec.calcWord = t; continue; }
      if (SORT_ALIASES[t]) { spec.sort = SORT_ALIASES[t]; continue; }
      if (t === 'lb' || t === 'lbs' || t === 'kg' || t === 'kgs') { spec.unit = t.replace(/s$/, ''); continue; }
      if (t === 'cap' || t === 'tc' || t === 'timecap') {
        const cap = next && (/^\d+$/.test(next) ? +next * 60 : parseTime(next));
        if (cap) {
          spec.cap = cap; i++;
          const after = tokens[i + 1];
          if (after === 'rr' || after === 'rounds' || after === 'rounds+reps') { spec.capScore = 'rr'; i++; }
          else if (after === 'reps') { spec.capScore = 'reps'; i++; }
        } else warnings.push('"cap" needs a time, e.g. cap 12:00');
        continue;
      }
      if (FILLER[t] !== undefined) continue;
      warnings.push('Ignored "' + t + '"');
    }

    const out = normalizeSpec(spec);
    if (spec.cap && out.type !== 'time') warnings.push('cap only applies to time scores');
    if (spec.cap && out.type === 'time' && out.sets > 1) warnings.push('cap is ignored on multi-set time scores');
    if (spec.unit && out.type !== 'load') warnings.push('lb/kg only applies to load');
    if ((spec.reps || spec.pcts) && out.type !== 'load') warnings.push('rep and % schemes only apply to load');
    if (spec.reps && out.type === 'load' && !out.reps) warnings.push('rep scheme ' + spec.reps.join('-') + ' has ' + spec.reps.length + ' sets but the tag says ' + out.sets);
    if (spec.pcts && out.type === 'load' && !out.pcts) warnings.push('percentages ' + spec.pcts.join('-') + '% don\u2019t match ' + out.sets + ' sets');
    out.warnings = warnings.concat(out.warnings || []);
    return out;
  }

  // Fills defaults so a stored spec is fully self-describing.
  function normalizeSpec(spec) {
    spec = spec || {};
    const type = TYPES[spec.type] ? spec.type : 'text';
    const T = TYPES[type];
    const out = {
      type,
      ranked: !!T.ranked,
      sets: Math.max(1, Math.min(50, parseInt(spec.sets, 10) || 1)),
      sort: T.ranked ? (spec.sort === 'asc' || spec.sort === 'desc' ? spec.sort : T.sort) : null,
      calc: null,
      cap: null,
      capScore: null,
      unit: type === 'load' ? (spec.unit === 'kg' ? 'kg' : spec.unit === 'lb' ? 'lb' : DEFAULTS.loadUnit) : T.unit,
      reps: null,   // load only: reps for each set, e.g. [4, 3, 2, 1] (shown on each input, saved with each set)
      pcts: null,   // load only: percentage for each set, e.g. [75, 80, 85, 90] (display)
      implicit: !!spec.implicit,
      warnings: spec.warnings || [],
    };
    if (type === 'load') {
      let reps = Array.isArray(spec.reps) ? spec.reps.map(Number).filter(n => n > 0 && n % 1 === 0) : null;
      const explicitSets = parseInt(spec.sets, 10) > 0;
      if (reps && reps.length && !explicitSets) out.sets = Math.min(50, reps.length);
      if ((!reps || !reps.length) && spec.repsEach > 0) reps = Array(out.sets).fill(+spec.repsEach);
      out.reps = reps && reps.length === out.sets ? reps : null;
      let p = Array.isArray(spec.pcts) ? spec.pcts.map(Number).filter(n => n > 0) : null;
      if (p && p.length === 1 && out.sets > 1) p = Array(out.sets).fill(p[0]);
      out.pcts = p && p.length === out.sets ? p : null;
    }
    if (T.ranked) {
      if (spec.calcWord === 'best')  out.calc = out.sort === 'asc' ? 'min' : 'max';
      else if (spec.calcWord === 'worst') out.calc = out.sort === 'asc' ? 'max' : 'min';
      else out.calc = CALCS.indexOf(spec.calc) >= 0 ? spec.calc : T.calc;
    }
    if (type === 'time' && spec.cap && out.sets === 1) {
      out.cap = +spec.cap;
      out.capScore = spec.capScore === 'rr' ? 'rr' : 'reps';
    }
    return out;
  }

  // Spec → canonical tag text (for the coach editor to write back to the sheet)
  function formatScoreTag(spec) {
    const s = normalizeSpec(spec), T = TYPES[s.type], bits = [s.type];
    const same = a => a && a.every(x => x === a[0]);
    if (s.reps && same(s.reps)) bits.push(s.sets + 'x' + s.reps[0]);
    else if (s.reps) bits.push(s.reps.join('-'));
    else if (s.sets > 1) bits.push(s.sets + ' sets');
    if (T.ranked && s.sets > 1 && s.calc !== T.calc) bits.push(s.calc);
    if (T.ranked && s.sort !== T.sort) bits.push(s.sort);
    if (s.cap) bits.push('cap ' + formatTime(s.cap) + (s.capScore === 'rr' ? ' rr' : ''));
    if (s.type === 'load' && s.unit !== DEFAULTS.loadUnit) bits.push(s.unit);
    if (s.pcts) bits.push('@' + (same(s.pcts) ? s.pcts[0] : s.pcts.join('-')) + '%');
    return '[SCORE: ' + bits.join(', ') + ']';
  }

  // Spec → short human description for the athlete UI
  function describeSpec(spec) {
    const s = normalizeSpec(spec), T = TYPES[s.type];
    if (!T.ranked) return T.label;
    const calcWords = { max: 'highest set', min: 'lowest set', sum: 'total', avg: 'average', first: 'first set', last: 'last set' };
    const bits = [T.label];
    if (s.sets > 1) bits.push(s.sets + ' sets · ' + calcWords[s.calc]);
    if (s.cap) bits.push('cap ' + formatTime(s.cap));
    if (s.sort !== T.sort) bits.push(s.sort === 'asc' ? 'lower is better' : 'higher is better');
    return bits.join(' · ');
  }

  function parseLeaderboardMode(str) {
    const k = String(str || '').toLowerCase().trim();
    return LB_ALIASES[k] || null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // TAG LINES
  // ══════════════════════════════════════════════════════════════════════
  const TAG_RE = /\[\s*(SCORE|LB-DAY|LEADERBOARD-DAY|LB|LEADERBOARD)\s*:\s*([^\]]*)\]/gi;
  const tagName = n => { n = n.toUpperCase(); return n === 'SCORE' ? 'score' : /DAY$/.test(n) ? 'lbDay' : 'lb'; };

  // Returns [{name, value}] if the line consists ONLY of tags, else null.
  function readTagLine(line) {
    const s = String(line || '').trim();
    if (!s || s.indexOf('[') !== 0) return null;
    const tags = [];
    const leftover = s.replace(TAG_RE, (m, n, v) => { tags.push({ name: tagName(n), value: v.trim() }); return ''; });
    return tags.length && !leftover.trim() ? tags : null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // TRAINING CELL  (program syntax + scoring tags)
  //   line 1 WIP/DRAFT marker · NOTE: … · "+" between sections · "_____" AM/PM
  // ══════════════════════════════════════════════════════════════════════
  const STATUS_MARKER_RE = /^\s*\[?\s*(WIP|DRAFT|IN[ -]?PROGRESS|INCOMPLETE|TBD)\s*\]?\s*:?\s*$/i;
  const COACH_NOTE_RE = /^\s*\*(?!\*)\s?/;   // a line starting with * is a coach's note (** starts bold text instead)

  // ## hidden comments: never published. A line starting with ## is dropped; " ## ..." ends a line early.
  function stripHiddenComments(text) {
    return String(text || '').replace(/\r\n?/g, '\n').split('\n').reduce((out, line) => {
      if (/^\s*##/.test(line)) return out;
      out.push(line.replace(/\s+##.*$/, ''));
      return out;
    }, []).join('\n');
  }

  // **bold** and _italic_ markers, removed where plain text is needed (titles, exports)
  function stripInlineMarks(text) {
    return String(text || '')
      .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '$1')
      .replace(/(^|[\s(\["'])_(?=[^\s_])([^_\n]*?[^\s_]|[^\s_])_(?=$|[\s.,;:!?)\]"'])/g, '$1$2');
  }

  // Pull coach's-note lines (starting with *) out of a block of text.
  // A line that is just "*" becomes a blank line inside the notes (paragraph break).
  function splitCoachNotes(text) {
    const keep = [], notes = [];
    String(text || '').split('\n').forEach(line => {
      if (COACH_NOTE_RE.test(line)) notes.push(line.replace(COACH_NOTE_RE, '').replace(/\s+$/, ''));
      else keep.push(line);
    });
    const joined = notes.join('\n').replace(/^\n+|\n+$/g, '');
    return { text: keep.join('\n'), notes: joined || null };
  }
  const DIVIDER_RE = /^_{5,}$/;
  const SECTION_RE = /^\+\s*$/;

  function parseTrainingCell(raw) {
    raw = stripHiddenComments(raw);
    const warnings = [];
    let dayLb = null;

    // 1) Day-level tags may sit anywhere in the cell — pull them out first
    let lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n').map(line => {
      const tags = readTagLine(line);
      if (!tags || !tags.some(t => t.name === 'lbDay')) return line;
      tags.filter(t => t.name === 'lbDay').forEach(t => {
        const mode = parseLeaderboardMode(t.value);
        if (mode) dayLb = mode; else warnings.push('Unknown LB-DAY value "' + t.value + '"');
      });
      const keep = tags.filter(t => t.name !== 'lbDay');
      return keep.length ? keep.map(t => '[' + (t.name === 'score' ? 'SCORE' : 'LB') + ': ' + t.value + ']').join(' ') : null;
    }).filter(l => l !== null);

    let content = lines.join('\n').trim();

    // 2) Status marker on line 1
    let status = null;
    if (content && STATUS_MARKER_RE.test(content.split('\n')[0])) {
      status = 'wip';
      content = content.split('\n').slice(1).join('\n').trim();
    }

    // 3) NOTE: block (its * lines are the day's coach's notes)
    let dailyNote = null, dayCoachNotes = null;
    if (content && /^NOTE:/i.test(content)) {
      const ls = content.split('\n'); const note = []; let i = 0;
      while (i < ls.length) {
        const t = ls[i].trim();
        if (i === 0) { note.push(t.replace(/^NOTE:\s*/i, '')); i++; continue; }
        if (SECTION_RE.test(t) || DIVIDER_RE.test(t)) break;
        note.push(ls[i]); i++;
      }
      const split = splitCoachNotes(note.join('\n'));
      dailyNote = split.text.trim() || null;
      dayCoachNotes = split.notes;
      if (/\[\s*(SCORE|LB)\s*:/i.test(dailyNote || '')) warnings.push('A [SCORE]/[LB] tag is inside the NOTE — it will be ignored');
      content = ls.slice(i).join('\n').trim();
    }

    // 4) Blocks + sections
    const NAMES = ['AM', 'PM'];
    const blocks = []; let bIdx = 0;
    let cur = { label: NAMES[0], raw: [] }, sec = [];
    const flushSec = () => { const t = sec.join('\n').trim(); if (t) cur.raw.push(t); sec = []; };
    const flushBlock = () => { flushSec(); if (cur.raw.length) blocks.push(cur); };
    content.split('\n').forEach(line => {
      const t = line.trim();
      if (DIVIDER_RE.test(t)) { flushBlock(); bIdx++; cur = { label: NAMES[bIdx] || 'Block ' + (bIdx + 1), raw: [] }; }
      else if (SECTION_RE.test(t)) flushSec();
      else sec.push(line);
    });
    flushBlock();
    if (blocks.length === 1 && blocks[0].label === 'AM') blocks[0].label = 'Training';

    // 5) Per-section tags and coach's notes
    let position = 0;
    const sections = [];
    blocks.forEach(b => {
      b.sections = b.raw.map(raw => {
        let scoreRaw = null, lbRaw = null;
        const split = splitCoachNotes(raw);
        const body = split.text.split('\n').filter(line => {
          const tags = readTagLine(line);
          if (!tags) return true;
          tags.forEach(t => { if (t.name === 'score') scoreRaw = t.value; else if (t.name === 'lb') lbRaw = t.value; });
          return false;
        }).join('\n').trim();
        const s = {
          key: toAlpha(position), position: position++, blockLabel: b.label,
          title: stripInlineMarks((body.split('\n')[0] || '').trim()),
          text: body,
          coachNotes: split.notes,
          _scoreRaw: scoreRaw, _lbRaw: lbRaw,
        };
        sections.push(s);
        return s;
      });
      delete b.raw;
    });

    return {
      status, dailyNote, dayLb, coachNotes: dayCoachNotes,
      isRestDay: !sections.length && !dailyNote && !status && !dayCoachNotes,
      blocks, sections, warnings,
    };
  }

  // Optional "Scoring" row cell:
  //   A: [SCORE: time, cap 12:00]
  //   B: load, 5 sets             ← brackets optional when it's just a score
  //   C: [SCORE: reps] [LB: off]
  //   [LB-DAY: coach]
  function parseScoringCell(raw) {
    raw = stripHiddenComments(raw);
    const out = { bySection: {}, dayLb: null, warnings: [] };
    String(raw || '').replace(/\r\n?/g, '\n').split('\n').forEach(line => {
      const s = line.trim(); if (!s) return;
      const m = s.match(/^([A-Z]{1,3})\s*[:.)]\s*(.*)$/);
      if (m) {
        const entry = out.bySection[m[1]] = out.bySection[m[1]] || {};
        const tags = readTagLine(m[2]);
        if (tags) tags.forEach(t => {
          if (t.name === 'score') entry.scoreRaw = t.value;
          else if (t.name === 'lb') entry.lbRaw = t.value;
          else out.warnings.push('LB-DAY belongs on its own line');
        });
        else if (m[2].trim()) entry.scoreRaw = m[2].trim();
        return;
      }
      const tags = readTagLine(s);
      if (tags && tags.every(t => t.name === 'lbDay')) {
        const mode = parseLeaderboardMode(tags[tags.length - 1].value);
        if (mode) out.dayLb = mode; else out.warnings.push('Unknown LB-DAY value');
        return;
      }
      out.warnings.push('Scoring row line not understood: "' + s + '"');
    });
    return out;
  }

  // Precedence: section tag › scoring-row tag › day tag › program default
  function finalizeSections(cell, scoring) {
    scoring = scoring || { bySection: {}, dayLb: null, warnings: [] };
    const dayLb = cell.dayLb || scoring.dayLb;
    cell.sections.forEach(s => {
      const row = scoring.bySection[s.key] || {};
      const scoreRaw = s._scoreRaw !== null ? s._scoreRaw : (row.scoreRaw || null);
      const spec = parseScoreSpec(scoreRaw);
      spec.warnings.forEach(w => cell.warnings.push(s.key + ': ' + w));
      delete spec.warnings;

      let lb = null;
      const lbRaw = s._lbRaw !== null ? s._lbRaw : (row.lbRaw || null);
      if (lbRaw !== null) {
        lb = parseLeaderboardMode(lbRaw);
        if (!lb) cell.warnings.push(s.key + ': unknown LB value "' + lbRaw + '"');
      }
      if (spec.type === 'none') lb = 'off';
      else if (!lb && dayLb) lb = dayLb;
      else if (!lb) lb = spec.ranked ? DEFAULTS.leaderboardRanked : DEFAULTS.leaderboardUnranked;

      s.score = spec;
      s.leaderboard = lb;
      delete s._scoreRaw; delete s._lbRaw;
    });
    Object.keys(scoring.bySection).forEach(k => {
      if (!cell.sections.some(s => s.key === k)) cell.warnings.push('Scoring row mentions ' + k + ' but there is no section ' + k);
    });
    scoring.warnings.forEach(w => cell.warnings.push(w));
    cell.dayLb = dayLb || null;
    return cell;
  }

  // ══════════════════════════════════════════════════════════════════════
  // SHEET → DAYS
  // ══════════════════════════════════════════════════════════════════════
  const DOW_WORDS  = '(?:mon(?:day)?|mo|tue(?:s(?:day)?)?|tu|wed(?:nesday)?|we|thu(?:r(?:s(?:day)?)?)?|th|fri(?:day)?|fr|sat(?:urday)?|sa|sun(?:day)?|su)';
  const DOW_PREFIX = '(?:' + DOW_WORDS + '\\.?,?\\s+|' + DOW_WORDS + '\\.?,\\s*)?';
  const SHORT_DATE_RE = new RegExp('^' + DOW_PREFIX + '(\\d{1,2})[-/](\\d{1,2})(?:[-/](\\d{2}|\\d{4}))?$', 'i');
  const ISO_DATE_RE   = /^(\d{4})-(\d{2})-(\d{2})$/;
  const FULL_DATE_RE  = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})/i;
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const iso = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const validYMD = (y, m, d) => { const dt = new Date(y, m - 1, d); return dt.getMonth() === m - 1 && dt.getDate() === d; };

  function isDateHeader(s) {
    s = String(s || '').trim();
    if (!s) return false;
    if (FULL_DATE_RE.test(s) || ISO_DATE_RE.test(s)) return true;
    const m = s.match(SHORT_DATE_RE);
    return !!m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31;
  }

  function sheetDateToISO(s, tabHint, now) {
    s = String(s || '').trim(); now = now || new Date();
    let m;
    if ((m = s.match(FULL_DATE_RE))) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    if ((m = s.match(ISO_DATE_RE))) return validYMD(+m[1], +m[2], +m[3]) ? s : null;
    if (!(m = s.match(SHORT_DATE_RE))) return null;
    const month = +m[1], day = +m[2];
    if (m[3]) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return validYMD(y, month, day) ? iso(y, month, day) : null; }
    const yt = String(tabHint || '').match(/\b(20\d{2})\b/);
    if (yt && validYMD(+yt[1], month, day)) return iso(+yt[1], month, day);
    const dowM = s.match(/^(mo|tu|we|th|fr|sa|su)/i);
    const DOW = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
    const ty = now.getFullYear(), cands = [ty, ty - 1, ty + 1, ty - 2, ty + 2];
    if (dowM) for (const y of cands) { const d = new Date(y, month - 1, day); if (validYMD(y, month, day) && d.getDay() === DOW[dowM[1].toLowerCase()]) return iso(y, month, day); }
    let best = ty, diff = Infinity;
    for (const y of cands) { if (!validYMD(y, month, day)) continue; const dd = Math.abs(now - new Date(y, month - 1, day)); if (dd < diff) { diff = dd; best = y; } }
    return iso(best, month, day);
  }

  // rows: string[][] — from parseCSV(csv) in the browser or getDisplayValues() in Apps Script
  function parseProgramRows(rows, tabName, opts) {
    opts = opts || {};
    const days = {};
    const cell = (r, c) => String(((rows[r] || [])[c]) || '').trim();
    const labelIs = (r, re) => r >= 0 && r < rows.length && re.test(cell(r, 0));

    const dateRows = [];
    for (let i = 0; i < rows.length; i++) {
      let n = 0; (rows[i] || []).forEach(c => { if (isDateHeader(c)) n++; });
      if (n >= 2 || (n >= 1 && labelIs(i + 1, /^training$/i))) dateRows.push(i);
    }

    dateRows.forEach((d, k) => {
      const stop = k + 1 < dateRows.length ? dateRows[k + 1] : rows.length;
      let t = d + 1;
      for (let i = d + 1; i < Math.min(d + 3, stop); i++) if (labelIs(i, /^training$/i)) { t = i; break; }
      let sc = -1;
      for (let i = t + 1; i < Math.min(t + 5, stop); i++) if (labelIs(i, /^scor(e|es|ing)$/i)) { sc = i; break; }

      (rows[d] || []).forEach((_, col) => {
        const dateStr = cell(d, col);
        if (!isDateHeader(dateStr)) return;
        const day = sheetDateToISO(dateStr, tabName, opts.now);
        if (!day || (opts.from && day < opts.from) || (opts.to && day > opts.to)) return;
        const rawTraining = cell(t, col);
        if (days[day] && !days[day].isRestDay && !rawTraining) return;

        const parsed = finalizeSections(parseTrainingCell(rawTraining), sc >= 0 ? parseScoringCell(cell(sc, col)) : null);
        days[day] = Object.assign({ day, dateLabel: dateStr, tabName: tabName || '', column: col }, parsed);
      });
    });
    return days;
  }

  // CSV → rows (RFC 4180: quoted fields, doubled quotes, multi-line cells)
  function parseCSV(text) {
    const rows = []; let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inQ) { if (c === '"' && n === '"') { field += '"'; i++; } else if (c === '"') inQ = false; else field += c; }
      else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r' && n === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
      else if (c === '\n' || c === '\r') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCORING ENGINE
  // ══════════════════════════════════════════════════════════════════════
  // entry = { level: 'rx'|'scaled', sets: [ … ], unit?: 'lb'|'kg' }
  //   time   set: { time: '12:34' }  or  { capped: true, reps: 145 }  or  { capped: true, rounds: 5, reps: 12 }
  //   rr     set: { rounds: 5, reps: 12 }
  //   load   set: { value: 225, unit: 'lb', missed: false }
  //   number set: { value: 150 }
  //   check: { done: true }   emoji: { rating: 4 }   text: { text: '…' }
  //
  // returns { ok, errors, level, sets (normalized, for storage), value, rankValue, display, capped }
  //   value     → aggregate in canonical units (seconds, kg, reps, rounds*1000+reps …)
  //   rankValue → bigger is ALWAYS better; null for unranked types
  function computeScore(specIn, entry) {
    const spec = normalizeSpec(specIn);
    const T = TYPES[spec.type];
    entry = entry || {};
    const errors = [];
    const res = { ok: false, errors, type: spec.type, level: entry.level === 'scaled' ? 'scaled' : 'rx',
                  sets: [], value: null, rankValue: null, display: '', capped: false };
    const first = (entry.sets || [])[0] || {};

    if (spec.type === 'none') { errors.push('This section is not scored'); return res; }
    if (spec.type === 'check') {
      if (!first.done) { errors.push('Mark as done'); return res; }
      return Object.assign(res, { ok: true, sets: [{ done: true }], value: 1, display: '✓ Done' });
    }
    if (spec.type === 'emoji') {
      const r = parseInt(first.rating, 10);
      if (!(r >= 1 && r <= 5)) { errors.push('Pick a rating from 1 to 5'); return res; }
      return Object.assign(res, { ok: true, sets: [{ rating: r }], value: r, display: ['😞', '🙁', '😐', '🙂', '😃'][r - 1] });
    }
    if (spec.type === 'text') {
      const txt = String(first.text || '').trim();
      if (!txt) { errors.push('Enter your result'); return res; }
      return Object.assign(res, { ok: true, sets: [{ text: txt.slice(0, 4000) }], display: txt.length > 140 ? txt.slice(0, 137) + '…' : txt });
    }

    // ── Ranked types: normalize each set to a number n ──
    const rawSets = (entry.sets || []).slice(0, spec.sets);
    if ((entry.sets || []).length > spec.sets) errors.push('Only ' + spec.sets + ' set(s) allowed');
    const norm = rawSets.map((s, i) => normalizeSet(spec, s || {}, entry, i, errors));
    while (norm.length && norm[norm.length - 1].empty) norm.pop();       // trailing blanks ignored
    const usable = norm.filter(s => !s.empty && !s.missed);
    if (!usable.length) { errors.push(norm.some(s => s.missed) ? 'No successful sets' : 'Enter a score'); return res; }
    if (errors.length) return res;

    // ── Capped "for time" (single set with a cap) ──
    if (spec.type === 'time' && spec.cap) {
      const s = usable[0];
      res.sets = [s.out];
      if (s.capped) {
        res.capped = true;
        res.value = s.n;                                        // work completed
        res.rankValue = s.n;                                    // always below CAP_TIER
        res.display = 'CAP · ' + (spec.capScore === 'rr' ? s.out.rounds + ' + ' + s.out.reps : s.out.reps + ' reps');
      } else {
        if (s.n > spec.cap) { errors.push('Time is over the ' + formatTime(spec.cap) + ' cap — mark as capped'); return res; }
        res.value = s.n;
        res.rankValue = CAP_TIER + (CAP_TIER - s.n);
        res.display = formatTime(s.n);
      }
      res.ok = true;
      return res;
    }

    // ── Aggregate ──
    const ns = usable.map(s => s.n);
    let agg, pick = null;
    switch (spec.calc) {
      case 'max':   agg = Math.max.apply(null, ns); pick = usable[ns.indexOf(agg)]; break;
      case 'min':   agg = Math.min.apply(null, ns); pick = usable[ns.indexOf(agg)]; break;
      case 'first': pick = usable[0]; agg = pick.n; break;
      case 'last':  pick = usable[usable.length - 1]; agg = pick.n; break;
      case 'avg':   agg = ns.reduce((a, b) => a + b, 0) / ns.length; break;
      default:      agg = ns.reduce((a, b) => a + b, 0);
    }
    if (usable.length === 1) pick = usable[0];

    res.sets = norm.map(s => s.out);
    res.value = round(agg, 4);
    res.rankValue = round(spec.sort === 'asc' ? -agg : agg, 4);
    res.ok = true;

    if (spec.type === 'time') res.display = formatTime(round(agg, 2));
    else if (spec.type === 'rr') {
      if (spec.calc === 'sum' && usable.length > 1) {
        const R = usable.reduce((a, s) => a + s.out.rounds, 0), P = usable.reduce((a, s) => a + s.out.reps, 0);
        res.display = R + ' + ' + P;
      } else if (pick) res.display = pick.out.rounds + ' + ' + pick.out.reps;
      else res.display = Math.floor(agg / 1000) + ' + ' + trimNum(agg % 1000);
    } else if (spec.type === 'load') {
      const unit = entry.unit === 'kg' || entry.unit === 'lb' ? entry.unit : (pick && pick.out.unit) || spec.unit;
      res.display = trimNum(unit === 'kg' ? agg : agg / KG_PER_LB) + ' ' + unit;
    } else res.display = trimNum(agg) + (T.unit ? ' ' + T.unit : '');
    return res;
  }

  function normalizeSet(spec, s, entry, i, errors) {
    const label = spec.sets > 1 ? 'Set ' + (i + 1) + ': ' : '';
    const num = v => (isBlank(v) ? null : Number(v));
    const bad = msg => { errors.push(label + msg); return { empty: true, out: {} }; };

    if (spec.type === 'time') {
      if (s.capped && spec.cap) {
        const reps = num(s.reps), rounds = spec.capScore === 'rr' ? num(s.rounds) : null;
        if (reps === null && rounds === null) return bad('Enter reps completed at the cap');
        if ((reps !== null && !(reps >= 0)) || (rounds !== null && !(rounds >= 0))) return bad('Reps must be a positive number');
        const R = rounds || 0, P = reps || 0;
        return spec.capScore === 'rr'
          ? { n: R * 1000 + P, capped: true, out: { capped: true, rounds: R, reps: P } }
          : { n: P, capped: true, out: { capped: true, reps: P } };
      }
      if (isBlank(s.time)) return { empty: true, out: {} };
      const sec = parseTime(s.time);
      if (sec === null) return bad('Time must look like 12:34');
      return { n: sec, out: { seconds: sec } };
    }
    if (spec.type === 'rr') {
      if (isBlank(s.rounds) && isBlank(s.reps)) return { empty: true, out: {} };
      const R = num(s.rounds) || 0, P = num(s.reps) || 0;
      if (!(R >= 0) || !(P >= 0) || R % 1 || P % 1) return bad('Rounds and reps must be whole numbers');
      if (P >= 1000) return bad('Reps must be under 1000');
      return { n: R * 1000 + P, out: { rounds: R, reps: P } };
    }
    if (isBlank(s.value)) return { empty: true, missed: !!s.missed, out: s.missed ? { missed: true } : {} };
    const v = num(s.value);
    if (!(v >= 0)) return bad('Enter a positive number');
    if (TYPES[spec.type].input === 'integer' && v % 1) return bad('Whole numbers only');
    if (spec.type === 'load') {
      const unit = s.unit === 'kg' || s.unit === 'lb' ? s.unit : (entry.unit === 'kg' || entry.unit === 'lb' ? entry.unit : spec.unit);
      const kg = unit === 'kg' ? v : v * KG_PER_LB;
      const out = { value: v, unit, kg: round(kg, 3), lb: round(unit === 'lb' ? v : v / KG_PER_LB, 2) };
      if (spec.reps) out.reps = spec.reps[i];
      if (spec.pcts) out.pct = spec.pcts[i];
      if (s.missed) out.missed = true;
      return { n: kg, missed: !!s.missed, out };
    }
    return { n: v, out: { value: v } };
  }

  // ══════════════════════════════════════════════════════════════════════
  const TD = {
    VERSION: '1.3.0', DEFAULTS, TYPES,
    parseScoreSpec, normalizeSpec, formatScoreTag, describeSpec, parseLeaderboardMode,
    parseTrainingCell, parseScoringCell, finalizeSections, parseProgramRows, parseCSV, stripHiddenComments, stripInlineMarks,
    isDateHeader, sheetDateToISO,
    computeScore, parseTime, formatTime, toAlpha,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = TD;
  root.TD = TD;
})(typeof globalThis !== 'undefined' ? globalThis : this);
