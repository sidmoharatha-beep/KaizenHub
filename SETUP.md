# KaizenHub — Cloudflare Setup Guide

**Stack: Cloudflare Pages (hosting) + D1 (database) — 100% free tier**

No Supabase. No Netlify. Everything runs on Cloudflare.

---

## What's included

| Feature | Details |
|---------|---------|
| Role-based login | Operator / Manager / Admin |
| Operator flow | Submit ideas, view own status & points, rewards ledger |
| Manager flow | Review queue, approve/reject with feedback |
| Admin flow | Create users, **reset passwords**, delete users, full audit log |
| Dashboard | KPIs, live leaderboard |
| Audit log | Every login, submission, approval, user creation, password reset stored in DB |
| Data storage | All data in Cloudflare D1 (SQLite) — zero external services |
| Security | PBKDF2 password hashing, session tokens, role-checked API routes |

---

## Prerequisites

- Free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Node.js](https://nodejs.org) v18+
- Wrangler CLI: `npm install -g wrangler`

---

## STEP 1 — Install Wrangler & login

```bash
npm install -g wrangler
wrangler login
```

---

## STEP 2 — Create the D1 database

```bash
wrangler d1 create kaizenhub-db
```

Copy the `database_id` from the output.  
Open `wrangler.toml` and replace `YOUR_D1_DATABASE_ID` with it:

```toml
[[d1_databases]]
binding = "DB"
database_name = "kaizenhub-db"
database_id   = "paste-your-id-here"
```

---

## STEP 3 — Apply the database schema

```bash
wrangler d1 execute kaizenhub-db --file=schema.sql
```

You should see: `Successfully executed 1 SQL statement`

---

## STEP 4 — Create the first Admin account

Edit `seed-admin.mjs` — change the email and password at the top, then run:

```bash
node seed-admin.mjs
```

This inserts the admin user directly into D1.

> **Important:** Change the password after your first login via Admin → All Users → 🔑 Reset.

---

## STEP 5 — Deploy to Cloudflare Pages

### Option A — Deploy via Wrangler CLI (recommended)

```bash
wrangler pages deploy . --project-name kaizenhub
```

First run will ask you to create a new project — say yes.  
You'll get a URL like `https://kaizenhub.pages.dev`.

### Option B — Deploy via GitHub (auto-deploys on push)

1. Create a GitHub repo and push this folder
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages** → **Create a project**
3. Connect GitHub → select your repo
4. Build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: `/` (dot)
5. Click **Save and Deploy**

### Bind D1 to Pages (required for both options)

1. Cloudflare Dashboard → **Pages** → `kaizenhub` → **Settings** → **Functions**
2. Under **D1 database bindings** → Add binding:
   - Variable name: `DB`
   - D1 database: `kaizenhub-db`
3. Click **Save** → redeploy

---

## STEP 6 — First login

Open your Pages URL → log in with the admin credentials from Step 4.

Go to **Admin → Add User** to create employee accounts.

---

## Role capabilities

| Role | Capabilities |
|------|-------------|
| **Operator** | Submit ideas · View own submissions + status + feedback · Rewards page |
| **Manager** | Review queue (approve/reject) · See all submissions · Dashboard + leaderboard |
| **Admin** | Everything above + Create/delete users · **Reset passwords** · Full audit log |

---

## Password Reset (Admin feature)

1. Admin logs in → **Admin** tab → **All Users**
2. Click 🔑 next to any user
3. Enter a new password (min 8 chars)
4. Click **Reset Password**
5. All existing sessions for that user are automatically invalidated
6. The reset is recorded in the audit log

---

## Local development

```bash
# Install dependencies (none needed — pure Workers/Pages Functions)
wrangler pages dev . --d1=DB=kaizenhub-db
```

This runs the full app locally with the real D1 database.

---

## File structure

```
KaizenHub-CF/
├── index.html                  ← Entire frontend (single file)
├── wrangler.toml               ← Cloudflare config (edit database_id)
├── schema.sql                  ← D1 database schema (run once)
├── seed-admin.mjs              ← Creates first admin (run once)
├── SETUP.md                    ← This file
└── functions/
    └── api/
        ├── _utils.js           ← Shared: auth, hashing, audit
        ├── auth.js             ← POST /api/auth (login), DELETE (logout)
        ├── users.js            ← GET/POST/PUT/DELETE /api/users
        ├── submissions.js      ← GET/POST/PUT /api/submissions
        ├── dashboard.js        ← GET /api/dashboard (stats + leaderboard)
        └── audit.js            ← GET /api/audit (admin only)
```

---

## Cloudflare Free Tier limits

| Resource | Free limit | KaizenHub usage |
|----------|-----------|-----------------|
| Pages requests | 100,000 / day | ✅ More than enough |
| D1 reads | 5 million / day | ✅ Fine for any team |
| D1 writes | 100,000 / day | ✅ Fine for any team |
| D1 storage | 5 GB | ✅ Years of data |
| Functions (Workers) | 100,000 requests / day | ✅ Fine |

---

## Troubleshooting

**"Unauthorized" after deployment**  
→ Check D1 binding: Pages → Settings → Functions → D1 bindings → `DB` must point to `kaizenhub-db`

**API returns 500**  
→ Check Cloudflare Pages → Functions → Logs for the actual error

**"Email or Employee ID already exists"**  
→ That email/EmpID is taken. Use a different one or check the users list.

**Login fails after password reset**  
→ The admin resets a *temporary* password that the employee types in — it works immediately.
