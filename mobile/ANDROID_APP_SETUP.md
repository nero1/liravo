# Android App Setup Guide

> This guide explains how to build the Liravo Android app (APK or AAB) from source using Expo Application Services (EAS). No local Android SDK installation is needed — Expo builds everything in the cloud.

---

## What You Need Before You Start

1. **An Expo account** — sign up free at [expo.dev](https://expo.dev)
2. **An EAS project** — created from the Expo dashboard (steps below)
3. **The `mobile/` folder** pushed to your GitHub repo (already done)
4. **Your environment variables** from `mobile/.env.example` — you'll enter these in the EAS dashboard

---

## Key Terms

| Term | What it means |
|---|---|
| **APK** | Android Package — a file you can install directly on a phone (sideload). Good for testing. |
| **AAB** | Android App Bundle — the format Google Play Store requires for publishing. |
| **EAS Build** | Expo's cloud build service. Compiles your app without you needing Android Studio. |
| **Development build** | A debug version of the app with extra tools for developers. |
| **Preview build** | A release-like APK for testing — closest to what users will get, minus the Play Store. |

---

## Option A — Build via the Expo Website (Recommended for Beginners)

### Step 1 — Connect your repo to Expo

1. Go to [expo.dev](https://expo.dev) and log in.
2. Click **Create a project** → give it the name `liravo`.
3. In the project settings, copy the **Project ID** (looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
4. Open `mobile/app.json` and paste it in:
   ```json
   "extra": {
     "eas": {
       "projectId": "YOUR-PROJECT-ID-HERE"
     }
   }
   ```
5. Push that change to GitHub.

### Step 2 — Add your environment variables

1. In the Expo dashboard, open your project → **Environment variables**.
2. Add each variable from `mobile/.env.example`:
   - `EXPO_PUBLIC_API_URL` → your backend URL (e.g. `https://liravo.org`)
   - `EXPO_PUBLIC_DATABASE_PROVIDER` → `supabase` or `digitalocean`
   - If using Supabase: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` → your Stripe publishable key (for Google Pay)
3. Set the **Visibility** of each to **Secret** so they aren't exposed in logs.

### Step 3 — Trigger a build

1. In your project on expo.dev, go to **Builds** → **New build**.
2. Select:
   - **Platform**: Android
   - **Profile**: `preview` (gives you an APK you can install directly on a phone)
3. Click **Start build**.
4. Wait ~10–20 minutes. Expo emails you when it's done.
5. Download the `.apk` file from the build page and install it on your Android device.

> To get an **AAB** for the Play Store, repeat with profile `production` instead of `preview`.

---

## Option B — Build via the CLI

Use this if you're comfortable with a terminal, or want to automate builds in CI.

### Prerequisites

```bash
npm install -g eas-cli
eas login          # log in with your Expo account
```

### Build commands

```bash
cd mobile

# Install dependencies first
npm install

# APK for testing (installs directly on device)
eas build --platform android --profile preview

# APK for development (includes Expo dev tools)
eas build --platform android --profile development

# AAB for Play Store submission
eas build --platform android --profile production
```

Each command queues a cloud build and prints a URL to track progress. The resulting file is downloadable from that URL or from the Expo dashboard.

### Build profiles explained

These are defined in `mobile/eas.json`:

```json
{
  "build": {
    "development": { "android": { "buildType": "apk" } },
    "preview":     { "android": { "buildType": "apk" } },
    "production":  { "android": { "buildType": "app-bundle" } }
  }
}
```

Use `preview` day-to-day for testing. Use `production` only when submitting to the Play Store.

---

## Option C — GitHub Actions (Automated CI Builds)

You can trigger EAS builds automatically on every push to `main`.

Create `.github/workflows/android.yml` in the repo root:

```yaml
name: Android Build

on:
  push:
    branches: [main]
    paths:
      - 'mobile/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install EAS CLI
        run: npm install -g eas-cli

      - name: Build preview APK
        working-directory: mobile
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        run: eas build --platform android --profile preview --non-interactive
```

You'll need to add `EXPO_TOKEN` as a GitHub secret. Get it from expo.dev → **Account settings** → **Access tokens**.

---

## Installing the APK on Your Phone

1. On your Android phone, go to **Settings → Apps → Special app access → Install unknown apps**.
2. Allow your browser (or Files app) to install APKs.
3. Open the `.apk` download on your phone and tap **Install**.

> This is called "sideloading". It's safe for your own app — just don't sideload APKs from sources you don't trust.

---

## Deep Linking Setup

Deep linking lets a URL like `https://liravo.org/user/johndoe` open directly inside the app instead of the browser.

Liravo uses two mechanisms:

### 1. Custom scheme links (always works, no setup required)

These work out of the box because `mobile/app.json` already has:
```json
"scheme": "liravo"
```

A link like `liravo://user/johndoe` will open the app if it's installed. This is used internally for OAuth redirects and push notification taps.

### 2. Universal / HTTPS links (branded URLs like `liravo.org/user/johndoe`)

This makes real `https://liravo.org` URLs open the app. It requires a bit of one-time server setup.

**Step 1 — Create the asset links file on your server**

Create a file at exactly this URL on your backend:
```
https://liravo.org/.well-known/assetlinks.json
```

With this content (replace `FINGERPRINT` with your app's SHA-256 signing certificate):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "org.liravo.app",
    "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT_HERE"]
  }
}]
```

To get your fingerprint:
```bash
eas credentials --platform android
```
Look for the **SHA-256 Certificate Fingerprint** in the output.

**Step 2 — Add the intent filter in app.json**

Add this under `android` in `mobile/app.json`:
```json
"android": {
  "package": "org.liravo.app",
  "intentFilters": [
    {
      "action": "VIEW",
      "autoVerify": true,
      "data": [
        { "scheme": "https", "host": "liravo.org" }
      ],
      "category": ["BROWSABLE", "DEFAULT"]
    }
  ]
}
```

**Step 3 — Handle the URL in the app**

Expo Router automatically maps incoming URLs to screens using the same file-based routing. Since the app already has `app/user/[username].tsx`, a tap on `https://liravo.org/user/johndoe` will automatically open that screen. No extra code needed.

**Step 4 — Rebuild**

Deep linking changes require a new build (they're baked into the APK). Trigger a new `preview` build after making these changes.

### Testing deep links

On a device with the app already installed:
```bash
# Test custom scheme
adb shell am start -W -a android.intent.action.VIEW -d "liravo://user/johndoe"

# Test HTTPS universal link
adb shell am start -W -a android.intent.action.VIEW -d "https://liravo.org/user/johndoe"
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Build fails with "missing credentials" | Run `eas credentials` in the `mobile/` folder to generate a keystore |
| App installs but shows blank screen | Check that `EXPO_PUBLIC_API_URL` is set correctly in EAS environment variables |
| Google Pay button doesn't appear | The device must have Google Pay set up and a card added |
| Deep links open the browser instead of the app | The `assetlinks.json` file must be reachable at the exact URL with `Content-Type: application/json` |
| Build says "project not found" | Make sure the `projectId` in `app.json` matches your Expo dashboard |
