# Scholarship Monitoring and Academic Compliance System
SAD Laboratory Examination, Section B. Stack: HTML, CSS, JavaScript, Supabase (Postgres + Auth + RLS), GitHub. Theme: light pink.

## Step by step setup (about 15 minutes)
1. **Create a Supabase project** at supabase.com (free tier). Wait until it finishes provisioning.
2. **Create 8 test accounts first** (Authentication > Users > Add user, tick "Auto confirm user"). Choose your own passwords and never write them in code or screenshots.
   - `staff@test.local` (Scholarship Staff)
   - `b01@test.local` to `b06@test.local` (scholars B01 to B06)
   - The exam only needs two accounts ready (staff + one scholar). Create b01 and b02 at minimum; the rest of the seeded scholars are rows you can review as staff.
3. **Run the schema:** SQL Editor > New query > paste all of `supabase/schema.sql` > Run. It creates tables, keys, row level security, the business functions, the two policy records, and the six seeded test submissions. Accounts are linked to profiles by email automatically.
4. **Add your keys:** Project Settings > API. Copy the Project URL and the **anon public** key into `config.js`. Never use the service-role key.
5. **Run locally:** open a terminal in the project root and run `python3 -m http.server 5500`, then visit http://localhost:5500
6. **Host (optional):** push to GitHub, then Settings > Pages > Deploy from branch > `main` / `(root)`. The site appears at https://YOUR-USERNAME.github.io/REPO-NAME/ .
7. **Test:** follow `docs/02_Test_Results.md`, filling in actual results and screenshots.
8. **Submit:** rename the folder `SAD_Exam_Section_B_<YourStudentID>`, ZIP it (or push to GitHub), and send test-account passwords privately to the instructor.

## Environment variable names
`SUPABASE_URL`, `SUPABASE_ANON_KEY` (set in `config.js`).

## How the rules are enforced (backend, not hidden buttons)
- Row level security: scholars can read only their own submissions; staff can read all. No table allows direct inserts or updates from the browser.
- All writes go through security-definer SQL functions: `submit_grades`, `verify_submission`, `evaluate_submission`, `decide_renewal`, `assign_scholar`. They check the caller's role, validate input, and write to `history` with actor and timestamp.
- Thresholds and deadlines are read from the `programs` table at evaluation time.
- Duplicates are blocked by `unique(scholar_id, academic_year, semester)` plus a clear message.
- Approval of a "With Deficiency" record is rejected by the database function.

## Exam walkthrough
1. Sign in as staff, open Review on each of B01 to B06, press **Evaluate** (B06 will refuse until verified), and compare with the expected results.
2. Press **Approve renewal** on B02 to show the backend block; Approve B01; Hold B02.
3. Sign in as `b01@test.local`: try a duplicate semester and GWA 0.50 (rejected). Open the browser console and run `db.from('submissions').select('*')` to show only own rows (TC08). Run `db.rpc('verify_submission',{p_id:'<any id>',p_status:'Verified',p_reason:''})` to show denial.
4. Return a record as staff, sign in as that scholar, press Correct, resubmit, refresh: status is Pending and history is preserved (TC09).

## Known limits
- Resubmission keeps the original submitted timestamp, so lateness is judged on the first submission. Change this in `submit_grades` if your instructor wants otherwise.
- Test-account passwords are supplied privately.

## Folder layout (GitHub ready)
```
index.html  app.js  style.css  config.js     <- the web app (repo root so GitHub Pages works)
supabase/schema.sql                          <- run in Supabase SQL Editor
docs/01_Analysis_Report.md  docs/02_Test_Results.md
```
`config.js` holds only the project URL and the publishable (anon) key, which is safe to commit. Never commit the service-role / secret key.
