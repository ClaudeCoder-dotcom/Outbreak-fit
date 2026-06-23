# Outbreak Fit — Web app (with optional Android wrapper)

This is a **Vite + React** web app. It runs in any browser, installs as a PWA
(add-to-home-screen, works offline), and can *also* be wrapped as an Android app
with Capacitor if you ever want the Play Store too. Same code either way.

Your save/login code talks to a swappable backend: an on-device fallback by
default, or **Supabase** for real cross-device accounts once you add credentials.

---

## Publish as a website (your main goal)

### 1. Install and run locally

```bash
npm install
npm run dev          # opens a local dev URL to play
npm run build        # outputs the static site to /dist
npm run preview      # serve the production build locally to test the PWA
```

### 2. Deploy the static site

`dist/` is a plain static site — host it anywhere. Easiest options:

- **Vercel:** `npm i -g vercel` then `vercel` in the project (or connect the repo
  at vercel.com). Build command `npm run build`, output dir `dist`.
- **Netlify:** drag-and-drop the `dist/` folder at app.netlify.com/drop, or
  connect the repo with build `npm run build` and publish dir `dist`.
- **Cloudflare Pages / GitHub Pages:** same idea — build `npm run build`, serve
  `dist`. (Asset links are relative, so subpaths like GitHub Pages work too.)

You need **HTTPS** for the PWA/service worker — all the hosts above give it free.

### 3. Turn on real accounts (Supabase)

Follow **section "Real login (Supabase)"** below, then set your deployed site's
URL as the **Site URL** in Supabase → Authentication → URL Configuration so that
email confirmation and password-reset links point back to your site.

### PWA / installable

- `public/manifest.webmanifest` + `public/sw.js` are already wired in.
- After deploying over HTTPS, browsers show an **Install** / **Add to Home
  Screen** prompt; the app then launches fullscreen with its own icon and works
  offline (login and cloud-save still need a connection).
- Icons live in `public/` (`icon-192.png`, `icon-512.png`, maskable + Apple).
  Replace them with your own art at the same sizes/filenames anytime.

---

## Real login (Supabase) — accounts, verification, password reset, cloud saves

1. Create a free project at https://supabase.com.
2. **Project Settings → API**: copy the **Project URL** and the **anon public** key
   into `src/supabase.js`.
3. In the Supabase **SQL editor**, run this to create the cloud-save table with
   per-user security (each player can only read/write their own save):

   ```sql
   create table public.saves (
     user_id    uuid primary key references auth.users on delete cascade,
     data       jsonb,
     updated_at timestamptz default now()
   );

   alter table public.saves enable row level security;

   create policy "players manage their own save"
     on public.saves for all
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);
   ```

4. **Authentication → Providers → Email** is on by default. Leave
   "Confirm email" enabled for real verification (players get a confirm link
   before they can log in). To skip verification during testing, turn it off.
5. **Authentication → URL Configuration**: set the **Site URL** to your deployed
   website so confirmation and password-reset links point back to your site.

That's it — no game code changes. `src/main.jsx` detects the credentials and
switches the whole app from the local fallback to Supabase automatically.

---

## Optional: also ship to the Play Store (Capacitor)

Skip this entirely if web is all you want. If you do want a store app from the
same code, you'll need **Node.js 18+**, **Android Studio** (Android SDK), and a
**Google Play Developer account** (one-time $25). Then:

## 2. Add the Android project

```bash
npm run build            # builds the web app into /dist
npx cap add android      # creates the native android/ project (first time only)
npx cap sync android     # copies the build into android/
```

From then on, after any code change:

```bash
npm run sync             # = build + cap sync android
```

---

## 3. Open in Android Studio and test on a device

```bash
npx cap open android
```

In Android Studio: press **Run ▶** with an emulator or a USB-connected phone
(enable Developer Options + USB debugging on the phone). The camera-scanner
note from earlier doesn't apply here — this game has no native permissions.

---

## 4. App identity (do this before publishing)

- **Package name / appId:** currently `com.bubblezandsnow.outbreakfit`
  in `capacitor.config.json`. This is permanent on the Play Store — change it
  now if you want something else, then re-run `npx cap sync android`.
- **App icon & splash:** easiest is the `@capacitor/assets` tool:
  ```bash
  npm i -D @capacitor/assets
  # put a 1024x1024 icon.png and splash.png in an assets/ folder, then:
  npx capacitor-assets generate --android
  ```
- **Display name:** `android/app/src/main/res/values/strings.xml` → `app_name`.

---

## 5. Build a signed release (App Bundle / .aab)

Google Play requires an **.aab** signed with an upload key.

1. Create your key (one time, keep it safe — losing it means you can't update the app):
   ```bash
   keytool -genkey -v -keystore outbreak-upload.keystore \
     -alias outbreak -keyalg RSA -keysize 2048 -validity 10000
   ```
2. In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**,
   select your keystore, build the **release** variant.
   Output: `android/app/release/app-release.aab`.

---

## 6. Publish on the Play Console

1. Go to https://play.google.com/console → **Create app**.
2. Fill the listing: name, short + full description, screenshots
   (grab them from your phone), a 512×512 icon, a 1024×500 feature graphic.
3. Complete the required questionnaires:
   - **Content rating** (it's a mild cartoon-violence game — answer honestly).
   - **Data safety** — this app stores progress **only on the device** and
     collects nothing, which is simple to declare.
   - **Target audience / ads / privacy policy** as prompted.
4. **Release → Production → Create release**, upload the `.aab`, roll out.
5. First submission review usually takes a few days.

---

## Notes that matter for review & for you

- **Loot crates:** they cost only in-game coins (no real-money purchase) and
  show their odds. That keeps you clear of Play's real-money loot-box rules.
  If you ever add real-money purchases, you must disclose odds and handle
  age/gambling policies — a much bigger compliance step.
- **Dev cheat (5 taps on the title = +coins/+levels):** already guarded — it
  only runs when `import.meta.env.DEV` is true (`npm run dev` and previews), and
  is compiled out of production release builds automatically.
- **Fitness disclaimer:** already added — a one-time "consult a doctor / train
  at your own risk" screen appears after first login and must be accepted.
- **Cross-device saves:** once Supabase is wired (section 1b), each player's
  progress is stored against their account and follows them to any device they
  log in on. The local fallback (no credentials) keeps saves on one device only.
