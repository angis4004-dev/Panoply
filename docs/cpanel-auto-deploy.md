# Automatic cPanel Deployment

Push to `main` → CI runs → if CI passes, GitHub builds the app and uploads it to
cPanel over SFTP → the app restarts and is checked. Nothing is built or uploaded
from your laptop.

cPanel never runs `npm install` or `next build`. The whole application, its
dependencies included, is built on GitHub and mirrored up ready to run.

---

## 0. Check your hosting can run this — do this first

This is a Next.js server application. It has API routes, database sessions and
server-rendered pages, so it needs **Node.js**. It cannot be exported to plain
HTML files, and it will not run on PHP-only hosting no matter how it is
uploaded.

| Requirement | Where to look | If it is missing |
|---|---|---|
| **Node.js 22 app support** | A **Setup Node.js App** icon under *Software* | The app cannot run on this plan at all. You need one with Node.js (often "CloudLinux / Node.js Selector"), or a small VPS. |
| **SSH key access** | An **SSH Access** icon under *Security* | Without it there is no way in. Ask the host to enable it. |

**Shell access is *not* required.** That distinction matters on shared hosting:
Namecheap and Spaceship accounts accept an SSH key, then end the session with
"Shell access is not enabled on your account!" — so `tar`, `touch` and every
other remote command is refused unless you raise a support request.

This workflow is built to need none of them. It unpacks the release on the
GitHub runner and mirrors the finished tree up over SFTP, which those accounts
allow. The restart is done by uploading `tmp/restart.txt`, because Passenger
watches that file's timestamp and an upload changes it exactly as `touch`
would.

The trade-off is speed. One archive would transfer in seconds; a tree of ~3,200
files takes a few minutes, which is why the upload runs ten transfers in
parallel. If you ever do get shell access, uploading a `.tar.gz` and extracting
it server-side is the faster design.

---

## 1. Create the application in cPanel

**Setup Node.js App → Create Application:**

- **Node.js version:** 22
- **Application mode:** Production
- **Application root:** `panoply-app` (cPanel turns this into
  `/home/YOUR_CPANEL_USER/panoply-app` — note the full path, you need it later)
- **Application URL:** your domain
- **Application startup file:** `server.js`

Create it, then leave it alone. Do **not** press *Run NPM Install* — the
dependencies ship inside the archive, and installing over them can replace the
tested versions with different ones.

---

## 2. Set the runtime environment variables in cPanel

Still in **Setup Node.js App**, add these to the application's environment. They
are read when the server starts, so a change here needs a restart.

**Required — the app will not work correctly without these:**

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Atlas connection string. Allow your cPanel server's IP in Atlas → Network Access. |
| `MONGODB_DB` | Database name. |
| `SESSION_SECRET` | The real one. Long and random: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `PII_ENCRYPTION_KEY` | 32 bytes base64. **Losing this makes stored ID numbers unreadable forever** — back it up somewhere safe. |
| `NEXT_PUBLIC_APP_URL` | `https://yourdomain.com`, no trailing slash. |
| `APP_HOST` | `yourdomain.com` |
| `ADMIN_HOST` | `admin.yourdomain.com`. **In production the admin console refuses to load unless this is set** — that is deliberate, so a stray wildcard DNS record can never serve the operations console. If you cannot add a subdomain, set `ADMIN_PATH_ROUTING=true` instead and the console lives at `/admin` on the main domain. |

**Needed for specific features** — each one fails quietly and safely if absent:

| Variable | Without it |
|---|---|
| `RESEND_API_KEY`, `EMAIL_FROM` | No verification, password-reset or PIN-reset emails are sent. |
| `GEMINI_API_KEY` | Ask Panoply replies "not available yet" to everything. Free key: <https://aistudio.google.com/apikey> |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No Google sign-in. |
| `COINGECKO_API_KEY` | Falls back to the free tier's lower rate limit. |

Never put any of these in GitHub, and never commit them. `.env` is gitignored
and must stay that way.

---

## 3. Set up SSH between GitHub and cPanel

Generate the key **on your own machine**, not in cPanel. cPanel's *Generate a
New Key* form refuses an empty passphrase on some hosts, and a passphrase means
carrying an extra secret into GitHub for no benefit:

```bash
ssh-keygen -t rsa -b 4096 -C "github-deploy" -f ~/.ssh/panoply_deploy -N ""
```

