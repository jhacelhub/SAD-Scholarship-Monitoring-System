const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s), app = $('#app'), dlg = $('#dlg');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = s => String(s).toLowerCase().replace(/\s+/g, '-');
const chip = s => `<span class="chip ${slug(s)}">${esc(s)}</span>`;
const when = t => new Date(t).toLocaleString('en-PH', {timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short'});
let me = null, st = {year: '2026-2027', sem: '1', q: '', prog: '', comp: ''}, timer;

function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.className = 'show ' + (bad ? 'bad' : 'ok'); clearTimeout(timer); timer = setTimeout(() => t.className = '', 4000); }
async function rpc(fn, args, ok) { const {error} = await db.rpc(fn, args); if (error) { toast(error.message, true); return false; } toast(ok); return true; }

async function boot() {
  const {data: {session}} = await db.auth.getSession();
  if (!session) return login();
  const {data} = await db.from('profiles').select('*').eq('auth_id', session.user.id).maybeSingle();
  me = data;
  if (!me) { app.innerHTML = `<div class="login"><div class="card"><h2>No profile found</h2><p>Your login is not linked to a scholar or staff profile. Ask the Scholarship Office to register your email.</p><button id="out">Sign out</button></div></div>`; $('#out').onclick = signOut; return; }
  app.innerHTML = `<header class="top"><span class="brand">Scholarship Monitoring</span><span>${esc(me.full_name)} <button class="ghost" id="out">Sign out</button></span></header><main class="wrap" id="main"></main>`;
  $('#out').onclick = signOut;
  me.role === 'staff' ? staffView() : scholarView();
}
async function signOut() { await db.auth.signOut(); boot(); }

function login() {
  app.innerHTML = `<div class="login"><h1>Scholarship Monitoring</h1><p>Submit semester grades, track verification, and see your renewal decision.</p>
  <form class="card" id="f"><label for="e">Email</label><input id="e" type="email" required autocomplete="username">
  <label for="p" style="margin-top:10px">Password</label><input id="p" type="password" required autocomplete="current-password">
  <button style="margin-top:16px;width:100%">Sign in</button></form></div>`;
  $('#f').onsubmit = async e => { e.preventDefault(); const {error} = await db.auth.signInWithPassword({email: $('#e').value, password: $('#p').value}); error ? toast(error.message, true) : boot(); };
}

/* ---------------- Scholar ---------------- */
async function scholarView() {
  const [{data: a}, {data: subs}] = await Promise.all([db.from('assignments').select('programs(*)').maybeSingle(), db.from('submissions').select('*').order('submitted_at', {ascending: false})]);
  const pg = a?.programs;
  $('#main').innerHTML = `<h1>My scholarship</h1><p class="muted">${pg ? `Program: <b>${esc(pg.name)}</b>, deadline ${when(pg.deadline)} (Manila time)` : 'You are not assigned to a program yet.'}</p>
  <div class="card"><h2>Submit semester grades</h2><form id="sf" class="grid g2">
   <div><label>Academic year</label><input name="y" value="2026-2027" pattern="\\d{4}-\\d{4}" required></div>
   <div><label>Semester</label><select name="s"><option>1</option><option>2</option></select></div>
   <div><label>GWA (1.00 to 5.00)</label><input name="g" type="number" step="0.01" required></div>
   <div><label>Enrolled units</label><input name="u" type="number" step="1" required></div>
   <div><label>Failed subjects</label><input name="f" type="number" step="1" value="0" required></div>
   <div><label>Incomplete grades</label><input name="i" type="number" step="1" value="0" required></div>
   <div><label>Dropped subjects</label><input name="d" type="number" step="1" value="0" required></div>
   <div><label>Grade-document reference</label><input name="r" placeholder="e.g. DOC-2026-0001" required></div>
   <div><button ${pg ? '' : 'disabled'}>Submit grades</button></div></form></div>
  <div class="card"><h2>My submissions</h2><div class="scroll"><table><tr><th>Term</th><th>GWA</th><th>Units</th><th>Submitted</th><th>Verification</th><th>Compliance</th><th>Renewal</th><th></th></tr>
  ${(subs || []).map(s => `<tr><td>${esc(s.academic_year)} S${s.semester}</td><td>${s.gwa}</td><td>${s.units}</td><td>${when(s.submitted_at)}</td>
   <td>${chip(s.verification_status)}${s.verification_reason ? `<div class="muted">${esc(s.verification_reason)}</div>` : ''}</td><td>${chip(s.compliance_result)}</td><td>${chip(s.renewal_decision)}</td>
   <td>${s.verification_status === 'Returned' ? `<button class="ghost" data-fix="${s.id}">Correct</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nothing submitted yet. Use the form above to send your first semester.</td></tr>'}</table></div></div>`;
  $('#sf').onsubmit = async e => { e.preventDefault(); const f = e.target, v = n => f[n].value;
    if (await rpc('submit_grades', {p_year: v('y'), p_sem: +v('s'), p_gwa: v('g') === '' ? null : +v('g'), p_units: +v('u'), p_failed: +v('f'), p_inc: +v('i'), p_drop: +v('d'), p_ref: v('r')}, 'Grades submitted')) scholarView(); };
  document.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => { const s = subs.find(x => x.id === b.dataset.fix), f = $('#sf');
    f.y.value = s.academic_year; f.s.value = s.semester; f.g.value = s.gwa; f.u.value = s.units; f.f.value = s.failed_count; f.i.value = s.inc_count; f.d.value = s.dropped_count; f.r.value = s.evidence_ref; f.scrollIntoView({behavior: 'smooth'}); toast('Fix the values, then submit again'); });
}

/* ---------------- Staff ---------------- */
async function staffView() {
  const [P, A, Pr, S] = await Promise.all([db.from('profiles').select('*').eq('role', 'scholar'), db.from('assignments').select('*'), db.from('programs').select('*').order('id'),
    db.from('submissions').select('*').eq('academic_year', st.year).eq('semester', +st.sem)]);
  const progs = Pr.data || [], rows = (S.data || []).map(s => { const p = (P.data || []).find(x => x.id === s.scholar_id), a = (A.data || []).find(x => x.scholar_id === s.scholar_id);
    return {...s, p, prog: progs.find(x => x.id === a?.program_id)}; });
  const q = st.q.toLowerCase(), shown = rows.filter(r => (!q || (r.p?.student_id || '').toLowerCase().includes(q) || (r.p?.full_name || '').toLowerCase().includes(q)) && (!st.prog || r.prog?.name === st.prog) && (!st.comp || r.compliance_result === st.comp));
  const n = f => rows.filter(f).length;
  $('#main').innerHTML = `<h1>Scholarship office</h1>
  <div class="card"><div class="row"><div><label>Academic year</label><input id="y" value="${esc(st.year)}"></div><div><label>Semester</label><select id="s"><option ${st.sem == 1 ? 'selected' : ''}>1</option><option ${st.sem == 2 ? 'selected' : ''}>2</option></select></div><button id="go">Show semester</button></div></div>
  <div class="grid g4" style="margin-bottom:20px"><div class="stat"><b>${(A.data || []).length}</b><span>Assigned scholars</span></div><div class="stat"><b>${n(r => r.verification_status === 'Pending')}</b><span>Pending verification</span></div>
  <div class="stat"><b>${n(r => r.compliance_result === 'Compliant')}</b><span>Compliant</span></div><div class="stat"><b>${n(r => r.compliance_result === 'With Deficiency')}</b><span>With deficiency</span></div></div>
  <div class="card"><h2>Submissions</h2><div class="row" style="margin-bottom:12px"><div><label>Search ID or name</label><input id="q" value="${esc(st.q)}"></div>
   <div><label>Program</label><select id="fp"><option value="">All</option>${progs.map(p => `<option ${st.prog === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
   <div><label>Compliance</label><select id="fc"><option value="">All</option>${['Not Evaluated', 'Compliant', 'With Deficiency'].map(c => `<option ${st.comp === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
  <div class="scroll"><table><tr><th>ID</th><th>Name</th><th>Program</th><th>GWA</th><th>Verification</th><th>Compliance</th><th>Renewal</th><th></th></tr>
  ${shown.map(r => `<tr><td>${esc(r.p?.student_id)}</td><td>${esc(r.p?.full_name)}</td><td>${esc(r.prog?.name)}</td><td>${r.gwa}</td><td>${chip(r.verification_status)}</td><td>${chip(r.compliance_result)}</td><td>${chip(r.renewal_decision)}</td><td><button class="ghost" data-open="${r.id}">Review</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">No submissions match. Change the semester or clear the filters.</td></tr>'}</table></div></div>
  <div class="card"><h2>Register a scholar</h2><form id="af" class="row"><div><label>Student ID</label><input name="i" required></div><div><label>Full name</label><input name="n" required></div><div><label>Email</label><input name="e" type="email" required></div>
   <div><label>Program</label><select name="p">${progs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><button>Register</button></form></div>
  <div class="card"><h2>Policy records</h2><div class="scroll"><table><tr><th>Program</th><th>Max GWA</th><th>Min units</th><th>Failed</th><th>INC</th><th>Dropped</th><th>Deadline</th></tr>
  ${progs.map(p => `<tr><td>${esc(p.name)}</td><td>${p.max_gwa}</td><td>${p.min_units}</td><td>${p.max_failed}</td><td>${p.max_inc}</td><td>${p.max_drop}</td><td>${when(p.deadline)}</td></tr>`).join('')}</table></div></div>`;
  $('#go').onclick = () => { st.year = $('#y').value; st.sem = $('#s').value; staffView(); };
  $('#q').oninput = e => { st.q = e.target.value; clearTimeout(timer); timer = setTimeout(() => { staffView().then(() => { const i = $('#q'); i.focus(); i.setSelectionRange(99, 99); }); }, 350); };
  $('#fp').onchange = e => { st.prog = e.target.value; staffView(); }; $('#fc').onchange = e => { st.comp = e.target.value; staffView(); };
  $('#af').onsubmit = async e => { e.preventDefault(); const f = e.target; if (await rpc('assign_scholar', {p_student_id: f.i.value, p_name: f.n.value, p_email: f.e.value, p_program: +f.p.value}, 'Scholar registered')) staffView(); };
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => review(rows.find(r => r.id === b.dataset.open)));
}

async function review(r) {
  const {data: s} = await db.from('submissions').select('*').eq('id', r.id).single(), {data: h} = await db.from('history').select('*').eq('submission_id', r.id).order('created_at');
  const ver = s.verification_status === 'Verified', ev = s.compliance_result !== 'Not Evaluated';
  dlg.innerHTML = `<h2>${esc(r.p?.full_name)} (${esc(r.p?.student_id)})</h2><p class="muted">${esc(r.prog?.name)}, ${esc(s.academic_year)} semester ${s.semester}, submitted ${when(s.submitted_at)}</p>
  <p>GWA <b>${s.gwa}</b> | Units <b>${s.units}</b> | Failed <b>${s.failed_count}</b> | INC <b>${s.inc_count}</b> | Dropped <b>${s.dropped_count}</b> | Evidence <b>${esc(s.evidence_ref)}</b></p>
  <p>${chip(s.verification_status)} ${chip(s.compliance_result)} ${chip(s.renewal_decision)}</p>
  <label>Reason or note</label><textarea id="note" rows="2">${esc(s.decision_note || s.verification_reason || '')}</textarea>
  <div class="row" style="margin:10px 0"><button id="v">Mark Verified</button><button class="ghost" id="rt">Return</button><button id="ev" ${ver ? '' : 'disabled'}>Evaluate</button><button id="ap">Approve renewal</button><button class="ghost" id="hd">Hold renewal</button></div>
  ${(s.checks || []).map(c => `<div class="check ${c.pass ? 'pass' : 'fail'}"><i>${c.pass ? 'Pass' : 'Fail'}</i><span>${esc(c.detail)}</span></div>`).join('')}
  <h3 style="margin-top:14px">History</h3>${(h || []).map(x => `<div class="hist">${when(x.created_at)}: <b>${esc(x.action)}</b> by ${esc(x.actor_name)} ${x.note ? '| ' + esc(x.note) : ''}</div>`).join('')}
  <div style="text-align:right;margin-top:14px"><button class="ghost" id="cl">Close</button></div>`;
  dlg.showModal(); $('#cl').onclick = () => dlg.close();
  const act = async (fn, args, msg) => { if (await rpc(fn, args, msg)) { await staffView(); review(r); } };
  const note = () => $('#note').value;
  $('#v').onclick = () => act('verify_submission', {p_id: s.id, p_status: 'Verified', p_reason: note()}, 'Evidence verified');
  $('#rt').onclick = () => act('verify_submission', {p_id: s.id, p_status: 'Returned', p_reason: note()}, 'Evidence returned');
  $('#ev').onclick = () => act('evaluate_submission', {p_id: s.id}, 'Evaluation recorded');
  $('#ap').onclick = () => act('decide_renewal', {p_id: s.id, p_decision: 'Approved', p_note: note()}, 'Renewal approved');
  $('#hd').onclick = () => act('decide_renewal', {p_id: s.id, p_decision: 'Held', p_note: note()}, 'Renewal held');
}
boot();
