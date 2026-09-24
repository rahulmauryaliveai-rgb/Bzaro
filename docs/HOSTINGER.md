# Going live on Hostinger

Step-by-step for putting `bzaro.in` and every `*.bzaro.in` seller website on a
Hostinger **VPS**. Everything technical is scripted in `deploy/`; this page is
the order to do things in and the handful of values you have to supply.

> **Why a VPS and not Hostinger's web hosting?** Bzaro needs PostgreSQL, a
> long-running Node server, a second worker process, cron jobs and TLS for
> every seller subdomain. Shared/"Business" web hosting offers MySQL, one Node
> app and no subdomain certificates — it cannot run this project. KVM 2 (2 vCPU, 8 GB)
> is the right size; KVM 1 works but the build is tight on memory.

---

## 0. What you need before starting (15 min)

| Item                                     | Where                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Hostinger VPS, **Ubuntu 24.04** image    | hpanel → VPS → Buy → choose "Ubuntu 24.04" (plain OS, not a Docker/OpenLiteSpeed template) |
| The VPS IP and root password             | hpanel → VPS → Overview                                                                    |
| DNS `A` records `@`, `www`, `*` → VPS IP | hpanel → Domains → bzaro.in → DNS (see §2)                                                 |
| An SSH client                            | Windows Terminal / PowerShell: `ssh root@<ip>`                                             |

The GitHub repo `rahulmauryaliveai-rgb/Bzaro` must be reachable from the VPS.
If it is private, either make it public or add a deploy key (§6) before §3.

---

## 1. Create the VPS

1. hpanel → **VPS** → pick KVM 2 → OS **Ubuntu 24.04** → complete purchase.
2. Set the root password when asked and note the **IP address**.
3. From your PC:

   ```bash
   ssh root@<VPS-IP>
   ```

   Accept the fingerprint, enter the password. You are on the server.

---

## 2. DNS (at Hostinger — nothing to move)

In **hPanel → Domains → bzaro.in → DNS / Name Servers**, make sure these three
`A` records exist, all pointing at the VPS IP:

| Type | Name  | Points to  |
| ---- | ----- | ---------- |
| A    | `@`   | `<VPS-IP>` |
| A    | `www` | `<VPS-IP>` |
| A    | `*`   | `<VPS-IP>` |

The `*` record is what makes every seller subdomain resolve the instant the
seller registers — no per-seller DNS ever (docs/DEPLOYMENT.md §2).

**Certificates** are issued by Caddy on the VPS: the apex at startup, and each
seller subdomain the first time it is visited (HTTP challenge, gated by
`/api/tls/ask` so only real sellers get one). No Cloudflare account, no DNS API
token. The trade-off is a one-time ~2–5 s delay on a subdomain's very first
request; a true wildcard certificate can be added later by moving DNS to a
provider Caddy has a module for (docs/DEPLOYMENT.md §3).

---

## 3. Run the setup script (one command, ~10 min)

On the VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/rahulmauryaliveai-rgb/Bzaro/main/deploy/setup-vps.sh -o setup-vps.sh && sudo bash setup-vps.sh
```

It asks for four things — the domain, an email for certificate notices, and
the email + password of the first administrator — then:

1. installs Docker, Node 22 and pm2; opens ports 22/80/443 in the firewall;
2. clones the repo to `/srv/bzaro/app`;
3. generates every secret and writes `/srv/bzaro/app/.env` and
   `deploy/.env` (never overwritten on re-runs);
4. starts PostgreSQL, Redis and Caddy in Docker (`deploy/compose.yml`);
5. installs, migrates, builds and starts the app + lead worker under pm2;
6. seeds plans, storefront templates, the 412-category taxonomy and your admin
   account — **no demo sellers, no demo passwords** (`npm run db:seed:prod`);
7. installs the cron jobs (`deploy/crontab`) and makes pm2 start on reboot.

Caddy obtains the apex certificate at startup and each seller subdomain's on
its first visit.

---

## 4. Verify

From your PC:

```bash
curl -sI https://bzaro.in | head -1
```

```bash
curl -sI https://never-visited-before.bzaro.in | head -1
```

The apex must answer `200`. The unknown subdomain is refused a certificate
(by design — `/api/tls/ask` only approves real sellers), so test a seller you
have registered instead: `curl -sI https://<slug>.bzaro.in | head -1` → `200`,
with a few seconds' delay the very first time. Then in a browser:

- `https://bzaro.in` — marketplace homepage.
- `https://bzaro.in/login` → sign in with the admin email/password → `/admin`.
- `https://bzaro.in/register` → create a real seller, pick a theme → that
  seller's site at `https://<slug>.bzaro.in`.

On the VPS:

```bash
pm2 status
```

`bzaro-web` and `bzaro-worker` both `online`. Logs: `pm2 logs bzaro-web`,
`pm2 logs bzaro-worker`, `docker logs bzaro-caddy`, `/var/log/bzaro/cron.log`.

---

## 5. Redeploying after a code change

Push to `main` on GitHub, then on the VPS:

```bash
bash /srv/bzaro/app/deploy/deploy.sh
```

Pulls, installs, runs new migrations, builds and reloads pm2. Takes 2–4
minutes; the site may error for ~30 s while `.next` is rebuilt. Everything in
`.env` and `public/uploads` survives.

