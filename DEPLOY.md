# Deployment Guide — Retailer Performance Analytics

## 🗄️ Step 1: Set Up Supabase Database

### 1a. Run Database Setup SQL
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Copy and paste the entire contents of `public/database-setup.sql`
3. Click **Run** — this creates all tables, RLS policies, and seeds data for 55 retailers across 8 Italian cities

### 1b. Create Admin Auth User  
1. Go to **Authentication** → **Users** → **Add User** → **Create New User**
2. Enter your email and password
3. Click **Create User**

### 1c. Link Admin Profile (**CRITICAL — this is why login fails!**)
After creating the auth user, you must link it to an `rpa_users` profile:

1. Go to **SQL Editor**
2. Run `public/quick-fix-admin.sql` — this auto-creates admin profiles for all auth users that don't have one yet

**OR** manually:
1. Go to **Authentication** → **Users** → click on your user → copy the UUID
2. Run this in SQL Editor (replace the UUID and email):
```sql
INSERT INTO public.rpa_users (auth_user_id, username, full_name, email, role, branches, is_active)
VALUES (
  'your-uuid-here',
  'admin',
  'Administrator', 
  'your-email@example.com',
  'HS-ADMIN',
  ARRAY['Milan','Bologna','Torino','Padova','Rome','Napoli','Palermo','Bari'],
  true
);
```

### 1d. Configure Auth
1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your Vercel domain (e.g., `https://your-app.vercel.app`)
3. Add the same URL to **Redirect URLs**

## 🌐 Step 2: Deploy to Vercel

### Option A: Deploy via GitHub
1. Push this code to a GitHub repository
2. Go to **vercel.com** → **Add New Project**
3. Import your GitHub repo
4. Configure:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Click **Deploy**

### Option B: Deploy via Vercel CLI
```bash
npm i -g vercel
vercel --prod
```

## 👥 Adding More Users

### RSM (Regional Manager — sees 4 branches)
```sql
-- First create auth user in Supabase Dashboard → Authentication
-- Then link with rpa_users:
INSERT INTO public.rpa_users (auth_user_id, username, full_name, email, role, branches, is_active)
VALUES (
  'auth-uuid-here',
  'rsm_north',
  'Marco Rossi',
  'rsm.north@company.com',
  'RSM',
  ARRAY['Milan','Bologna','Torino','Padova'],
  true
);
```

### ASM (Area Manager — sees 1 branch)
```sql
INSERT INTO public.rpa_users (auth_user_id, username, full_name, email, role, branches, is_active)
VALUES (
  'auth-uuid-here',
  'asm_milan',
  'Andrea Verdi',
  'asm.milan@company.com',
  'ASM',
  ARRAY['Milan'],
  true
);
```

## 🏢 Branch Structure (Italy)

| Region | Branches |
|--------|----------|
| **North** | Milan, Bologna, Torino, Padova |
| **South** | Rome, Napoli, Palermo, Bari |

## 🔑 Role Permissions

| Role | Branches | Import | PDF Export |
|------|----------|--------|------------|
| **HS-ADMIN** | All 8 | ✅ | ✅ |
| **RSM** | 4 (region) | ❌ | ✅ |
| **ASM** | 1 (city) | ❌ | ✅ |

## ❓ Troubleshooting

### "Login successful but no user profile found"
- You created an auth user but didn't link it to `rpa_users`
- Run `quick-fix-admin.sql` in SQL Editor to auto-fix

### "Invalid login credentials"
- The email/password doesn't match what's in Supabase Auth
- Go to Authentication → Users and verify the user exists

### No retailers shown after login
- Check that `retailer_summary` table has data
- Run `database-setup.sql` to seed data
- Check the user's `branches` array matches the branch names in data

### RLS blocking data access
- Verify `auth_user_id` in `rpa_users` matches the auth user's UUID
- For HS-ADMIN, they should see all branches regardless
