# Runbook

What to do when something is wrong, written for one person on call at an
inconvenient hour.

> Each entry states the **symptom you would actually observe**, not the
> underlying fault — because at 2am you have a graph or a complaint, not a
> diagnosis.

---

## Health checks

```bash
curl -s https://bzaro.in/api/health          # {"status":"ok"}
curl -sI https://bzaro.in | head -1          # apex
curl -sI https://abc-electronics.bzaro.in | head -1   # a tenant
```

`/api/health` round-trips the database rather than just confirming the process
is alive. A Next.js server that boots fine but cannot reach Postgres serves 500s
to every page, and a liveness probe that only checks the process keeps it
happily in rotation.

---

## Alerts worth having

| Alert                               | Threshold      | Why                                                                          |
| ----------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| 5xx rate                            | >1% over 5 min | The obvious one                                                              |
| `/api/health` failing               | 2 consecutive  | Database unreachable                                                         |
| DB connection saturation            | >80% of pool   | Precedes total outage                                                        |
| **Enquiry submission success rate** | any drop       | **A silent enquiry failure is the most expensive bug this product can have** |
| p95 tenant page latency             | >1.5s          | ISR or database degradation                                                  |
| Rows in `AnalyticsEvent_default`    | >0             | `create-partitions` stopped running                                          |
| Cron job non-200                    | any            | Jobs fail silently otherwise                                                 |

The enquiry alert is the one to wire up first. Sellers pay for leads; a form
that accepts submissions and drops them destroys trust in a way downtime does
not, and nobody reports it because everything _looks_ fine.

---

## The site looks fine but nothing works

**Symptom:** pages load, but `/api/health` returns 503 and any uncached page
500s.

**Cause:** the database is unreachable. Cached pages keep serving, which is what
makes this confusing — the site looks healthy to a casual check.

```bash
curl -s https://bzaro.in/api/health
# {"status":"degraded"}
```

**Checks:**

1. Database provider status page
2. Connection count — `SELECT count(*) FROM pg_stat_activity;`
3. Whether `DATABASE_URL` still points at the pooler

**If connections are exhausted:**

```sql
-- Who is holding them
SELECT pid, state, age(clock_timestamp(), query_start), left(query, 80)
FROM pg_stat_activity
WHERE state <> 'idle' ORDER BY query_start;

-- Terminate long-running queries (last resort)
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE state = 'active' AND age(clock_timestamp(), query_start) > interval '5 minutes';
```

**Locally**, this is usually `prisma dev` having stopped — see D24. Recovery:

```bash
npm run db:stop && npm run db:start && npm run db:deploy && npm run db:seed
```

---

## A tenant subdomain shows a certificate warning

**Symptom:** `abc-electronics.bzaro.in` warns, the apex is fine.

This is the highest-severity failure mode short of a data leak: to a visitor it
is indistinguishable from a compromised site.

```bash
echo | openssl s_client -connect abc-electronics.bzaro.in:443 \
  -servername abc-electronics.bzaro.in 2>/dev/null \
  | openssl x509 -noout -text | grep -A1 "Subject Alternative Name"
```

**Expect** `DNS:bzaro.in, DNS:*.bzaro.in`.

| What you see                              | Cause                                 | Fix                                                                              |
| ----------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| Only `bzaro.in`                    | Wildcard cert never issued            | Re-add `*.bzaro.in` in Vercel; complete DNS-01                            |
| Correct SANs, still warns                 | Cloudflare proxying without ACM       | Set the `*` record to DNS-only, or buy ACM                                       |
| Works for known subdomains, fails for new | Per-hostname issuance, not a wildcard | You do not have a wildcard. See DEPLOYMENT.md §3                                 |
| Slug has a dot                            | One-label limit                       | Should be impossible — the CHECK constraint blocks it. Investigate how it got in |

---

## A seller says their website is not appearing on Google

**Almost always working as designed** (decision D2), not a bug.

```bash
curl -s https://abc-electronics.bzaro.in/robots.txt
curl -s https://abc-electronics.bzaro.in/ | grep -o 'name="robots" content="[^"]*"'
```

`Disallow: /` and `noindex` mean the seller has not cleared the eligibility gate.

Check why in the admin seller detail page — `indexBlockReason` names the first
unmet requirement, and the seller's own dashboard shows the full checklist.

**Do not** disable the gate for one seller. It exists because thousands of
near-empty subdomains risk a thin-content penalty against the **root domain** —
which would take every seller down together. Help them complete the profile
instead.

To re-evaluate immediately after they fix it:

```bash
curl -H "Authorization: Bearer $REVALIDATE_SECRET" \
  https://bzaro.in/api/cron/recompute-indexability
```

---

## A seller says an edit has not appeared

**Cause:** cache invalidation did not fire, or fired for the wrong tag.