### The destructive-migration guard

`prisma migrate deploy` never prompts, so `deploy.sh` checks the **pending**
migrations first and refuses if any of them drops a table or deletes rows:

```
✗ a pending migration destroys data:
  20260923120000_buyer_email_auth_and_commerce
      25:DELETE FROM "Requirement";
      62:DROP TABLE "Buyer";
```

That is not a bug to work around. Take the backup it prints, confirm you are
willing to lose those rows, then re-run with the override:

```bash
docker exec bzaro-postgres pg_dump -U bzaro bzaro > ~/bzaro-$(date +%F-%H%M).sql
ALLOW_DESTRUCTIVE_MIGRATION=1 bash /srv/bzaro/app/deploy/deploy.sh
```

A brand-new database has nothing to lose, so the guard skips itself entirely on
a first deploy. Migrations that are already applied are never re-checked.

### Before the buyer-accounts release

That release replaces the phone-OTP buyer with a full account (decision D35),
and it needs two values in `.env` that older installs do not have:

| Variable                      | Why it matters                                                            |
| ----------------------------- | ------------------------------------------------------------------------- |
| `RESEND_API_KEY` + `MAIL_FROM` | Signup codes are emailed. **Without these nobody can create an account**, so the lead funnel is dead — this is a hard blocker, not a degradation |
| `INTEGRATIONS_ENCRYPTION_KEY`  | Encrypts each seller's Razorpay/Shiprocket keys. Without it no seller can switch payments on. Must decode to exactly 32 bytes: `openssl rand -base64 32` |

`setup-vps.sh` generates the encryption key on a fresh install. On an existing
box, add it by hand — and never rotate it once sellers have saved credentials,
because it makes every stored credential unreadable.

Turnstile (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET`) is optional:
unset means the signup captcha is simply not enforced. Once the secret is set
it fails **closed**.


---

## 6. Private repository

If the GitHub repo is private, the VPS needs read access:

```bash
ssh-keygen -t ed25519 -N "" -f /root/.ssh/id_ed25519 -C bzaro-vps && cat /root/.ssh/id_ed25519.pub
```

GitHub → repo → **Settings → Deploy keys → Add** → paste (read-only). Then run
the setup with the SSH URL:

```bash
REPO_URL=git@github.com:rahulmauryaliveai-rgb/Bzaro.git sudo -E bash setup-vps.sh
```

---

## 7. What is still optional / next

| Capability                | Now                                          | To enable                                                                                                                        |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Buyer OTP / lead WhatsApp | codes and alerts print to `pm2 logs`         | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` in `.env`                                                                    |
| Transactional email       | printed to `pm2 logs`                        | `RESEND_API_KEY`, `MAIL_FROM`                                                                                                    |
| Image hosting             | VPS disk, served by Caddy (`public/uploads`) | Cloudinary keys + remove `MEDIA_LOCAL_UPLOADS`                                                                                   |
| Google sign-in            | off                                          | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                                                                           |
| Payments (Razorpay)       | not built — admin assigns plans              | later phase (D32)                                                                                                                |
| Custom domains (Pro plan) | held                                         | later phase                                                                                                                      |
| Backups                   | none                                         | hpanel → VPS → **Snapshots/Backups** (weekly is included) — and `docker exec bzaro-postgres pg_dump -U bzaro bzaro > backup.sql` |

After editing `.env`: `pm2 restart all --update-env`.

---

## 8. If something is wrong

| Symptom                                   | Check                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser: certificate error on a subdomain | `docker logs bzaro-caddy` — port 80 must be reachable (ufw), and the slug must belong to a seller: `curl "http://127.0.0.1:3000/api/tls/ask?domain=<slug>.bzaro.in"` → 200 |
| `bzaro.in` times out                      | DNS not propagated yet (`nslookup bzaro.in`), or ufw: `ufw status`                                                                                                         |
| 502 from Caddy                            | app down: `pm2 logs bzaro-web --lines 100`                                                                                                                                 |
| Boot error mentioning `UPSTASH`           | `docker ps` — `bzaro-redis-http` must be running; token in `.env` must equal `SRH_TOKEN` in `deploy/.env`                                                                  |
| `Connection terminated unexpectedly`      | `docker ps` — `bzaro-postgres` restarted; app reconnects, or `pm2 restart bzaro-web`                                                                                       |
| Uploads say "not available"               | `MEDIA_LOCAL_UPLOADS="1"` missing from `.env`                                                                                                                              |
| Build killed / out of memory              | upgrade to KVM 2, or add swap: `fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`                                                  |

---

## 9. Showcase (demo) sellers for presentations

Production seeds no demo data. For demos, add six fully populated showcase
sellers — Gold plan, verified, different templates/categories/cities, each
with products, services, a gallery, and a few open buyer requirements that
the lead worker turns into leads:

```bash
cd /srv/bzaro/app && DEMO_CREDENTIALS_FILE=/root/bzaro-demo-credentials.txt npm run db:seed:showcase
```

Logins are `demo-<slug>@bzaro.in` with random passwords written to that file
(created once; re-runs never rotate them). Their storefronts are non-indexable
and their phone numbers are in the reserved `99999` range. Remove everything
in one go before real sellers should see a clean marketplace:

```bash
cd /srv/bzaro/app && npm run db:seed:showcase -- --remove
```
