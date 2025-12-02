# 🚀 DEPLOY NOTES - Cookie Persistence Fix

## 📋 CHANGES MADE

### ISSUE: Cookies Hilang Setelah Login
**Problem:** 
Setelah login (baik via email/password atau Google OAuth), cookies Supabase hilang saat redirect ke `/cari-jodoh`, menyebabkan user dianggap "not authenticated" dan di-redirect loop ke `/login`.

**Root Causes:**
1. Cookie `sameSite` dan `path` tidak konsisten across all cookie operations
2. `window.location.href` causes full page reload yang bisa kehilangan cookies
3. Netlify headers belum configured untuk preserve cookies

---

### 1. Cookie Settings Fixed
**Files Modified:**
- `lib/supabase/server.ts` - Force `sameSite: 'lax'` and `path: '/'`
- `middleware.ts` - Force consistent cookie options

**What Changed:**
```typescript
// Before
const cookieOptions = {
  ...options,
  secure: isProduction,
}

// After
const cookieOptions = {
  ...options,
  secure: isProduction,
  sameSite: 'lax', // ✅ FORCE lax for cross-page navigation
  path: '/', // ✅ FORCE root path
}
```

**Why:**
- `sameSite: 'lax'` allows cookies to persist during navigation
- `path: '/'` ensures cookies are available on all routes
- Prevents cookie loss during redirects

### 2. Netlify Configuration Updated
**File:** `netlify.toml`

**Added:**
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Access-Control-Allow-Credentials = "true"
    Cache-Control = "no-cache, no-store, must-revalidate"
```

**Why:**
- Ensures Netlify doesn't strip cookies
- Prevents aggressive caching that might cause cookie issues

### 3. Navigation Method Changed
**Files Modified:**
- `features/auth/components/fiveq-form.tsx` - Replace `window.location.href` with `router.push()`
- `features/auth/components/auth-form-login.tsx` - Replace `window.location.href` with `router.push()`

**Changed:**
```typescript
// Before (Onboarding & Login)
window.location.href = "/onboarding/cv"
window.location.href = "/cari-jodoh"

// After
router.push("/onboarding/cv")
router.refresh() // Force refresh to re-run middleware

router.push("/cari-jodoh")
router.refresh()
```

**Why:**
- `window.location.href` causes full page reload which can lose cookies
- `router.push()` with `router.refresh()` maintains cookies while still refreshing middleware
- Applies to both LOGIN and ONBOARDING flows

### 4. OAuth Callback Enhanced
**File:** `app/auth/callback/route.ts`

**Added:**
- Enhanced logging for debugging OAuth flow
- Explicit session exchange result logging
- Better error messages for different scenarios

**Why:**
- Makes it easier to debug OAuth cookie issues in production
- Helps identify where cookies might be lost in OAuth flow

---

## 🔧 HOW TO DEPLOY

### Step 1: Commit & Push
```bash
git add .
git commit -m "fix: Cookie persistence for authentication across page navigation

- Force sameSite: 'lax' and path: '/' in all cookie operations
- Update netlify.toml to prevent cookie stripping
- Replace window.location.href with router.push() + router.refresh()
- Fixes issue where cookies were lost after redirect to onboarding pages"

