# Liravo — Setup Guide

Use the websites below; no terminal is needed. Choose **Supabase** for the simplest database setup. The same SQL file supports PostgreSQL 15+ on other hosts.

## 1. Create the database

### Supabase

1. Sign in at [supabase.com](https://supabase.com/dashboard).
2. Click **New project**, choose your organization and region, and save the database password in your password manager.
3. Wait until the project is ready.
4. Open **SQL Editor → New query**.
5. On GitHub, open [`supabase/migrations/001_schema.sql`](../supabase/migrations/001_schema.sql), click **Raw**, and copy the entire file.
6. Paste it into the SQL Editor and click **Run**. Run the whole file once, not selected portions.
7. Open **Table Editor** and confirm that `users`, `books`, `feature_flags`, and `affiliate_stores` exist.
8. Open `feature_flags`, find `telegram_auth`, and set `enabled` to **false**. Use Google sign-in for this Supabase setup.
9. Open **Project Settings → API / API Keys**. Copy the project URL, legacy `anon` key, and server-only `service_role` key. Keep the service key private.
10. Open **Storage → New bucket**, name it `avatars`, and enable **Public bucket**. Avatar writes go through the application server.

### Railway or another PostgreSQL host

1. Create a PostgreSQL database from your host's dashboard. Save its administrator credentials and connection details.
2. Open its browser SQL editor. If none is provided, deploy **pgAdmin** using Railway's template catalog and open the pgAdmin service's generated HTTPS URL.
3. In pgAdmin, sign in, right-click **Servers → Register → Server**, and enter the database host, port, administrator username, password, and required SSL settings.
4. Select the new database, then open **Tools → Query Tool**.
5. Copy the entire [`supabase/migrations/001_schema.sql`](../supabase/migrations/001_schema.sql) file from GitHub, paste it into the Query Tool, and click **Execute** once.
6. Refresh **Schemas → public → Tables** and confirm that `users`, `books`, `feature_flags`, and `affiliate_stores` exist.
7. Copy the database connection URL for the application. A Vercel deployment needs a publicly reachable database or pooler address; a Railway `.internal` address works only inside Railway.
8. Use transaction pooling when your host offers it. Use the direct database connection in the SQL editor. Configure the host's network access rules to allow your deployment and pgAdmin.

For DigitalOcean, create the database under **Databases → Create Database → PostgreSQL**. Create its pool under **Connection Pools → Create Pool → Transaction**. Use the connection details shown by DigitalOcean rather than guessing port numbers. The same pgAdmin steps apply.

Use an administrator connection for SQL setup. The application connection must retain access to the installed tables and service routines. Keep TLS enabled for public database connections.

## 2. Create Redis

1. Sign in at [upstash.com](https://console.upstash.com).
2. Click **Create Database → Redis**, choose a region near the application, and create it.
3. Open the database's **REST API** section.
4. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

Redis is required for rate limits, job locks, caching, and direct PostgreSQL sessions.

## 3. Create application secrets

1. Open your database's SQL editor and create a new query.
2. Paste and run:

   ```sql
   SELECT encode(sha256(convert_to(string_agg(gen_random_uuid()::text, ''), 'UTF8')), 'base64') AS secret
   FROM generate_series(1, 3);
   ```

3. Save the result as `AUTH_ENCRYPTION_KEY` in your password manager.
4. Run the query again and save the new result as `CRON_SECRET`.
5. Keep both values private and unchanged after deployment. The encryption key protects two-factor secrets.

## 4. Import the app into Vercel

1. Sign in at [vercel.com](https://vercel.com).
2. Click **Add New → Project → Import Git Repository** and select `nero1/liravo` or your fork.
3. Keep the **Next.js** preset and repository root directory.
4. Open **Environment Variables** and add the values below. Use your own deployment URL for `NEXT_PUBLIC_APP_URL`.
5. Leave unconfigured optional integrations blank; do not enter placeholder keys.

### Required for every deployment

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Your HTTPS application URL, without a trailing slash |
| `REDIS_PROVIDER` | `upstash` |
| `UPSTASH_REDIS_REST_URL` | From Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | From Upstash; server-only |
| `AUTH_ENCRYPTION_KEY` | First secret generated in Section 3 |
| `CRON_SECRET` | Second secret generated in Section 3 |

### Supabase database

| Variable | Value |
|---|---|
| `DATABASE_PROVIDER` | `supabase` |
| `NEXT_PUBLIC_DATABASE_PROVIDER` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase legacy `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase legacy `service_role` key; server-only |

### Direct PostgreSQL database

| Variable | Value |
|---|---|
| `DATABASE_PROVIDER` | `digitalocean` for DigitalOcean; `railway` for Railway or another direct PostgreSQL host |
| `NEXT_PUBLIC_DATABASE_PROVIDER` | Same value as `DATABASE_PROVIDER` |
| `DATABASE_URL` | Publicly reachable connection URL, preferably a transaction pooler |
| `DATABASE_POOL_MAX` | `5` |
| `DATABASE_SSL` | `true` for a public connection with valid TLS |

6. For direct PostgreSQL, complete object storage in Section 5 before deploying.
7. Click **Deploy**. After changing any environment variables, open **Deployments → latest deployment → Redeploy**.
8. Under **Project → Settings → Domains**, add your domain. Copy the DNS records Vercel displays into your registrar's DNS dashboard. If using Cloudflare, open **DNS → Records** and use **DNS only** while verifying the domain.
9. Update `NEXT_PUBLIC_APP_URL` to the final domain and redeploy.

Private keys belong only in server environment variables. Never put them in a variable beginning with `NEXT_PUBLIC_`, GitHub files, or browser code.

## 5. Set up avatars for direct PostgreSQL

Supabase users already created the `avatars` bucket in Section 1. For other database hosts:

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Open **R2 Object Storage → Create bucket**, name it `liravo-avatars`, and create it.
3. Open the bucket's **Settings → Public access**. Enable its public development URL for development, or connect a custom domain for production. Copy that public URL.
4. Open **R2 → Manage R2 API Tokens → Create API token**.
5. Choose **Object Read & Write**, restrict it to this bucket, and create the token.
6. Copy the access key ID, secret access key, and S3 endpoint shown by Cloudflare.
7. In **Vercel → Project → Settings → Environment Variables**, add:

   | Variable | Value |
   |---|---|
   | `S3_ENDPOINT` | Cloudflare's S3 endpoint |
   | `S3_REGION` | `auto` |
   | `S3_BUCKET` | `liravo-avatars` |
   | `S3_KEY` | Access key ID |
   | `S3_SECRET` | Secret access key |
   | `S3_CDN_URL` | Public bucket URL or custom domain |
   | `S3_OBJECT_ACL` | `none` |

8. Redeploy the application.

Backblaze B2, DigitalOcean Spaces, and AWS S3 also use these `S3_*` fields. Copy their endpoint, region, credentials, and public download URL from the provider dashboard.

## 6. Configure sign-in

### Google — Supabase web sign-in

1. Sign in at [console.cloud.google.com](https://console.cloud.google.com) and create or select a project.
2. Open **Google Auth Platform**, configure the branding and audience, and add yourself as a test user while the app is in testing.
3. Open **Clients → Create client → Web application**.
4. For Supabase, add the callback URL shown under **Supabase → Authentication → Sign In / Providers → Google** as an authorized redirect URI. Save the Google client ID and secret in that Supabase provider form and enable Google.
5. In **Supabase → Authentication → URL Configuration**, set **Site URL** to your application URL and add `https://YOUR-DOMAIN/api/auth/callback` to **Redirect URLs**.
6. Publish the Google consent configuration when you are ready for public users, then redeploy Vercel.

### Telegram — direct PostgreSQL mobile sign-in

1. Open Telegram in your browser, find the verified **@BotFather**, and select **Start**.
2. Send `/newbot`, follow its prompts, and save the token as `TELEGRAM_BOT_TOKEN` in Vercel.
3. Send `/setdomain`, choose your bot, and enter your application domain.
4. Redeploy Vercel, then enable Telegram under the application's **Admin → Auth Providers**.

Keep at least one working sign-in provider enabled.

### CAPTCHA — direct PostgreSQL

1. Sign in at [dashboard.hcaptcha.com](https://dashboard.hcaptcha.com).
2. Add a site for your application domain.
3. Add its site key as `HCAPTCHA_SITE_KEY` and its secret as `HCAPTCHA_SECRET_KEY` in Vercel.
4. Set `HCAPTCHA_ALLOWED_HOSTNAMES` to your application hostname, then redeploy.

## 7. Configure email

1. Sign in at [app.mailgun.com](https://app.mailgun.com).
2. Open **Sending → Domains → Add New Domain** and add a sending subdomain, such as `mg.example.com`.
3. Copy Mailgun's DNS records into your DNS provider and wait for verification.
4. Add `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, and `MAILGUN_FROM` in Vercel. Example sender: `Liravo <noreply@mg.example.com>`.
5. Redeploy and test a recovery email using your own account.

## 8. Become an administrator and add content

1. Open the deployed app and create your account. Supabase uses Google sign-in; direct PostgreSQL also supports email/password.
2. In **Supabase → Table Editor → users**, find your exact account, set `is_admin` to **true**, and save. With pgAdmin, use **Schemas → public → Tables → users → View/Edit Data** and save the same change.
3. Return to the app, refresh, and open `/admin/seed`.
4. Run these actions in order: **Create Liravo Editors Account → Seed Books → Seed Reading Lists → Seed Writing Prompts → Seed Writing Challenges**.
5. Wait for each success before continuing. Retry a failed action after fixing its displayed error.
6. Open **Admin → Feature Flags** and disable features whose external services you have not configured.
7. Open **Admin → Affiliate Stores** and replace sample tracking tags with your own approved affiliate tags.

## 9. Add optional services

Add their credentials under **Vercel → Project → Settings → Environment Variables**, then redeploy.

| Feature | Dashboard steps | Environment variables |
|---|---|---|
| AI recommendations and writing | Create API keys in DeepSeek and Google AI Studio | `AI_PRIMARY_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY` |
| Google Books | Google Cloud → APIs & Services → Library → Books API → Enable; create an API key | `GOOGLE_BOOKS_API_KEY` |
| Amazon affiliate links | Join Amazon Associates for each region; copy your tracking IDs | `AMAZON_ASSOCIATE_TAG_US`, `AMAZON_ASSOCIATE_TAG_UK`, `AMAZON_ASSOCIATE_TAG_CA`, `AMAZON_ASSOCIATE_TAG_AU` |
| Paystack | Settings → API Keys & Webhooks; start with test keys | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` |
| Dodo Payments | Create a test API key and a USD 4.99 monthly subscription product without trial, tax-inclusive pricing, discounts, or location pricing | `DODOPAYMENTS_API_KEY`, `DODOPAYMENTS_ENVIRONMENT=test_mode`, `DODOPAYMENTS_PREMIUM_PRODUCT_ID`, `DODOPAYMENTS_WEBHOOK_SECRET` |

In each payment provider dashboard, set the webhook URL to `https://YOUR-DOMAIN/api/webhooks/payments`. Save Dodo's signing secret as `DODOPAYMENTS_WEBHOOK_SECRET`. The endpoint handles subscriptions, tips, paid events, refunds, and payout updates.

Use the provider's sandbox to verify checkout, payment, cancellation, and refunds before enabling live payments. Keep test and live credentials separate.

## 10. Enable scheduled jobs

1. In Vercel, confirm `CRON_SECRET` is saved for Production and redeploy.
2. Open **Project → Cron Jobs**. The schedules in `vercel.json` are installed automatically and run in UTC.
3. Open the application's **Admin → Cron Status** to check results and run a job manually.
4. For more frequent outbox delivery or affiliate checks, sign in at [cron-job.org](https://cron-job.org), choose **Create cronjob**, and enter the matching `/api/cron/...` URL.
5. Under its advanced settings, use **POST** and add the header `Authorization: Bearer YOUR_CRON_SECRET`.
6. Choose the schedule, save, and run its test. Avoid scheduling the same job simultaneously in both services.

## 11. Verify and protect the deployment

1. Open `https://YOUR-DOMAIN/api/health`. Confirm the response reports healthy database and Redis checks; HTTP 200 alone is not enough.
2. Sign in, search for a book, add it to a shelf, upload an avatar, and save a reading update.
3. Switch between English, French, and German and check that pages load.
4. Open **Admin → Cron Status** and the **Admin Dashboard** and check job errors, payout requests, and payment returns.
5. Enable automated backups in your database provider's dashboard. Verify a backup restore into a separate test database before launch.
6. Enable two-factor authentication on your hosting, database, DNS, payment, and administrator accounts.

If a database connection fails, check its host, password, public network access, TLS, and pooler settings. If an API reports permission denied, reconnect the app with its server/service credentials; do not fix it by granting browser roles access to private fields or sensitive routines.
