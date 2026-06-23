# AI Commercial Assistant — Setup Guide

This guide explains what was created in this first step and what you need to do manually in Supabase before building the app UI.

## What was created

### Next.js app (in this folder)

A new web app project was initialized with:

- **Next.js** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **ESLint**

The default Next.js starter files are in place. **No CRM screens have been built yet.**

### Supabase database schema

File: `supabase/migrations/001_initial_schema.sql`

This SQL file creates the database structure for the CRM.

#### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | One row per broker (linked to their login account) |
| `companies` | Freight companies each broker is working with |
| `contacts` | People at each company |
| `activities` | Calls, emails, meetings, notes, etc. |
| `follow_ups` | Reminders and tasks tied to a company |
| `company_ai_insights` | AI-generated notes about a company (for later features) |

#### How ownership works

- Every broker-owned table has a `user_id` column.
- That `user_id` links to `auth.users(id)` in Supabase Auth.
- Brokers will **not** pick or see an “assigned broker” field in the app.
- The app will always use the logged-in user as the owner when saving data.
- **Row Level Security (RLS)** is enabled so each broker can only see and change their own rows.

#### Company priority values

Companies can be marked as:

- Low
- Medium
- High
- Hot Lead

#### Indexes

Indexes were added on the columns that will be searched and filtered most often (for example: company name, priority, next follow-up date, and links between companies and their contacts/activities).

---

## Next manual steps in Supabase

Follow these steps in order.

### 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Click **New project**.
3. Choose a name (for example: `lm-commercial-crm`).
4. Set a strong database password and save it somewhere safe.
5. Pick the region closest to your brokers.
6. Wait until the project finishes creating.

### 2. Run the database migration

1. In your Supabase project, open **SQL Editor**.
2. Click **New query**.
3. Open the file `supabase/migrations/001_initial_schema.sql` from this project.
4. Copy the full contents and paste them into the SQL Editor.
5. Click **Run**.
6. Confirm there are no errors. You should see the new tables under **Table Editor**.

### 3. Turn on email login (or your chosen auth method)

1. In Supabase, go to **Authentication** → **Providers**.
2. Make sure **Email** is enabled (this is the default).
3. Under **Authentication** → **URL Configuration**, set:
   - **Site URL** — your local dev URL for now: `http://localhost:3000`
   - **Redirect URLs** — add `http://localhost:3000/**` (you will add your Vercel URL later)

### 4. Create broker user accounts

For each broker (~70 users), create an account in Supabase:

1. Go to **Authentication** → **Users**.
2. Click **Add user** → **Create new user**.
3. Enter the broker’s email and a temporary password (or send an invite if you prefer).

When a user is created, a matching row is added automatically to the `profiles` table.

> **Tip:** You can also invite users later from the app once the login screen is built.

### 5. Copy your Supabase keys (for a later step)

When you connect the Next.js app to Supabase, you will need:

1. **Project URL** — found under **Project Settings** → **API**
2. **anon public key** — also under **API** (safe to use in the browser with RLS enabled)

Do **not** put the `service_role` key in the frontend. That key bypasses RLS and must stay server-side only.

You will add these to a `.env.local` file when the app is wired to Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 6. (Optional) Install Supabase CLI for future migrations

If you want to manage migrations from your computer later:

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Link this project to your Supabase project.
3. Use `supabase db push` to apply new migration files.

For now, running the SQL file in the Supabase SQL Editor is enough.

---

## What comes next (not built yet)

These items are planned for the next development steps:

- Connect Next.js to Supabase Auth
- Login and logout screens
- Companies list and detail pages
- Contacts, activities, and follow-ups inside each company
- Automatic `user_id` on every save (from the logged-in user)
- Deployment to Vercel

---

## Quick reference: folder layout

```
lm-commercial-crm/
├── app/                          # Next.js pages (starter only for now)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   # Database tables, RLS, indexes
├── README_SETUP.md               # This file
└── package.json
```
