# reCAPTCHA Key Type Error - Fix

## ⚠️ Problem: Invalid Key Type

You're seeing "Error for site owner: Invalid key type" because your key is for **reCAPTCHA v3**, but the site is using **v2 ("I'm not a robot" Checkbox)**.

---

## ✅ Solution: Create a New reCAPTCHA v2 Key

### Step 1: Visit Google reCAPTCHA Admin
Go to: https://www.google.com/recaptcha/admin/create

### Step 2: Register a New Site
Fill out the form:

**Label:** STEAMplitude

**reCAPTCHA type:** Select **"reCAPTCHA v2"**
- ✅ Choose: **"I'm not a robot" Checkbox**
- ❌ NOT "reCAPTCHA v3"

**Domains:**
- `localhost` (for testing)
- `steamplitude.com` (your production domain)
- Any other domains you'll use

**Accept the Terms** and click **Submit**

### Step 3: Copy Your NEW Keys
You'll get TWO keys:
1. **Site Key** (public) - for frontend
2. **Secret Key** (private) - for backend

### Step 4: Update Your .env File
Replace the current key with your NEW v2 Site Key:

```bash
VITE_RECAPTCHA_SITE_KEY=your_new_v2_site_key_here
```

### Step 5: Restart Dev Server
Stop and restart:
```bash
# Press Ctrl+C to stop
npm run dev
```

---

## 🔍 How to Check Your Current Key Type

1. Visit: https://www.google.com/recaptcha/admin
2. Find your key in the list
3. Check the "Type" column - it should say **"v2 Checkbox"**, not "v3"

---

## 📋 Key Differences

### reCAPTCHA v2 (What we need):
- ✅ Shows "I'm not a robot" checkbox
- ✅ Sometimes shows image challenges
- ✅ User interaction required
- ✅ Works with `react-google-recaptcha` package

### reCAPTCHA v3 (What you have):
- ❌ Invisible, no checkbox
- ❌ Scores user interactions
- ❌ No user interaction
- ❌ Different implementation

---

## 🚀 Quick Fix Steps

1. **Create new v2 key** at https://www.google.com/recaptcha/admin/create
2. **Copy the Site Key**
3. **Update `.env`** file with new key
4. **Restart dev server**
5. **Test** at http://localhost:5174/contact

---

## 💡 Alternative: Use reCAPTCHA v3

If you prefer invisible reCAPTCHA (v3), we'd need to change the implementation:

### Pros of v3:
- No user interaction needed
- Better UX (invisible)
- Scores users (0.0-1.0)

### Cons of v3:
- Different code needed
- More complex backend logic
- No visual confirmation for users

**Recommendation:** Stick with v2 Checkbox for now - it's simpler and users expect it.

---

## 🆘 Still Having Issues?

If you continue to see errors after creating a v2 key:

1. **Double-check key type** on Google admin console
2. **Make sure domains match** (localhost for dev)
3. **Clear browser cache** and hard refresh
4. **Check console** for specific error messages

---

## ✉️ Need Help?

Send me your NEW v2 Site Key once you've created it, and I'll update it for you!

**Remember:** We need the **v2 "I'm not a robot" Checkbox** key, not v3.
