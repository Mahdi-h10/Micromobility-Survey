/*
 * Static (GitHub Pages) runtime for the oTree app "survey_app" (master_survey, Iran version).
 *
 * oTree normally runs this logic on a Python server. Here the same logic runs in the browser:
 *   - page order, rounds and is_displayed rules        (page_sequence in __init__.py)
 *   - balanced block assignment and scenario shuffling   (creating_session)
 *   - scenario calculations and display formatting       (CALCULATION ENGINE, ChoiceTask.vars_for_template)
 *   - form validation with oTree's own error messages    (model fields, error_message)
 *   - export rows with the same columns as custom_export
 * Answers are kept in the browser (localStorage) until the end, then sent to a Google Sheet
 * through a Google Apps Script web app (see google-apps-script.gs). The block counter also lives there.
 */
(function () {
    'use strict';

    var CFG = window.SURVEY_CONFIG || {};
    var STATE_KEY = 'master_survey_ir_state_v1';
    var PENDING_KEY = 'master_survey_ir_pending_v1';

    // ══════════════════════════════════════════════════════════════════════
    // CONSTANTS (copied unchanged from survey_app/__init__.py)
    // ══════════════════════════════════════════════════════════════════════
    var NUM_ROUNDS = 6;
    var PT_FACTORS = {0: 0.85, 1: 1.00, 2: 1.15};
    var ST_FACTORS = {0: 0.85, 1: 1.00, 2: 1.15};
    var SF_FACTORS = {0: 0.70, 1: 1.00, 2: 1.30};
    var BASE_FARE_RATE = 3500;  // تومان/دقیقه
    var FARE_ROUND = 5000;      // گرد به نزدیک‌ترین ۵۰۰۰ تومان
    var PP_PRICES = {0: 60, 1: 80, 2: 100};      // میلیون تومان
    var PP_SUBSIDIES = {0: 40, 1: 20, 2: 0};      // میلیون تومان حمایت
    var DP_DEPOSITS = {0: 0, 1: 150, 2: 300};     // هزار تومان
    var EBIKE_SPEED_KMH = 15.0;

    var SP_TEXTS = {
        0: 'پارک امن ندارد',
        1: 'پارک قفل‌دار در مبدأ یا مقصد',
        2: 'پارک قفل‌دار در مبدأ و مقصد'
    };
    var DR_TEXTS = {
        0: '<span class="highlight-value">ایستگاه دور از مقصد</span><span class="detail-line">دوچرخه را در ایستگاه تحویل می‌دهید و تا مقصد کمی پیاده می‌روید.</span>',
        1: '<span class="highlight-value">ایستگاه نزدیک مقصد</span><span class="detail-line">دوچرخه را در ایستگاهی نزدیک مقصد تحویل می‌دهید.</span>',
        2: '<span class="highlight-value">تحویل بدون ایستگاه</span><span class="detail-line">نیازی به تحویل در ایستگاه نیست؛ دوچرخه را در نزدیک‌ترین محل مجاز به مقصد پارک می‌کنید.</span>'
    };
    var SP_TOOLTIP = 'پارک امن به معنای فضای قفل‌دار، محصور یا کنترل‌شده است؛ صرفاً پایه معمولی دوچرخه کافی نیست.';
    var PT_LEVEL_TEXTS = {0: '۱۵% کمتر از زمان پایه', 1: 'همان زمان پایه', 2: '۱۵% بیشتر از زمان پایه'};
    var ST_LEVEL_TEXTS = {0: '۱۵% کمتر از زمان پایه', 1: 'همان زمان پایه', 2: '۱۵% بیشتر از زمان پایه'};
    var PP_LEVEL_TEXTS = {0: '۶۰ میلیون تومان', 1: '۸۰ میلیون تومان', 2: '۱۰۰ میلیون تومان'};
    var PP_SUPPORT_TEXTS = {0: '۴۰ میلیون تومان حمایت', 1: '۲۰ میلیون تومان حمایت', 2: 'بدون حمایت خرید'};
    var R_LEVEL_TEXTS = {
        0: 'مسیر ویژه دوچرخه سواری ندارد',
        1: 'نیمی از مسیر دارای مسیر ویژه دوچرخه است',
        2: 'تمام طول مسیر دارای مسیر ویژه دوچرخه است'
    };
    var SF_LEVEL_TEXTS = {0: '۷۰% از کرایه پایه', 1: '۱۰۰% از کرایه پایه', 2: '۱۳۰% از کرایه پایه'};
    var DP_LEVEL_TEXTS = {0: 'صفر تومان', 1: '۱۵۰ هزار تومان', 2: '۳۰۰ هزار تومان'};

    var DESIGN = [
        ['A', 1, 0, 0, 0, 0, 2, 2, 2, 0], ['A', 2, 2, 1, 0, 0, 2, 1, 2, 2], ['A', 3, 2, 0, 2, 2, 1, 0, 1, 1],
        ['A', 4, 0, 2, 2, 1, 0, 1, 0, 1], ['A', 5, 1, 2, 1, 2, 0, 0, 0, 2], ['A', 6, 1, 1, 1, 1, 1, 2, 1, 0],
        ['B', 1, 0, 0, 1, 0, 1, 1, 1, 0], ['B', 2, 2, 1, 1, 1, 2, 0, 0, 0], ['B', 3, 1, 0, 0, 2, 1, 2, 2, 1],
        ['B', 4, 0, 2, 2, 0, 2, 0, 1, 2], ['B', 5, 1, 2, 0, 1, 0, 1, 0, 1], ['B', 6, 2, 1, 2, 2, 0, 2, 2, 2],
        ['C', 1, 2, 2, 2, 0, 1, 2, 0, 0], ['C', 2, 1, 1, 1, 0, 1, 0, 2, 1], ['C', 3, 2, 2, 1, 2, 2, 2, 0, 2],
        ['C', 4, 0, 0, 0, 1, 0, 0, 2, 0], ['C', 5, 0, 1, 0, 2, 2, 1, 1, 1], ['C', 6, 1, 0, 2, 1, 0, 1, 1, 2],
        ['D', 1, 2, 0, 0, 0, 0, 2, 1, 0], ['D', 2, 2, 0, 1, 1, 1, 1, 2, 2], ['D', 3, 1, 2, 2, 2, 2, 1, 2, 0],
        ['D', 4, 0, 2, 1, 1, 0, 2, 1, 1], ['D', 5, 0, 1, 0, 2, 1, 0, 0, 2], ['D', 6, 1, 1, 2, 0, 2, 0, 0, 1]
    ].map(function (r) {
        return {Block: r[0], Task: r[1], PT: r[2], PP: r[3], R: r[4], SP: r[5], ST: r[6], SF: r[7], DR: r[8], DP: r[9]};
    });

    // ══════════════════════════════════════════════════════════════════════
    // CALCULATION ENGINE (same arithmetic as the Python functions)
    // ══════════════════════════════════════════════════════════════════════
    function roundHalfUp(x) { return Math.floor(x + 0.5); }

    function calcPersonalTotalTime(distanceKm, ptCode) {
        var baseMovement = (distanceKm / EBIKE_SPEED_KMH) * 60;
        var baseMainTime = Math.max(1, roundHalfUp(baseMovement));
        var personalMovement = Math.max(1, roundHalfUp(baseMainTime * PT_FACTORS[ptCode]));
        return personalMovement + 2;
    }

    function calcSharedTimes(distanceKm, stCode) {
        var baseMovement = (distanceKm / EBIKE_SPEED_KMH) * 60;
        var baseMainTime = Math.max(1, roundHalfUp(baseMovement));
        var sharedMovement = Math.max(1, roundHalfUp(baseMainTime * ST_FACTORS[stCode]));
        return [sharedMovement, sharedMovement + 3, 3];
    }

    function calcProtectedKm(distanceKm, rCode) {
        if (rCode === 0) return 0;
        if (rCode === 1) return distanceKm / 2.0;
        return distanceKm;
    }

    function calcSharedFare(sharedMovementMin, sfCode) {
        var baseFare = BASE_FARE_RATE * sharedMovementMin;
        var rawFare = baseFare * SF_FACTORS[sfCode];
        return FARE_ROUND * roundHalfUp(rawFare / FARE_ROUND);
    }

    // Python f'{value:.1f}': rounds the exact binary value, ties to even.
    function pyFixed1(value) {
        var neg = value < 0;
        var s = Math.abs(value).toFixed(80);
        var dot = s.indexOf('.');
        var intPart = s.slice(0, dot), first = s.charAt(dot + 1), rest = s.slice(dot + 2);
        var digits = intPart + first;
        var roundUp = false;
        if (rest.charAt(0) > '5') roundUp = true;
        else if (rest.charAt(0) === '5') {
            roundUp = /[1-9]/.test(rest.slice(1)) || (parseInt(first, 10) % 2 === 1);
        }
        if (roundUp) {
            var arr = digits.split('');
            var i = arr.length - 1;
            while (i >= 0) {
                if (arr[i] === '9') { arr[i] = '0'; i--; } else { arr[i] = String(parseInt(arr[i], 10) + 1); break; }
            }
            if (i < 0) arr.unshift('1');
            digits = arr.join('');
        }
        return (neg ? '-' : '') + digits.slice(0, -1) + '.' + digits.slice(-1);
    }

    function formatKm(value) {
        if (value === Math.trunc(value)) return String(Math.trunc(value));
        return pyFixed1(value);
    }

    function withCommas(n) {  // Python f'{n:,}' for integers
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // ══════════════════════════════════════════════════════════════════════
    // FORM FIELDS (types, choices, min/max and blank as in the Player model)
    // ══════════════════════════════════════════════════════════════════════
    function range(a, b) { var out = []; for (var i = a; i <= b; i++) out.push(i); return out; }
    var LIKERT = range(1, 5);
    var FIELDS = {
        current_mode: {type: 'int', choices: range(1, 9)},
        current_mode_other: {type: 'str', blank: true},
        days_per_week: {type: 'int', choices: range(1, 7)},
        distance_km: {type: 'float', min: 0.1},
        main_time_min: {type: 'int', min: 1},
        access_time_min: {type: 'int', min: 0},
        current_cost_toman: {type: 'int', min: 0},
        access_car: {type: 'bool', blank: true, initial: false},
        existing_ebike: {type: 'bool', blank: true, initial: false},
        digital_access: {type: 'bool', blank: true, initial: false},
        none_available: {type: 'bool', blank: true, initial: false},
        choice: {type: 'str', choices: ['current', 'personal', 'shared']},
        q9_substitution: {type: 'int', choices: range(1, 8), blank: true},
        q10_barrier: {type: 'str', blank: true},
        q10_other: {type: 'str', blank: true},
        habit_h1: {type: 'int', choices: LIKERT},
        habit_h2: {type: 'int', choices: LIKERT},
        habit_h3: {type: 'int', choices: LIKERT},
        habit_h4: {type: 'int', choices: LIKERT},
        safety_s1: {type: 'int', choices: LIKERT},
        digital_d1: {type: 'int', choices: LIKERT},
        age: {type: 'int', min: 15, max: 110},
        gender: {type: 'int', choices: [1, 2]},
        education: {type: 'int', choices: range(1, 4)},
        income_adequacy: {type: 'int', choices: range(1, 6)},
        mobility_limitation: {type: 'int', choices: range(1, 5)}
    };

    var MSG_REQUIRED = 'This field is required.';

    // Python int()/float() accept Persian and Arabic-Indic digits, surrounding spaces and underscores.
    function normalizeDigits(s) {
        return s.replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
                .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
    }
    function pyInt(raw) {
        var s = normalizeDigits(String(raw)).trim();
        if (!/^[+-]?\d+(_\d+)*$/.test(s)) return null;
        return parseInt(s.replace(/_/g, ''), 10);
    }
    function pyFloat(raw) {
        // oTree replaces ',' with '.' before float(); 'inf'/'nan' are rejected here.
        var s = normalizeDigits(String(raw)).replace(/,/g, '.').trim();
        if (!/^[+-]?((\d+(_\d+)*)(\.(\d+(_\d+)*)?)?|\.\d+(_\d+)*)([eE][+-]?\d+(_\d+)*)?$/.test(s)) return null;
        var v = parseFloat(s.replace(/_/g, ''));
        return isFinite(v) ? v : null;
    }
    function boolFromForm(v) {
        return !(v === null || v === undefined || v === '' || v === '0' || v === 'False' || v === 'false');
    }

    function numberRangeError(f, data) {
        var min = f.min === undefined ? 0 : f.min;   // oTree: min defaults to 0 for numeric fields
        var max = f.max;
        if (data === null || isNaN(data) || (min !== null && data < min) || (max !== undefined && data > max)) {
            if (max === undefined) return 'Number must be at least ' + String(min) + '.';
            return 'Number must be between ' + String(min) + ' and ' + String(max) + '.';
        }
        return null;
    }

    // Returns {data, errors, value}; "value" is what oTree puts back into the input after an error.
    function validateField(name, raw) {
        var f = FIELDS[name];
        var has = raw.length > 0;
        var first = has ? raw[0] : undefined;
        var errors = [], data = null, value = has ? first : '';
        if (f.choices || f.type === 'bool') {
            var choices = f.type === 'bool' ? [true, false] : f.choices;
            data = f.initial === undefined ? null : f.initial;
            if (has) {
                if (f.type === 'int') {
                    data = pyInt(first);
                    if (data === null) errors.push('Invalid Choice: could not coerce');
                } else if (f.type === 'bool') {
                    data = boolFromForm(first);
                } else {
                    data = String(first);
                }
            }
            if (!f.blank && (!has || !first)) return {data: data, errors: [MSG_REQUIRED], value: value};
            if (f.blank && !has) return {data: data, errors: [], value: value};
            if (choices.indexOf(data) === -1 && errors.length === 0) errors.push('Not a valid choice');
            return {data: data, errors: errors, value: value};
        }
        if (f.type === 'int' || f.type === 'float') {
            if (has) {
                data = f.type === 'int' ? pyInt(first) : pyFloat(first);
                if (data === null) errors.push(f.type === 'int' ? 'Not a valid integer value' : 'Not a valid float value');
            }
            if (f.type === 'float') value = data === null ? '' : String(data);
            if (!f.blank && (!has || !first)) return {data: data, errors: [MSG_REQUIRED], value: value};
            if (f.blank && (!has || !first) && data === null) return {data: null, errors: errors, value: value};
            var rangeErr = numberRangeError(f, data);
            if (rangeErr) errors.push(rangeErr);
            return {data: data, errors: errors, value: value};
        }
        // plain string
        data = has ? String(first) : '';
        if (!f.blank && (!has || !first)) return {data: data, errors: [MSG_REQUIRED], value: value};
        return {data: data, errors: [], value: value};
    }

    // ══════════════════════════════════════════════════════════════════════
    // STATE
    // ══════════════════════════════════════════════════════════════════════
    function loadState() {
        try { return JSON.parse(localStorage.getItem(STATE_KEY)); } catch (e) { return null; }
    }
    function saveState(s) {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
    }
    function randomCode(n) {
        var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', out = '';
        var buf = new Uint32Array(n);
        (window.crypto || window.msCrypto).getRandomValues(buf);
        for (var i = 0; i < n; i++) out += chars[buf[i] % chars.length];
        return out;
    }
    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    function newState() {
        return {
            participant_code: randomCode(8),
            session_code: CFG.SESSION_CODE || 'ghpages',
            created_at: new Date().toISOString(),
            idx: 0,
            // creating_session: current is always first; personal/shared order is random
            column_order: Math.random() < 0.5 ? 'current-personal-shared' : 'current-shared-personal',
            dce_block: null,
            block_source: null,
            dce_tasks: null,
            vars: {},
            rounds: {},
            p6: {},
            raffle: {},
            submitted: false
        };
    }

    function assignTasks(state, block, source) {
        state.dce_block = block;
        state.block_source = source;
        state.dce_tasks = shuffle(DESIGN.filter(function (r) { return r.Block === block; }).map(function (r) {
            return Object.assign({}, r);
        }));
    }

    // ══════════════════════════════════════════════════════════════════════
    // NETWORK (Google Apps Script web app)
    // ══════════════════════════════════════════════════════════════════════
    function post(payload, timeoutMs) {
        if (!CFG.SHEET_URL) return Promise.reject(new Error('SHEET_URL is not set in config.js'));
        var ctrl = window.AbortController ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 20000) : null;
        return fetch(CFG.SHEET_URL, {
            method: 'POST',
            body: JSON.stringify(payload),   // text/plain: no CORS preflight
            redirect: 'follow',
            signal: ctrl ? ctrl.signal : undefined
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (timer) clearTimeout(timer);
            if (!res || !res.ok) throw new Error((res && res.error) || 'bad response');
            return res;
        }, function (err) { if (timer) clearTimeout(timer); throw err; });
    }

    var blockRequest = null;
    function requestBlock(state) {
        if (state.dce_block) return Promise.resolve();
        if (!blockRequest) {
            blockRequest = post({
                action: 'start',
                participant_code: state.participant_code,
                session_code: state.session_code,
                column_order: state.column_order
            }, 12000).then(function (res) {
                var s = loadState() || state;
                if (!s.dce_block && ['A', 'B', 'C', 'D'].indexOf(res.block) !== -1) {
                    assignTasks(s, res.block, 'sheet');
                    saveState(s);
                }
            }).catch(function () { blockRequest = null; });
        }
        return blockRequest;
    }
    function ensureBlock(state) {
        return requestBlock(state).then(function () {
            var s = loadState() || state;
            if (!s.dce_block) {
                // The sheet could not be reached: fall back to a random block so the participant can continue.
                assignTasks(s, ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)], 'random');
                saveState(s);
            }
            return s;
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // EXPORT ROWS (same columns and order as custom_export)
    // ══════════════════════════════════════════════════════════════════════
    var EXPORT_HEADER = [
        'session_code', 'participant_code', 'round_number',
        'dce_block', 'column_order', 'design_task_id', 'display_order',
        'choice_text', 'chosen_alt_numeric',
        'PT_code', 'PP_code', 'R_code', 'SP_code', 'ST_code', 'SF_code', 'DR_code', 'DP_code',
        'current_total_time', 'personal_total_time', 'shared_total_time',
        'personal_price_mln', 'personal_subsidy_mln', 'shared_fare_toman', 'shared_deposit_tkn', 'protected_km',
        'current_mode', 'current_mode_other', 'days_per_week', 'distance_km', 'main_time_min', 'access_time_min', 'current_cost_thousand_toman',
        'has_car_access', 'has_ebike_access', 'has_digital_access', 'none_available',
        'q9_substitution', 'q10_barrier', 'q10_other',
        'habit_h1', 'habit_h2', 'habit_h3', 'habit_h4', 'safety_s1', 'digital_d1',
        'age', 'gender', 'education', 'income_adequacy', 'mobility_limitation'
    ];

    function blankIfNull(v) { return v === null || v === undefined ? '' : v; }

    function exportRows(state) {
        var v = state.vars, p6 = state.p6, rows = [];
        var choiceMap = {current: 1, personal: 2, shared: 3};
        for (var r = 1; r <= NUM_ROUNDS; r++) {
            var p = state.rounds[r] || {};
            rows.push([
                state.session_code, state.participant_code, r,
                blankIfNull(p.dce_block), blankIfNull(p.column_order), blankIfNull(p.design_task_id), blankIfNull(p.display_order),
                blankIfNull(p.choice), p.choice in choiceMap ? choiceMap[p.choice] : '',
                blankIfNull(p.PT_code), blankIfNull(p.PP_code), blankIfNull(p.R_code), blankIfNull(p.SP_code),
                blankIfNull(p.ST_code), blankIfNull(p.SF_code), blankIfNull(p.DR_code), blankIfNull(p.DP_code),
                blankIfNull(p.current_total_time_min), blankIfNull(p.personal_total_time_min), blankIfNull(p.shared_total_time_min),
                blankIfNull(p.personal_price_million), blankIfNull(p.personal_support_million), blankIfNull(p.shared_fare_toman),
                blankIfNull(p.deposit_thousand), blankIfNull(p.protected_km),
                v.current_mode, blankIfNull(v.current_mode_other),
                v.days_per_week, v.distance_km, v.main_time_min, v.access_time_min, v.current_cost_toman,
                v.access_car ? 1 : 0, v.existing_ebike ? 1 : 0, v.digital_access ? 1 : 0, v.none_available ? 1 : 0,
                blankIfNull(p6.q9_substitution), blankIfNull(p6.q10_barrier), blankIfNull(p6.q10_other),
                blankIfNull(p6.habit_h1), blankIfNull(p6.habit_h2), blankIfNull(p6.habit_h3), blankIfNull(p6.habit_h4),
                blankIfNull(p6.safety_s1), blankIfNull(p6.digital_d1),
                blankIfNull(p6.age), blankIfNull(p6.gender), blankIfNull(p6.education),
                blankIfNull(p6.income_adequacy), blankIfNull(p6.mobility_limitation)
            ]);
        }
        return rows;
    }

    // ══════════════════════════════════════════════════════════════════════
    // PAGES (is_displayed, vars_for_template, error_message, before_next_page)
    // ══════════════════════════════════════════════════════════════════════
    var MODE_ICON_MAP = {
        1: 'fa-person-walking', 2: 'fa-bicycle', 3: 'fa-motorcycle', 4: 'fa-car', 5: 'fa-car-side',
        6: 'fa-taxi', 7: 'fa-bus', 8: 'fa-train-subway', 9: 'fa-circle-question'
    };

    var PAGES = {
        Welcome: {file: 'index.html', fields: [], rounds: [1]},

        ScreeningAndTrip: {
            file: 'trip.html', rounds: [1],
            fields: ['current_mode', 'current_mode_other', 'days_per_week', 'distance_km', 'main_time_min',
                     'access_time_min', 'current_cost_toman', 'access_car', 'existing_ebike', 'digital_access', 'none_available'],
            errorMessage: function (values) {
                var errors = {};
                if (values.days_per_week === null || values.days_per_week < 1 || values.days_per_week > 7)
                    errors.days_per_week = 'لطفاً عددی بین ۱ تا ۷ وارد کنید.';
                if (values.distance_km === null || values.distance_km <= 0)
                    errors.distance_km = 'لطفاً فاصله‌ای بزرگ‌تر از صفر وارد کنید.';
                if (values.main_time_min === null || values.main_time_min < 1)
                    errors.main_time_min = 'لطفاً زمان حرکت را وارد کنید (حداقل ۱ دقیقه).';
                if (values.access_time_min === null || values.access_time_min < 0)
                    errors.access_time_min = 'لطفاً عددی بزرگ‌تر یا مساوی صفر وارد کنید.';
                if (values.current_cost_toman === null || values.current_cost_toman < 0)
                    errors.current_cost_toman = 'لطفاً عددی بزرگ‌تر یا مساوی صفر وارد کنید.';
                if (values.current_mode === 9 && (!values.current_mode_other || values.current_mode_other.trim() === ''))
                    errors.current_mode_other = 'لطفاً روش دیگر را مشخص کنید.';
                var hasAny = values.access_car || values.existing_ebike || values.digital_access || values.none_available;
                if (!hasAny)
                    errors.none_available = 'لطفاً حداقل یک گزینه را انتخاب کنید (یا گزینه "هیچ‌کدام" را علامت بزنید).';
                if (values.none_available && (values.access_car || values.existing_ebike || values.digital_access))
                    errors.none_available = 'اگر «هیچ‌کدام» را انتخاب کرده‌اید، گزینه‌های دیگر را پاک کنید.';
                return errors;
            },
            before: function (state, values) {
                var v = state.vars;
                v.current_mode = values.current_mode;
                v.current_mode_other = values.current_mode_other || '';
                v.days_per_week = values.days_per_week;
                v.distance_km = values.distance_km;
                v.main_time_min = values.main_time_min;
                v.access_time_min = values.access_time_min;
                v.current_cost_toman = values.current_cost_toman;
                v.base_total_time_min = values.main_time_min + values.access_time_min;
                v.access_car = !!values.access_car;
                v.existing_ebike = !!values.existing_ebike;
                v.digital_access = !!values.digital_access;
                v.none_available = !!values.none_available;
            }
        },

        Instruction: {file: 'instruction.html', fields: [], rounds: [1]},

        ChoiceTask: {
            file: 'choice.html', rounds: range(1, NUM_ROUNDS),
            fields: ['choice'],
            vars: function (state, round) {
                var task = (state.dce_tasks || [])[round - 1];
                if (!task) return {error: 'سناریو یافت نشد.'};
                var p = state.vars;
                var baseTotal = p.base_total_time_min !== undefined ? p.base_total_time_min : 30;
                var distance = p.distance_km !== undefined ? p.distance_km : 10.0;
                var currentCost = p.current_cost_toman !== undefined ? p.current_cost_toman : 0;
                var currentMode = p.current_mode !== undefined ? p.current_mode : 4;
                var colOrder = state.column_order || 'current-personal-shared';

                var personalTotal = calcPersonalTotalTime(distance, task.PT);
                var shared = calcSharedTimes(distance, task.ST);
                var protectedKm = calcProtectedKm(distance, task.R);
                var sharedFare = calcSharedFare(shared[0], task.SF);
                var ppPrice = PP_PRICES[task.PP], ppSubsidy = PP_SUBSIDIES[task.PP], dpDeposit = DP_DEPOSITS[task.DP];

                // values written to the Player row when the page is shown (same as vars_for_template)
                var rec = state.rounds[round] || {};
                rec.design_task_id = task.Block + task.Task;
                rec.display_order = round;
                rec.PT_code = task.PT; rec.PP_code = task.PP; rec.R_code = task.R; rec.SP_code = task.SP;
                rec.ST_code = task.ST; rec.SF_code = task.SF; rec.DR_code = task.DR; rec.DP_code = task.DP;
                rec.current_total_time_min = baseTotal;
                rec.personal_total_time_min = personalTotal;
                rec.shared_total_time_min = shared[1];
                rec.shared_movement_min = shared[0];
                rec.protected_km = protectedKm;
                rec.personal_price_million = ppPrice;
                rec.personal_support_million = ppSubsidy;
                rec.shared_fare_toman = sharedFare;
                rec.deposit_thousand = dpDeposit;
                rec.SP_text = SP_TEXTS[task.SP];
                rec.DR_text = DR_TEXTS[task.DR];
                rec.dce_block = state.dce_block || '';
                rec.column_order = colOrder;
                state.rounds[round] = rec;

                return {
                    round_num: round,
                    total_rounds: NUM_ROUNDS,
                    progress_pct: Math.trunc(round / NUM_ROUNDS * 100),
                    design_task_id: rec.design_task_id,
                    display_order: round,
                    current_mode_icon: MODE_ICON_MAP[currentMode] || 'fa-circle-question',
                    current_total_time: baseTotal,
                    current_cost: currentCost,
                    current_cost_display: withCommas(currentCost * 1000) + ' تومان',
                    current_mode: currentMode,
                    personal_total_time: personalTotal,
                    personal_price: ppPrice,
                    personal_price_display: withCommas(ppPrice) + ' میلیون تومان',
                    personal_subsidy: ppSubsidy,
                    personal_support_display: withCommas(ppSubsidy) + ' میلیون تومان حمایت',
                    sp_text: SP_TEXTS[task.SP],
                    sp_tooltip: SP_TOOLTIP,
                    shared_total_time: shared[1],
                    shared_movement: shared[0],
                    shared_fare: sharedFare,
                    shared_fare_display: withCommas(sharedFare) + ' تومان',
                    dr_text: DR_TEXTS[task.DR],
                    dp_deposit: dpDeposit,
                    deposit_display: withCommas(dpDeposit) + ' هزار تومان',
                    personal_time_detail: PT_LEVEL_TEXTS[task.PT],
                    shared_time_detail: ST_LEVEL_TEXTS[task.ST],
                    personal_price_detail: PP_LEVEL_TEXTS[task.PP],
                    personal_support_detail: PP_SUPPORT_TEXTS[task.PP],
                    protected_route_detail: R_LEVEL_TEXTS[task.R],
                    shared_fare_detail: SF_LEVEL_TEXTS[task.SF],
                    deposit_detail: DP_LEVEL_TEXTS[task.DP],
                    protected_km: protectedKm,
                    protected_km_display: formatKm(protectedKm),
                    distance_km: distance,
                    distance_km_display: formatKm(distance),
                    col_order: colOrder,
                    col_order_list: colOrder === 'current-personal-shared' ? ['current', 'personal', 'shared'] : ['current', 'shared', 'personal'],
                    pt_code: task.PT, pp_code: task.PP, r_code: task.R, sp_code: task.SP,
                    st_code: task.ST, sf_code: task.SF, dr_code: task.DR, dp_code: task.DP
                };
            },
            errorMessage: function (values) {
                if (!values.choice) return 'لطفاً یکی از گزینه‌ها را انتخاب کنید.';
            },
            before: function (state, values, round) {
                state.rounds[round].choice = values.choice;
            }
        },

        PostChoiceQuestions: {
            file: 'post.html', rounds: [NUM_ROUNDS],
            fields: ['q9_substitution', 'q10_barrier', 'q10_other'],
            vars: function (state) {
                var any = false;
                for (var r = 1; r <= NUM_ROUNDS; r++) {
                    var c = (state.rounds[r] || {}).choice;
                    if (c === 'personal' || c === 'shared') any = true;
                }
                return {show_q9: any};
            },
            errorMessage: function (values) {
                var errors = {};
                var q10 = values.q10_barrier;
                if (q10 && q10.indexOf('9') !== -1 && (!values.q10_other || values.q10_other.trim() === ''))
                    errors.q10_other = 'لطفاً مهم‌ترین مانع دیگر را بنویسید.';
                return errors;
            },
            before: function (state, values) {
                state.p6.q9_substitution = values.q9_substitution;
                state.p6.q10_barrier = values.q10_barrier;
                state.p6.q10_other = values.q10_other;
            }
        },

        Attitudinal: {
            file: 'attitudes.html', rounds: [NUM_ROUNDS],
            fields: ['habit_h1', 'habit_h2', 'habit_h3', 'habit_h4', 'safety_s1', 'digital_d1'],
            before: function (state, values) { Object.assign(state.p6, values); }
        },

        Demographics: {
            file: 'profile.html', rounds: [NUM_ROUNDS],
            fields: ['age', 'gender', 'education', 'income_adequacy', 'mobility_limitation'],
            before: function (state, values) { Object.assign(state.p6, values); },
            // the answers are complete here: send them to the sheet before moving on
            after: function (state) {
                if (state.submitted) return Promise.resolve();
                return post({
                    action: 'submit',
                    participant_code: state.participant_code,
                    session_code: state.session_code,
                    block_source: state.block_source,
                    header: EXPORT_HEADER,
                    rows: exportRows(state)
                }, 30000).then(function () { state.submitted = true; });
            }
        },

        RafflePage: {
            file: 'raffle.html', rounds: [NUM_ROUNDS],
            fields: [],
            vars: function (state) {
                return {raffle_phone: state.raffle.raffle_phone || '', raffle_id: state.raffle.raffle_id || ''};
            },
            before: function (state, values, round, raw) {
                state.raffle.raffle_phone = ((raw.raffle_phone || [''])[0] || '').trim();
                state.raffle.raffle_id = ((raw.raffle_id || [''])[0] || '').trim();
                state.raffle.raffle_entry_submitted = true;
            },
            after: function (state) {
                if (!state.raffle.raffle_phone && !state.raffle.raffle_id) return Promise.resolve();
                return post({
                    action: 'raffle',
                    participant_code: state.participant_code,
                    session_code: state.session_code,
                    raffle_phone: state.raffle.raffle_phone,
                    raffle_id: state.raffle.raffle_id
                }, 30000);
            }
        },

        FinalPage: {file: 'final.html', fields: [], rounds: [NUM_ROUNDS]}
    };

    var SEQUENCE = ['Welcome', 'ScreeningAndTrip', 'Instruction', 'ChoiceTask', 'PostChoiceQuestions',
                    'Attitudinal', 'Demographics', 'RafflePage', 'FinalPage'];

    // oTree runs page_sequence once per round and skips pages whose is_displayed is False.
    var STEPS = [];
    for (var rnd = 1; rnd <= NUM_ROUNDS; rnd++) {
        SEQUENCE.forEach(function (name) {
            if (PAGES[name].rounds.indexOf(rnd) !== -1) STEPS.push({page: name, round: rnd});
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // TEMPLATE RENDERER (the subset of oTree template syntax used by the pages)
    // ══════════════════════════════════════════════════════════════════════
    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        .replace(/"/g, '&#34;').replace(/'/g, '&#39;');
    }

    function parseTemplate(src) {
        var re = /\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}/g, pos = 0, m;
        var root = {children: []}, stack = [root];
        function top() { return stack[stack.length - 1]; }
        function add(node) { var t = top(); (t.inElse ? t.elseChildren : t.children).push(node); }
        while ((m = re.exec(src))) {
            if (m.index > pos) add({t: 'text', v: src.slice(pos, m.index)});
            pos = re.lastIndex;
            if (m[1] !== undefined) {
                var parts = m[1].trim().split('|');
                add({t: 'var', expr: parts[0].trim(), filters: parts.slice(1).map(function (x) { return x.trim(); })});
                continue;
            }
            var tag = m[2].trim(), word = tag.split(/\s+/)[0];
            if (word === 'if') {
                var n = {t: 'if', cond: tag.slice(2).trim(), children: [], elseChildren: [], inElse: false};
                add(n); stack.push(n);
            } else if (word === 'else') {
                top().inElse = true;
            } else if (word === 'endif' || word === 'endfor') {
                stack.pop();
            } else if (word === 'for') {
                var fm = /^for\s+(.+?)\s+in\s+(.+)$/.exec(tag);
                var f = {t: 'for', targets: fm[1].split(',').map(function (x) { return x.trim(); }), iter: fm[2].trim(), children: []};
                add(f); stack.push(f);
            } else {
                throw new Error('Unsupported template tag: ' + tag);
            }
        }
        if (pos < src.length) add({t: 'text', v: src.slice(pos)});
        return root.children;
    }

    function evalExpr(expr, ctx) {
        expr = expr.trim();
        if (/^(['"]).*\1$/.test(expr)) return expr.slice(1, -1);
        if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);
        if (expr === 'True') return true;
        if (expr === 'False') return false;
        var val = ctx;
        expr.split('.').forEach(function (k) { val = (val === null || val === undefined) ? undefined : val[k]; });
        return val;
    }

    function evalCond(cond, ctx) {
        var m = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(cond);
        if (m) {
            var a = evalExpr(m[1], ctx), b = evalExpr(m[3], ctx);
            switch (m[2]) {
                case '==': return a === b || (typeof a === 'number' && typeof b === 'number' && a === b);
                case '!=': return a !== b;
                case '>': return a > b;
                case '<': return a < b;
                case '>=': return a >= b;
                case '<=': return a <= b;
            }
        }
        if (/^not\s+/.test(cond)) return !evalCond(cond.replace(/^not\s+/, ''), ctx);
        var v = evalExpr(cond, ctx);
        return !(v === undefined || v === null || v === false || v === 0 || v === '' || (Array.isArray(v) && v.length === 0));
    }

    function renderNodes(nodes, ctx) {
        var out = '';
        nodes.forEach(function (n) {
            if (n.t === 'text') out += n.v;
            else if (n.t === 'var') {
                var v = evalExpr(n.expr, ctx);
                if (v === undefined || v === null) v = '';
                out += n.filters.indexOf('safe') !== -1 ? String(v) : escapeHtml(v);
            } else if (n.t === 'if') {
                out += renderNodes(evalCond(n.cond, ctx) ? n.children : n.elseChildren, ctx);
            } else if (n.t === 'for') {
                var items = evalExpr(n.iter, ctx);
                if (typeof items === 'string') items = items.split('');
                (items || []).forEach(function (item, i) {
                    var c = Object.create(ctx);
                    if (n.targets.length === 1) c[n.targets[0]] = item;
                    else n.targets.forEach(function (tname, j) { c[tname] = item[j]; });
                    c.forloop = {counter: i + 1, counter0: i, first: i === 0, last: i === items.length - 1};
                    out += renderNodes(n.children, c);
                });
            }
        });
        return out;
    }

    function render(src, ctx) { return renderNodes(parseTemplate(src), ctx); }

    // ══════════════════════════════════════════════════════════════════════
    // OVERLAY (only for sending answers to the sheet)
    // ══════════════════════════════════════════════════════════════════════
    function overlay(html, buttons) {
        var el = document.getElementById('_sheet-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = '_sheet-overlay';
            el.setAttribute('dir', 'rtl');
            el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.88);display:flex;' +
                'align-items:center;justify-content:center;padding:16px;font-family:Vazirmatn,Tahoma,sans-serif;';
            document.body.appendChild(el);
        }
        el.innerHTML = '<div style="background:#1e293b;color:#f1f5f9;border-radius:16px;padding:28px 24px;max-width:440px;' +
            'width:100%;text-align:center;line-height:2;font-size:1.05rem;box-shadow:0 10px 40px rgba(0,0,0,.4)">' + html +
            '<div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"></div></div>';
        var box = el.querySelector('div > div');
        (buttons || []).forEach(function (b) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = b.label;
            btn.style.cssText = 'border:0;border-radius:10px;padding:10px 22px;font:inherit;cursor:pointer;' +
                'background:' + (b.primary ? '#3b82f6' : '#334155') + ';color:#fff';
            btn.onclick = b.onClick;
            box.appendChild(btn);
        });
        el.style.display = 'flex';
    }
    function hideOverlay() {
        var el = document.getElementById('_sheet-overlay');
        if (el) el.style.display = 'none';
    }

    // ══════════════════════════════════════════════════════════════════════
    // PAGE LIFECYCLE
    // ══════════════════════════════════════════════════════════════════════
    var current = null;   // {name, step, state, ctx, pending}
    var halted = false;

    function go(file) { window.location.href = file; }

    // Stop parsing this page (so its own scripts do not run) and open the page the participant is on.
    function redirect(file) {
        halted = true;
        window.stop();
        window.location.replace(file);
    }

    function init(pageName) {
        var params = new URLSearchParams(window.location.search);
        if (params.get('reset') === '1') {
            try { localStorage.removeItem(STATE_KEY); sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
            if (pageName !== 'Welcome') { redirect('index.html'); return; }
            history.replaceState(null, '', window.location.pathname);
        }
        var state = loadState();
        if (!state) {
            if (pageName !== 'Welcome') { redirect('index.html'); return; }
            state = newState();
            saveState(state);
        }
        var step = STEPS[Math.min(state.idx, STEPS.length - 1)];
        if (step.page !== pageName) {
            redirect(PAGES[step.page].file);
            return;
        }
        // the block counter is requested as soon as the participant starts (like a room slot in oTree)
        if (!state.dce_block && state.idx <= 2) requestBlock(state);

        var page = PAGES[pageName];
        var ctx = page.vars ? page.vars(state, step.round) : {};
        saveState(state);
        var pending = null;
        try {
            pending = JSON.parse(sessionStorage.getItem(PENDING_KEY));
            sessionStorage.removeItem(PENDING_KEY);
        } catch (e) {}
        if (pending && pending.idx !== state.idx) pending = null;
        current = {name: pageName, step: step, state: state, ctx: ctx, pending: pending};
        document.addEventListener('submit', onSubmit);
    }

    function head(stylesTpl) {
        if (halted) return;
        document.write(render(stylesTpl, current.ctx));
    }

    function body(contentTpl) {
        if (halted) return;
        var p = current.pending, alertHtml = '';
        if (p) {
            alertHtml = '<div class="otree-form-errors alert alert-danger">' +
                escapeHtml(p.nonField || 'Please fix the errors.') + '</div>';
        }
        document.write(
            '<div class="otree-body container">' +
            '<h2 class="otree-title page-header" id="_otree-title"></h2>' + alertHtml +
            '<form class="otree-form" role="form" id="form" autocomplete="off" method="post">' +
            '<div class="otree-content">' + render(contentTpl, current.ctx) + '</div>' +
            '</form><br/></div>'
        );
    }

    // After an error, oTree shows the page again with the typed values and the field errors.
    function afterBody() {
        if (halted || !current.pending) return;
        var p = current.pending;
        Object.keys(p.fields).forEach(function (name) {
            var input = document.querySelector('[name="' + name + '"]');
            var wrap = input && input.closest('._formfield');
            if (!wrap) return;   // raw inputs (not rendered by formfield) are not refilled by oTree either
            var info = p.fields[name];
            wrap.querySelectorAll('[name="' + name + '"]').forEach(function (el) {
                if (el.type === 'radio' || el.type === 'checkbox') {
                    el.checked = info.checkedValue !== null && el.value === String(info.checkedValue);
                } else {
                    el.value = info.value;
                    el.setAttribute('value', info.value);
                }
            });
            if (info.errors.length) {
                wrap.classList.add('has-errors');
                var div = document.createElement('div');
                div.className = 'form-control-errors';
                div.innerHTML = info.errors.map(escapeHtml).join('<br/>') + '<br/>';
                wrap.appendChild(div);
            }
        });
    }

    var busy = false;
    function onSubmit(e) {
        if (e.target.id !== 'form' || e.defaultPrevented) return;
        e.preventDefault();
        if (busy) return;
        var form = e.target;
        var fd = new FormData(form), raw = {};
        fd.forEach(function (v, k) { (raw[k] = raw[k] || []).push(typeof v === 'string' ? v : ''); });

        var page = PAGES[current.name], state = current.state, round = current.step.round;
        var values = {}, fieldInfo = {}, hasErrors = false;
        page.fields.forEach(function (name) {
            var res = validateField(name, raw[name] || []);
            values[name] = res.data;
            fieldInfo[name] = {errors: res.errors, value: res.value, checkedValue: res.data};
            if (res.errors.length) hasErrors = true;
        });
        var nonField = null;
        if (!hasErrors && page.errorMessage) {
            var err = page.errorMessage(values);
            if (typeof err === 'string' && err) { nonField = err; hasErrors = true; }
            else if (err && typeof err === 'object') {
                if (err.__all__) { nonField = err.__all__; delete err.__all__; hasErrors = true; }
                Object.keys(err).forEach(function (k) { fieldInfo[k].errors.push(err[k]); hasErrors = true; });
            }
        }
        if (hasErrors) {
            try {
                sessionStorage.setItem(PENDING_KEY, JSON.stringify({idx: state.idx, fields: fieldInfo, nonField: nonField}));
            } catch (x) {}
            window.location.reload();
            return;
        }

        state = loadState() || state;   // the block may have arrived in the background
        if (page.before) page.before(state, values, round, raw);
        busy = true;
        var proceed = function () {
            state.idx = Math.min(state.idx + 1, STEPS.length - 1);
            saveState(state);
            go(PAGES[STEPS[state.idx].page].file);
        };
        var needsBlock = STEPS[state.idx + 1] && STEPS[state.idx + 1].page === 'ChoiceTask' && !state.dce_block;
        var task = needsBlock ? ensureBlock(state).then(function (s) {
            state.dce_block = s.dce_block; state.block_source = s.block_source; state.dce_tasks = s.dce_tasks;
        }) : Promise.resolve();
        if (page.after) {
            var attempt = function () {
                overlay('در حال ثبت پاسخ‌ها، لطفاً چند لحظه صبر کنید…');
                page.after(state).then(function () { saveState(state); hideOverlay(); proceed(); }, function () {
                    saveState(state);
                    overlay('ثبت پاسخ‌ها انجام نشد. لطفاً اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.<br>' +
                            '<small style="color:#94a3b8">پاسخ‌های شما روی همین دستگاه نگه داشته شده‌اند.</small>',
                            [{label: 'تلاش دوباره', primary: true, onClick: attempt}]);
                });
            };
            task.then(attempt);
        } else {
            task.then(proceed);
        }
    }

    window.SurveyApp = {
        init: init, head: head, body: body, afterBody: afterBody,
        // exposed for tests
        _test: {
            calcPersonalTotalTime: calcPersonalTotalTime, calcSharedTimes: calcSharedTimes,
            calcProtectedKm: calcProtectedKm, calcSharedFare: calcSharedFare, formatKm: formatKm,
            withCommas: withCommas, validateField: validateField, exportRows: exportRows,
            EXPORT_HEADER: EXPORT_HEADER, STEPS: STEPS, render: render, loadState: loadState
        }
    };
})();