That writes two files. `panoply_deploy.pub` is the public half; `panoply_deploy`
is the private half and never leaves your machine except into GitHub's secret
box.

**In cPanel → SSH Access → Manage SSH Keys → Import Key:**

1. Leave the *private key* box empty; paste the contents of
   `panoply_deploy.pub` into the *public key* box.
2. Import it, then **Manage → Authorize**. An unauthorized key looks perfectly
   fine in the list and silently refuses every connection.

### Find your port before you assume 22

Shared hosts frequently move SSH. Namecheap and Spaceship use **21098**, and a
deploy pointed at 22 fails with a timeout that looks like a network fault
rather than a wrong number. Check which port answers:

```bash
for p in 22 21098 2222; do (echo > /dev/tcp/YOUR_SERVER_IP/$p) 2>/dev/null && echo "$p open" || echo "$p closed"; done
```

**In GitHub → your repo → Settings → Secrets and variables → Actions:**

Under the **Secrets** tab:

| Secret | Value |
|---|---|
| `CPANEL_HOST` | Your server's hostname or IP. |
| `CPANEL_USER` | Your cPanel username. |
| `CPANEL_SSH_KEY` | The **private** key, pasted whole, including both header lines. |
| `CPANEL_APP_PATH` | `/home/YOUR_CPANEL_USER/panoply-app` — the full Application root from step 1. |
| `CPANEL_SSH_PORT` | The port you found above. Omit only if it really is 22 — on Namecheap and Spaceship it is `21098`. |

Under the **Variables** tab (not Secrets):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://yourdomain.com`, no trailing slash. |

### Why that one is a Variable and not a Secret

`NEXT_PUBLIC_APP_URL` is **compiled into the build**, not read when the server
runs. Setting it in cPanel alone is not enough — it has to be present on the
GitHub runner at build time or the wrong value is baked in permanently.

If it is missing, the build falls back to `http://localhost:4028` and ships a
site whose sitemap advertises `localhost` to Google and whose password-reset
emails link to a machine nobody can reach. Nothing appears broken until a real
user cannot get back into their account.

So the workflow now **refuses to build** without it, and then re-checks the
finished artifact before uploading. It is a Variable rather than a Secret
because it is the public address of the site, printed on every page — masking it
would only make that failure harder to read in the logs.

---

## 4. Deploy

Push to `main`. That is the whole workflow.

CI runs lint, type-check and build first. Only if CI passes does the deploy
workflow run. You can also trigger it by hand from **Actions → Deploy to cPanel
→ Run workflow**.

Watch the run in the **Actions** tab. The last step polls your site until it
answers `200`, so a green tick means the site is genuinely up — not just that
files were copied.

---

## 5. The admin console on its own subdomain

The operations console is meant to live on a separate hostname. That split is
what makes `/api/admin` **not exist** from the trader origin, so a stolen admin
cookie cannot be used from a page on the main site.

Getting there on this host has one non-obvious step.

1. **DNS.** Add an `A` record for `admin` pointing at the server's IP. On
   Spaceship this is in their dashboard, not cPanel's Zone Editor — the
   nameservers are `launch1/launch2.spaceship.net`. Enter just `admin` in the
   host field; the panel appends the domain itself.
2. **Create the subdomain.** cPanel's *Domains* tool is removed on Spaceship
   plans, and searching for "subdomain" finds nothing. It lives in Spaceship's
   own hosting dashboard instead. Do **not** click "Create website" there —
   that installs a site builder over it.
3. **Point it at the same document root.** This is the step that is easy to get
   wrong. The subdomain is created with its own empty folder, and an empty
   folder serves a directory listing, not the application.

### Why a symlink, and not a copied config

`~/admin.example.com` is a **symlink to `~/example.com`**, so both hostnames
resolve to one document root:

```
ln -s /home/USER/example.com /home/USER/admin.example.com
```

The obvious alternative is to copy the `.htaccess` from the main document root
into the subdomain's folder. Do not: cPanel stores the application's
environment variables in that file, in plaintext. Two copies means changing a
variable in cPanel updates one of them, and the other keeps serving the old
value with nothing anywhere saying so.

One folder, one config, no drift. If the symlink is ever replaced by a real
directory, the subdomain silently starts serving a file listing instead of the
app — that symptom is this step.

4. **Issue the certificate.** cPanel → *SSL/TLS Status* → tick the subdomain →
   **Run AutoSSL**. Until it completes, HTTPS to the subdomain fails during the
   TLS handshake, which looks like the host being unreachable rather than a
   certificate problem.
