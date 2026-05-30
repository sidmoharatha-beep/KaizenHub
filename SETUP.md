# KaizenHub — Complete Setup Guide

## What you get
- ✅ Role-based login (Operator / Manager / Admin)
- ✅ Operators submit ideas, see their own status & points
- ✅ Managers approve/reject with feedback — operator sees it instantly
- ✅ Live dashboard & leaderboard
- ✅ Reward points ledger per employee
- ✅ Admin creates all employee accounts

---

## STEP 1 — Set up Supabase (free database)

1. Go to **supabase.com** → Sign up free
2. Click **New Project** → give it a name (e.g. `kaizenhub`) → set a database password → Create
3. Wait ~2 minutes for it to spin up
4. Go to **SQL Editor** → click **New query**
5. Copy everything from `schema.sql` → paste it → click **Run**
6. Go to **Settings → API**
7. Copy:
   - **Project URL** (looks like `https://abcxyz.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

---

## STEP 2 — Add your keys to the app

Open `config.js` and replace the placeholders:

```js
const SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';  // ← paste URL here
const SUPABASE_ANON = 'eyJ...YOUR_ANON_KEY...';               // ← paste key here
```

---

## STEP 3 — Create your first Admin account

1. Go to your Supabase project → **Authentication → Users → Add user**
2. Enter your email + a strong password → Create user
3. Go to **SQL Editor** → run this (replace values):

```sql
insert into profiles (id, emp_id, full_name, role, unit)
values (
  '<paste-user-id-from-auth-users-table>',
  'ADMIN-001',
  'Your Name',
  'admin',
  'Management'
);
```

4. Now log in to the app with that email/password
5. Use the **Admin tab** to create all other employee accounts

---

## STEP 4 — Deploy to Netlify (free)

### Option A — Drag & Drop
1. Go to **netlify.com** → Sign up free
2. Drag both `index.html` and `config.js` onto the deploy area
3. Get a live link like `kaizenhub.netlify.app` — share with your team!

### Option B — GitHub (auto-updates)
1. Create a GitHub repo → upload `index.html`, `config.js`, `schema.sql`
2. Netlify → **Add new site → Import from Git** → connect repo → Deploy
3. Every push to GitHub auto-publishes ✓

---

## How roles work

| Role | Can do |
|------|--------|
| **Operator** | Submit ideas · See own submissions & status · View own rewards · Dashboard |
| **Manager** | Review queue (approve/reject with feedback) · See all submissions · Dashboard |
| **Admin** | Everything above + create/view all user accounts |

## Files in this project

| File | Purpose |
|------|---------|
| `index.html` | The entire app |
| `config.js` | Your Supabase keys (edit this) |
| `schema.sql` | Run once in Supabase SQL Editor |
| `SETUP.md` | This guide |