1. Confirm the write landed — check the row in the database, not the page.
2. If the data is right and the page is stale, the mutation did not call the
   revalidation helper.

The rule is that a mutation revalidates its own tags **in the same function that
performs the write**, inside the service layer. A mutation that revalidates
somewhere else has already broken.

Force it:

```bash
curl -H "Authorization: Bearer $REVALIDATE_SECRET" \
  https://bzaro.in/api/cron/refresh-counters
```

---

## One seller's content appears on another's site

**Stop. This is a data leak, not a bug.** Treat it as an incident.

1. **Confirm** with two curls to different tenant hostnames.
2. **Purge** the CDN cache immediately.
3. **Capture** the request IDs and both hostnames before anything expires.
4. **Run** `npm run test:isolation` against production if safe, staging if not.

**Most likely cause:** something moved tenant identity out of the URL path — into
a header, a cookie, or a module-level variable. That is precisely the failure
the architecture is built to prevent (MULTI_TENANCY.md §3), and the isolation
suite is the CI gate on `lib/tenant/**` for this reason.

This has never occurred; the suite exists so that it surfaces in CI rather than
in production.

---

## Enquiries have stopped arriving

**Symptom:** sellers report silence; enquiry count is flat.

1. Submit a test enquiry through a real microsite contact form.
2. Check the `Enquiry` table — did the row land?

| Row created?             | Meaning                              | Action                                                                                                                                                      |
| ------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No, form errors          | Server Action failing                | Check `serverActions.allowedOrigins` includes `*.<root domain>` — without it, the form 403s **only in the browser**, so every server-side test still passes |
| No, form says success    | Rate limiter or validation rejecting | Check Upstash; check the honeypot is not visible (a broken stylesheet exposes it and real users fill it in)                                                 |
| Yes, but marked `isSpam` | Scoring too aggressive               | Inspect `spamScore`; tune `scoreSpam`                                                                                                                       |
| Yes, seller not notified | Mail failing                         | Check `RESEND_API_KEY` and the Resend dashboard                                                                                                             |

Enquiries are **never silently dropped** — suspected spam is stored, flagged and
withheld from the inbox, so a false positive is always recoverable.

---

## Restoring the database

**Rehearse this before launch. An untested backup is not a backup.**

1. Provision a new database from the PITR snapshot at the chosen timestamp.
2. Point `DIRECT_DATABASE_URL` at it and verify:

```sql
SELECT count(*) FROM "Seller";
SELECT count(*) FROM "Enquiry";
SELECT max("createdAt") FROM "Enquiry";   -- how much was lost?
```

3. Confirm the schema extras survived — these are hand-written SQL, not Prisma
   models, and a restore that loses them will look fine until search breaks:

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'Product';
-- expect Product_searchVector_idx, Product_name_trgm_idx, partial indexes

SELECT relname FROM pg_class WHERE relname LIKE 'AnalyticsEvent_%';
-- expect monthly partitions and AnalyticsEvent_default

SELECT proname FROM pg_proc WHERE proname = 'create_analytics_partition';
```

4. Swap `DATABASE_URL`, redeploy, verify `/api/health`.
5. Run the isolation suite before announcing recovery.

**Record the wall-clock time this took.** That number is the real RTO, and it is
the only honest input to any availability promise.

---

## Known cliffs

Things that work now and will stop working at a predictable scale. Listed so
they are discovered on a whiteboard rather than during an incident.

| Cliff                                                    | When                       | What happens              | Fix                                                                                          |
| -------------------------------------------------------- | -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| `recompute-indexability` walks every seller sequentially | ~5,000 sellers             | Job exceeds `maxDuration` | Paginate with a cursor, or move to a queue                                                   |
| `refresh-counters` iterates every category and location  | ~10,000 rows               | Same                      | Batch into a single SQL statement                                                            |
| ISR cache entries                                        | ~10,000 sellers × 15 pages | Cache storage cost        | Prebuild only top N; tier revalidation by activity                                           |
| Postgres FTS relevance                                   | >1M documents, p95 >300ms  | Search quality degrades   | Typesense — trip conditions in D4; `tookMs` is reported on every query so this is measurable |
| `AnalyticsEvent` volume                                  | ~365M rows/year            | Query and backup pain     | Already partitioned; move raw events to ClickHouse, keep rollups                             |
| Seller-name search uses `ILIKE %…%`                      | large seller count         | Sequential scan           | Add a trigram index on `businessName`                                                        |

---

## Escalation

Solo founder, so there is no rota. The practical rule:

- **Data leak or certificate failure** — drop everything
- **Enquiries not arriving** — same day, before anything else
- **Search or a page type broken** — same day
- **A single seller's edit stale** — next working day; force the revalidation
- **Cron failure** — next working day unless `AnalyticsEvent_default` is filling