5. **Switch the routing.** Only once HTTPS works: remove `ADMIN_PATH_ROUTING`
   and set `ADMIN_HOST` to the subdomain. Save and restart.

Order matters. Switching before the certificate exists leaves no reachable
console at all.

### Verifying it

The console works when all six of these hold:

| Request | Expected |
|---|---|
| `admin.example.com/admin` | 307 → `/admin/login` |
| `admin.example.com/admin/login` | 200 |
| `admin.example.com/api/admin/...` | 401 |
| `example.com/admin` | **404** |
| `example.com/admin/login` | **404** |
| `example.com/api/admin/...` | **404** |

The three 404s are the ones that matter. A 403 there would mean the console
exists on the trader host and is merely refusing — the point is that it is not
there at all.

---

## What the workflow does, and why

1. **Checks out the exact commit CI verified**, not whatever is newest on
   `main`. Deploying a different commit from the one that passed makes CI
   meaningless.
2. **Refuses to build without `NEXT_PUBLIC_APP_URL`**, then re-inspects the
   built sitemap before upload as a second check.
3. **Builds the standalone bundle** — Next traces exactly the dependencies the
   server needs, which is why cPanel needs no `npm install`.
4. **Strips `.env` and `data/`** from the archive, so a stray local secret can
   never be shipped and the server's own data directory is never overwritten.
5. **Mirrors the tree up over SFTP, on top of the existing release.** Ten
   parallel transfers, because ~3,200 mostly-small files cost round trips
   rather than bandwidth. Nothing is deleted first, deliberately: Next names
   every JavaScript chunk after its content, so keeping the previous release's
   chunks means a browser that loaded a page moments before the deploy can
   still fetch the files it was promised instead of erroring. Routing comes
   from the manifests, which are overwritten, so nothing stale is served.
6. **Restarts** by uploading `tmp/restart.txt`. Passenger — the thing cPanel
   runs Node apps under — respawns when that file's timestamp changes, and an
   upload changes it just as `touch` would. This is what lets the whole deploy
   work without shell access.
7. **Deletes the deploy key from the runner**, whether the upload succeeded or
   failed.
8. **Waits until the site is served by Next.js**, retrying for about a minute.
   Checking for HTTP 200 alone is not enough: before the Node app is mapped to
   the domain, LiteSpeed answers the same URL with a directory listing, and
   that is a perfectly good 200. The check looks for the `X-Powered-By: Next.js`
   header, which no static listing produces.

Only one deploy runs at a time, and a running one is never cancelled — an
interrupted mirror would leave half of one release on disk.

---

## When something goes wrong

| Symptom | Cause |
|---|---|
| Workflow fails at **Require the public site URL** | The `NEXT_PUBLIC_APP_URL` *variable* is missing. It goes under the Variables tab, not Secrets. |
| **Upload** step fails to connect | Wrong host or port, or the public key was never *authorized* in cPanel — generating it is not enough. |
| **`ssh: handshake failed`** | `CPANEL_SSH_KEY` is not the complete private key. It must include the `BEGIN`/`END` lines and the trailing newline. |
| **`Shell access is not enabled on your account!`** | Expected on shared hosting, and not a failure — this workflow never runs a remote command. If you see it while testing by hand with `ssh`, use `sftp` instead. |
| Upload succeeds but **Verify** says *"HTTP 200 but not from Next.js"* | The files are there, but the domain is still served from `public_html` rather than the Node app. Check the Application URL in **Setup Node.js App**. |
| Deploy succeeds but **Verify the site is answering** fails | The app booted and crashed. Open **Setup Node.js App**, check the log — a missing `MONGODB_URI` or `SESSION_SECRET` is the usual reason. |
| Site loads, admin console 404s | `ADMIN_HOST` is not set, or the subdomain does not exist. The console fails closed on purpose. |
| Admin subdomain shows a file listing | Its document root is a real folder rather than a symlink to the main one, so there is no Passenger config in it. See section 5. |
| `https://admin...` fails to connect at all | No certificate for that hostname yet. The TLS handshake aborts before HTTP, so it looks like the host is down. Run AutoSSL. |
| Emails never arrive | `RESEND_API_KEY` / `EMAIL_FROM` unset, or the sending domain is not verified with Resend. |
| Atlas connection times out | The cPanel server's IP is not in Atlas → Network Access. |
