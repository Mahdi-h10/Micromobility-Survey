/**
 * Receives answers from the GitHub Pages version of the survey and writes them into this Google Sheet.
 * Paste this whole file into Extensions > Apps Script of the sheet, then deploy it as a Web app
 * (Execute as: Me, Who has access: Anyone). Step-by-step instructions are in the guide.
 *
 * Sheets (created automatically):
 *   data    one row per participant and round, same columns as oTree's custom_export
 *   starts  one row per participant: assigned block, start and finish time (to count drop-outs)
 *   raffle  phone number / Telegram ID, kept apart from the research data
 */
var DATA_SHEET = 'data';
var STARTS_SHEET = 'starts';
var RAFFLE_SHEET = 'raffle';

var DATA_HEADER = [
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
var STARTS_HEADER = ['participant_code', 'session_code', 'dce_block', 'column_order', 'block_source', 'started_at', 'finished_at'];
var RAFFLE_HEADER = ['participant_code', 'session_code', 'raffle_phone', 'raffle_id', 'submitted_at'];
var NUM_ROUNDS = 6;

function doGet() {
  return json_({ok: true, message: 'Survey endpoint is running.'});
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return json_({ok: false, error: 'busy'});
  }
  try {
    var req = JSON.parse(e.postData.contents);
    var code = String(req.participant_code || '');
    if (!/^[a-z0-9]{8}$/.test(code)) return json_({ok: false, error: 'bad participant_code'});
    if (req.action === 'start') return json_(start_(req, code));
    if (req.action === 'submit') return json_(submit_(req, code));
    if (req.action === 'raffle') return json_(raffle_(req, code));
    return json_({ok: false, error: 'unknown action'});
  } catch (err) {
    return json_({ok: false, error: String(err)});
  } finally {
    lock.releaseLock();
  }
}

// Balanced block assignment, as in oTree's creating_session: one shuffled order of A-D,
// then participant i gets block order[i % 4].
function start_(req, code) {
  var sh = sheet_(STARTS_SHEET, STARTS_HEADER);
  var row = findRow_(sh, code);
  if (row) return {ok: true, block: String(sh.getRange(row, 3).getValue()), existing: true};
  var props = PropertiesService.getScriptProperties();
  var order = props.getProperty('block_order');
  if (!order) {
    order = shuffle_(['A', 'B', 'C', 'D']).join('');
    props.setProperty('block_order', order);
  }
  var n = Number(props.getProperty('block_counter') || 0);
  var block = order.charAt(n % 4);
  props.setProperty('block_counter', String(n + 1));
  sh.appendRow(clean_([code, req.session_code, block, req.column_order, 'sheet', new Date(), '']));
  return {ok: true, block: block};
}

function submit_(req, code) {
  if (JSON.stringify(req.header) !== JSON.stringify(DATA_HEADER)) return {ok: false, error: 'columns do not match'};
  var rows = req.rows;
  if (!Array.isArray(rows) || rows.length !== NUM_ROUNDS) return {ok: false, error: 'expected ' + NUM_ROUNDS + ' rows'};
  for (var i = 0; i < rows.length; i++) {
    if (!Array.isArray(rows[i]) || rows[i].length !== DATA_HEADER.length || rows[i][1] !== code) {
      return {ok: false, error: 'bad row ' + (i + 1)};
    }
  }
  var data = sheet_(DATA_SHEET, DATA_HEADER);
  if (!findRow_(data, code, 2)) {
    var values = rows.map(clean_);
    data.getRange(data.getLastRow() + 1, 1, values.length, DATA_HEADER.length).setValues(values);
  }
  var starts = sheet_(STARTS_SHEET, STARTS_HEADER);
  var row = findRow_(starts, code);
  if (!row) {
    // the sheet was not reachable when the participant started, so the block was drawn at random
    starts.appendRow(clean_([code, req.session_code, rows[0][3], rows[0][4], req.block_source || 'random', '', new Date()]));
  } else {
    starts.getRange(row, 7).setValue(new Date());
  }
  return {ok: true};
}

function raffle_(req, code) {
  var sh = sheet_(RAFFLE_SHEET, RAFFLE_HEADER);
  var values = clean_([code, req.session_code, req.raffle_phone || '', req.raffle_id || '', new Date()]);
  var row = findRow_(sh, code);
  if (row) sh.getRange(row, 1, 1, values.length).setValues([values]);
  else sh.appendRow(values);
  return {ok: true};
}

// ── helpers ──────────────────────────────────────────────────────────────
function sheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

function findRow_(sh, code, col) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var cell = sh.getRange(2, col || 1, last - 1, 1).createTextFinder(code).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

// Keep text as text: a leading apostrophe stops Sheets from reading "0912..." as a number,
// "2,5" as a decimal, or "=..." as a formula. Numbers and dates are written as they are.
function clean_(row) {
  return row.map(function (v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' || v instanceof Date) return v;
    return "'" + String(v).slice(0, 500);
  });
}

function shuffle_(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
