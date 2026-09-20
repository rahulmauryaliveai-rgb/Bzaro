# Going live on Hostinger

Step-by-step for putting `bzaro.in` and every `*.bzaro.in` seller website on a
Hostinger **VPS**. Everything technical is scripted in `deploy/`; this page is
the order to do things in and the handful of values you have to supply.

> **Why a VPS and not Hostinger's web hosting?** Bzaro needs PostgreSQL, a
> long-running Node server, a second worker process, cron jobs and a wildcard
> TLS certificate. Shared/"Business" web hosting offers MySQL, one Node app and
> no wildcard certificate — it cannot run this project. KVM 2 (2 vCPU, 8 GB)
> is the right size; KVM 1 works but the build is tight on memory.

---

## 0. What you need before starting (15 min)

| Item                                    | Where                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Hostinger VPS, **Ubuntu 24.04** image   | hpanel → VPS → Buy → choose "Ubuntu 24.04" (plain OS, not a Docker/OpenLiteSpeed template) |
| The VPS IP and root password            | hpanel → VPS → Overview                                                                    |
| `bzaro.in` on **Cloudflare DNS** (free) | see §2 — required for the wildcard certificate                                             |
| A Cloudflare API token                  | see §2                                                                                     |
| An SSH client                           | Windows Terminal / PowerShell: `ssh root@<ip>`                                             |

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

## 2. DNS on Cloudflare (needed for the wildcard certificate)

A certificate for `*.bzaro.in` can only be issued through a DNS challenge, and
Caddy (our web server) automates that against Cloudflare. Hostinger's own DNS
has no such integration, so the domain's DNS moves to Cloudflare — the domain
itself stays registered with Hostinger.

1. Sign up at cloudflare.com (free) → **Add a site** → `bzaro.in` → Free plan.
2. Cloudflare shows two nameservers (e.g. `ada.ns.cloudflare.com`,
   `carl.ns.cloudflare.com`). In hpanel → **Domains → bzaro.in → DNS/Nameservers
   → Change nameservers**, replace Hostinger's with those two. Propagation:
   minutes to a few hours.
3. In Cloudflare → **DNS → Records**, add — all with the **grey cloud (DNS
   only)**, not proxied:

   | Type | Name  | Content    |
   | ---- | ----- | ---------- |
   | A    | `@`   | `<VPS-IP>` |
   | A    | `www` | `<VPS-IP>` |
   | A    | `*`   | `<VPS-IP>` |

   The `*` record is what makes every seller subdomain resolve the instant the
   seller registers — no per-seller DNS ever (docs/DEPLOYMENT.md §2).

4. API token: Cloudflare → profile icon → **My Profile → API Tokens → Create
   Token → "Edit zone DNS" template** → Zone Resources: _Include → Specific zone
   → bzaro.in_ → Continue → Create. Copy the token; it is shown once.

> Leave the orange cloud OFF for now. Proxying can be added later for the apex
> only (docs/DEPLOYMENT.md §3 and §7); proxying the wildcard needs a paid
> Cloudflare certificate.

---

## 3. Run the setup script (one command, ~10 min)

On the VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/rahulmauryaliveai-rgb/Bzaro/main/deploy/setup-vps.sh -o setup-vps.sh && sudo bash setup-vps.sh
```

It asks for five things — the domain, an email for certificate notices, the
Cloudflare token, and the email + password of the first administrator — then:

1. installs Docker, Node 22 and pm2; opens ports 22/80/443 in the firewall;
2. clones the repo to `/srv/bzaro/app`;
3. generates every secret and writes `/srv/bzaro/app/.env` and
   `deploy/.env` (never overwritten on re-runs);
4. starts PostgreSQL, Redis and Caddy in Docker (`deploy/compose.yml`);
5. installs, migrates, builds and starts the app + lead worker under pm2;
6. seeds plans, storefront templates, the 412-category taxonomy and your admin
   account — **no demo sellers, no demo passwords** (`npm run db:seed:prod`);
7. installs the cron jobs (`deploy/crontab`) and makes pm2 start on reboot.

Caddy requests the certificates on the first visit; the first page load can
take ~30 s while that happens.

---

## 4. Verify

From your PC:

```bash
curl -sI https://bzaro.in | head -1
```

```bash
curl -sI https://never-visited-before.bzaro.in | head -1
```

Both must answer with an HTTP status — `200` for the apex, `404` for the
unknown subdomain — rather than a certificate error. The second one is the
real test: valid TLS for a subdomain that never existed means the wildcard
certificate is in place. Then in a browser:

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

| Symptom                                   | Check                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Browser: certificate error on a subdomain | `docker logs bzaro-caddy` — usually the Cloudflare token lacks _Zone.DNS Edit_, or the `*` record is proxied (orange)     |
| `bzaro.in` times out                      | DNS not propagated yet (`nslookup bzaro.in`), or ufw: `ufw status`                                                        |
| 502 from Caddy                            | app down: `pm2 logs bzaro-web --lines 100`                                                                                |
| Boot error mentioning `UPSTASH`           | `docker ps` — `bzaro-redis-http` must be running; token in `.env` must equal `SRH_TOKEN` in `deploy/.env`                 |
| `Connection terminated unexpectedly`      | `docker ps` — `bzaro-postgres` restarted; app reconnects, or `pm2 restart bzaro-web`                                      |
| Uploads say "not available"               | `MEDIA_LOCAL_UPLOADS="1"` missing from `.env`                                                                             |
| Build killed / out of memory              | upgrade to KVM 2, or add swap: `fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
