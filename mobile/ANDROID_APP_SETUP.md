# Android App Setup Guide

> This guide explains how to build the Liravo Android app (APK or AAB), set up Google Play Billing for in-app subscriptions, configure deep links, and submit to the Play Store. No local Android SDK installation is needed — Expo builds everything in the cloud.

---

## What You Need Before You Start

1. **An Expo account** — sign up free at [expo.dev](https://expo.dev)
2. **A Google Play Console account** — one-time $25 registration fee at [play.google.com/console](https://play.google.com/console)
3. **A Google Cloud Console account** — free, used for service account credentials
4. **The `mobile/` folder** pushed to your GitHub repo (already done)
5. **Your environment variables** from `mobile/.env.example`

---

## Key Terms

| Term | What it means |
|---|---|
| **APK** | Android Package — install directly on a phone (sideload). Good for testing. |
| **AAB** | Android App Bundle — what the Play Store requires. Google converts it to APKs per device. |
| **EAS Build** | Expo's cloud build service. No Android Studio needed. |
| **Preview build** | Release-like APK for testing — closest to what Play Store users get. |
| **Google Play Billing** | Google's mandatory payment system for digital subscriptions sold through the Play Store. Google takes 15% commission. |
| **RTDN** | Real-time Developer Notifications — Google pushes subscription lifecycle events (renewed, cancelled, expired) to your server. |

---

## Part 1 — Building the App

### Option A — Expo Website (Recommended for Beginners)

#### Step 1 — Connect your repo to Expo

1. Go to [expo.dev](https://expo.dev) and log in.
2. Click **Create a project** → name it `liravo`.
3. Copy the **Project ID** from the project settings.
4. Open `mobile/app.json` and paste it:
   ```json
   "extra": { "eas": { "projectId": "YOUR-PROJECT-ID-HERE" } }
   ```
5. Push that change to GitHub.

#### Step 2 — Add environment variables

1. In your Expo project → **Environment variables**, add:
   - `EXPO_PUBLIC_API_URL` → `https://liravo.org`
   - `EXPO_PUBLIC_DATABASE_PROVIDER` → `supabase` or `digitalocean`
   - If Supabase: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - If DigitalOcean: `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID` (see below)
2. Set every variable to **Secret** visibility.

> **Getting the Android Google Client ID (DigitalOcean mode only):**
> 1. Google Cloud Console → **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID** → type: **Android**
> 2. Package name: `org.liravo.app`. SHA-1 fingerprint: run `eas credentials --platform android` and copy it.
> 3. Also create a **Web application** OAuth client. Add `https://auth.expo.io/@your-expo-username/liravo` as an allowed redirect URI.
> 4. Use the Android client ID as `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`.

#### Step 3 — Trigger a build

1. **Builds** → **New build** → Platform: Android → Profile: `preview` → **Start build**.
2. Wait ~15 minutes. Download the `.apk` when done and install it on your device.

> For Play Store submission, use profile `production` — this produces an `.aab` file.

---

### Option B — CLI

```bash
npm install -g eas-cli
eas login

cd mobile
npm install

eas build --platform android --profile preview      # APK for testing
eas build --platform android --profile production   # AAB for Play Store
```

---

### Option C — GitHub Actions (Automated Builds)

Create `.github/workflows/android.yml`:

```yaml
name: Android Build
on:
  push:
    branches: [main]
    paths: ['mobile/**']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install -g eas-cli
      - working-directory: mobile
        env: { EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }} }
        run: eas build --platform android --profile preview --non-interactive
```

Get `EXPO_TOKEN` from expo.dev → **Account settings** → **Access tokens**.

---

### Installing a Preview APK on Your Phone

1. **Settings → Apps → Special app access → Install unknown apps** → allow your Files app.
2. Open the downloaded `.apk` on your phone → **Install**.

---

## Part 2 — Google Play Billing (Subscriptions)

This is required to sell the Premium subscription through the Play Store. Google takes 15% on your first $1M/year.

### Step 1 — Create the app in Play Console

1. Go to [play.google.com/console](https://play.google.com/console) → **Create app**.
2. Package name: `org.liravo.app` — must match `mobile/app.json` exactly.
3. Upload your first `.aab` file (production build) to **Internal testing** to activate the app.

### Step 2 — Create the subscription product

1. Play Console → your app → **Monetize** → **Subscriptions** → **Create subscription**.
2. **Product ID**: `liravo_premium_monthly` — this must match `mobile/constants/iap.ts` exactly.
3. Name: `Liravo Premium`.
4. Set the price to $4.99/month. Play automatically converts to local currencies.
5. Click **Save** then **Activate**.

### Step 3 — Service account for server-side verification

Your backend needs to verify purchase tokens with Google Play's API. This requires a service account.

1. **Google Cloud Console** → select (or create) the same project as your Play Console → **IAM & Admin** → **Service accounts** → **Create service account**.
2. Name it `play-billing`. Grant it no Cloud IAM roles (not needed). Click **Done**.
3. Click the service account → **Keys** → **Add key** → **JSON**. Download the key file.
4. Back in **Play Console** → **Setup** → **API access** → **Link to Google Cloud project** (link the same project). Then under **Service accounts**, grant the play-billing account **Financial data viewer** access.
5. Copy the entire contents of the JSON key file. Open `.env.local` on your server and add:
   ```
   GOOGLE_PLAY_SERVICE_ACCOUNT_KEY={"type":"service_account", ... paste the entire JSON on one line ... }
   GOOGLE_PLAY_PACKAGE_NAME=org.liravo.app
   ```

### Step 4 — Real-time Developer Notifications (RTDN)

RTDN keeps your database in sync when subscriptions renew, cancel, or expire — even when the user is offline.

1. **Google Cloud Console** → **Pub/Sub** → **Topics** → **Create topic**. Name it `play-rtdn`. Copy the full topic name (looks like `projects/your-project/topics/play-rtdn`).
2. Click the topic → **Subscriptions** → **Create subscription**:
   - Delivery type: **Push**
   - Endpoint URL: `https://liravo.org/api/mobile/rtdn?secret=YOUR_RTDN_SECRET`
   - Expiration: **Never expire**
3. **Play Console** → your app → **Monetize** → **Subscriptions** → **Real-time developer notifications** → paste the full Pub/Sub topic name → **Save**.
4. Add to your server `.env.local`:
   ```
   GOOGLE_PLAY_RTDN_SECRET=YOUR_RTDN_SECRET
   ```
   Use any long random string as the secret (e.g., `openssl rand -hex 32`).

The backend endpoint `POST /api/mobile/rtdn` is already implemented. It handles all subscription lifecycle events (renewed, cancelled, expired, grace period, etc.) and keeps `users.is_premium` accurate automatically.

### How it all works end-to-end

```
User taps "Subscribe" in app
        ↓
Google Play Billing sheet appears (Google's native UI — Google handles payment)
        ↓
User approves with their Google account / card / Google Pay method
        ↓
App receives a purchaseToken
        ↓
App calls POST /api/mobile/verify-purchase with the token
        ↓
Backend verifies token with Google Play API using the service account
        ↓
Backend sets users.is_premium = true, creates subscription record
        ↓
App updates UI immediately — user has Premium
        ↓
(Later, when subscription renews or cancels...)
        ↓
Google sends RTDN notification to POST /api/mobile/rtdn
        ↓
Backend updates is_premium automatically
```

---

## Part 3 — Deep Linking

Deep linking lets `https://liravo.org/user/johndoe` open the app instead of the browser.

### Custom scheme (works automatically)

`mobile/app.json` already has `"scheme": "liravo"`. Links like `liravo://user/johndoe` open the app if installed.

### HTTPS Universal Links

#### Step 1 — Add asset links to your server

Create a route at `https://liravo.org/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "org.liravo.app",
    "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
  }
}]
```

Get your fingerprint:
```bash
eas credentials --platform android
# Look for "SHA-256 Certificate Fingerprint"
```

#### Step 2 — Add intent filter in app.json

Under `android` in `mobile/app.json`:
```json
"intentFilters": [{
  "action": "VIEW",
  "autoVerify": true,
  "data": [{ "scheme": "https", "host": "liravo.org" }],
  "category": ["BROWSABLE", "DEFAULT"]
}]
```

Rebuild after this change — it's baked into the APK.

#### Step 3 — Test

```bash
adb shell am start -W -a android.intent.action.VIEW -d "https://liravo.org/user/johndoe"
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Item not found" when subscribing | The subscription product isn't activated in Play Console, or you're testing with a development build (billing only works in signed release builds on a real device) |
| Purchase goes through but Premium not activated | Check that `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` is set on the server and the service account has **Financial data viewer** in Play Console |
| RTDN not firing | Verify the Pub/Sub topic name is correct in Play Console, and that the push subscription endpoint URL is publicly reachable |
| Build fails with "missing credentials" | Run `eas credentials --platform android` to generate or import a keystore |
| Deep links open browser instead of app | `assetlinks.json` must be served with `Content-Type: application/json` and no redirect |
| "Project not found" during build | The `projectId` in `app.json` must match your Expo dashboard |