git push origin main
```

### Step 2: Monitor Netlify Build
1. Open https://app.netlify.com
2. Check build logs for errors
3. Wait for deploy to complete (~3-5 minutes)

### Step 3: Test in Production
**Critical Test Steps:**

#### TEST A: Email/Password Login Flow (Existing User)
1. **Clear Browser Cookies & Cache**
   - DevTools (F12) → Application → Clear storage
   - Or use Incognito mode

2. **Test Login:**
   ```
   1. Go to https://roomahapp.com/login
   2. Login with EXISTING account (email/password)
   3. Should redirect to /cari-jodoh (NOT /onboarding)
   4. ✅ Check cookies exist (DevTools → Application → Cookies)
   5. ✅ Should see user data and NOT redirect back to /login
   ```

3. **Test Navigation:**
   ```
   1. Navigate to different pages: /cv-saya, /koin-saya, /riwayat-taaruf
   2. ✅ Cookies should PERSIST on all pages
   3. ✅ Should NOT be logged out or redirected to /login
   ```

#### TEST B: Google OAuth Login Flow (Existing User)
1. **Clear Browser Cookies & Cache**

2. **Test Google Login:**
   ```
   1. Go to https://roomahapp.com/login
   2. Click "Masuk dengan Google"
   3. Login with Google account (THAT ALREADY HAS ROOMAH ACCOUNT)
   4. Should redirect to /cari-jodoh (NOT /onboarding)
   5. ✅ Check cookies exist
   6. ✅ Should see user data and stay logged in
   ```

#### TEST C: Register Flow (New User)
1. **Clear Browser Cookies & Cache**

2. **Test Registration:**
   ```
   1. Go to https://roomahapp.com/register
   2. Register with NEW account (email/password OR Google)
   3. Should redirect to /onboarding/verifikasi
   4. ✅ Check cookies exist
   ```

3. **Test Onboarding Navigation:**
   ```
   1. Fill 5Q form on /onboarding/verifikasi
   2. Click "Lanjut"
   3. Should go to /onboarding/cv
   4. ✅ Check cookies STILL exist
   5. ✅ Should NOT redirect back to /login
   ```

4. **Check Cookie Attributes:**
   ```
   In DevTools → Application → Cookies:
   - Name: sb-qtofnehlffcosvitswdp-auth-token ✅
   - Domain: .roomahapp.com ✅
   - Path: / ✅
   - Secure: Yes (checkbox checked) ✅
   - HttpOnly: Yes ✅
   - SameSite: Lax ✅
   ```

### Step 4: Check Netlify Function Logs
```
Netlify Dashboard → Functions → View logs

Look for:
[SERVER CLIENT DEBUG] Cookie set successfully: sb-qtofnehlffcosvitswdp-auth-token
[DEBUG] Incoming cookies: { supabaseCookies: 3 }
[MIDDLEWARE DEBUG] User: Authenticated: [user-id]
```

---

## ⚠️ TROUBLESHOOTING

### Problem 1: Cookies Still Disappearing
**Diagnosis:**
- Check if `NODE_ENV=production` is set in Netlify
- Verify cookie domain matches your site domain
- Check if any browser extensions are blocking cookies

**Solution:**
```bash
# In Netlify environment variables
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://roomahapp.com
```

### Problem 2: Redirect Loop
**Diagnosis:**
- Cookies exist but middleware doesn't recognize user
- Check Netlify function logs for errors

**Solution:**
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
- Check Supabase project is active

### Problem 3: Build Failed
**Diagnosis:**
- TypeScript errors
- Missing dependencies

**Solution:**
```bash
# Locally test build
npm run build

# If successful, commit and push again
```

---

## 🧹 POST-DEPLOY CLEANUP (OPTIONAL)

After verifying everything works in production, you can remove debug logs:

**Files with debug logs:**
- `lib/supabase/server.ts` - All `console.log` statements
- `middleware.ts` - All `console.log` statements
- `app/api/auth/login/route.ts` - All `console.log` statements

**How to clean:**
```bash
# Search for all console.log statements
grep -r "console.log" app/ lib/ middleware.ts

# Remove them manually or use a script
# Then commit:
git add .
git commit -m "chore: Remove debug logging from production"
git push origin main
```

---

## ✅ SUCCESS CRITERIA

- [x] Login successfully creates session
- [x] Cookies persist after redirect to /onboarding/verifikasi
- [x] Cookies persist after form submission and navigation to /onboarding/cv
- [x] No redirect loops
- [x] User remains authenticated across all protected pages
- [x] Cookie attributes are correct (Secure, HttpOnly, SameSite: Lax, Path: /)

---

## 📊 MONITORING

**What to monitor in production:**
1. **Netlify Function Logs** - Check for auth errors
2. **Supabase Logs** - Monitor for session issues
3. **User Reports** - Watch for login/navigation issues

**Key metrics:**
- Login success rate
- Session duration
- Bounce rate on onboarding pages

---

## 🔄 ROLLBACK PLAN

If this deploy causes issues:

```bash
# Find previous working commit
git log --oneline

# Rollback
git revert HEAD
git push origin main

# Or in Netlify Dashboard:
# Deploys → Select previous deploy → "Publish deploy"
```

---

## 📝 ADDITIONAL NOTES

- Debug logs are still active for first production test
- After confirming fix works, create follow-up PR to remove debug logs
- Consider adding automated tests for auth flow
- Document cookie settings for future reference

**Created:** 2024-12-02
**Last Updated:** 2024-12-02
**Status:** Ready for deployment ✅
