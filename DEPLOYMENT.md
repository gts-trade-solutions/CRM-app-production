# Deployment — Ubuntu VPS

Target: a single Ubuntu 22.04/24.04 VPS running MySQL 8, the Next.js app
under **PM2**, and nginx in front (TLS via certbot). Templates live in
`deploy/`: `ecosystem.config.js` (PM2), `nginx.conf`, and
`salesforce-crm.service` for anyone who prefers systemd instead.

## 1. Server preparation (once)

```bash
sudo apt update && sudo apt upgrade -y
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx mysql-server git
sudo npm install -g pm2
sudo mysql_secure_installation

# App user + directory
sudo useradd --system --create-home --shell /bin/bash crm
sudo mkdir -p /opt/salesforce-crm && sudo chown crm:crm /opt/salesforce-crm

# Log directory PM2 writes to (see deploy/ecosystem.config.js)
sudo mkdir -p /var/log/salesforce-crm && sudo chown crm:crm /var/log/salesforce-crm
```

### MySQL

```bash
sudo mysql <<'SQL'
CREATE DATABASE salesforce CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'crm'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON salesforce.* TO 'crm'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 2. App deployment

```bash
sudo -iu crm
cd /opt/salesforce-crm
git clone https://github.com/gts-trade-solutions/CRM-app-production.git .

# Environment — NEVER commit this file
cp .env.example .env
nano .env
```

Required `.env` values on the server:

```
DATABASE_URL="mysql://crm:CHANGE_ME_STRONG_PASSWORD@localhost:3306/salesforce"
NEXTAUTH_URL="https://crm.example.com"          # the public URL
NEXTAUTH_SECRET="<openssl rand -base64 32>"     # fresh secret per environment
AWS_ACCESS_KEY_ID=…                             # S3 (from the shared account)
AWS_SECRET_ACCESS_KEY=…
AWS_REGION=…
S3_ATTACHMENTS_BUCKET=…                         # shared bucket (interim)
S3_ATTACHMENTS_PREFIX="crm-attachments/"
SES_ACCESS_KEY_ID=…                             # SES credential pair
SES_SECRET_ACCESS_KEY=…
SES_REGION=…
SES_FROM_ADDRESS=…                              # SES-verified sender
```

Do **not** set `NEXT_PUBLIC_DEMO_MODE` on this server. Leaving it out is
what removes the persona grid from the login page and makes the seed script
refuse to run. It is read at **build** time, so changing it later means
rebuilding, not just restarting.

```bash
npm ci
npx prisma db push          # create the schema
npm run build
exit
```

Creating the first admin comes after the app is up — see
[First run](#first-run-creating-the-organisation).

## 3. PM2 + nginx

PM2 runs as the `crm` user, never as root.

```bash
sudo -iu crm
cd /opt/salesforce-crm
pm2 start deploy/ecosystem.config.js
pm2 status                                # expect: online
curl -s http://127.0.0.1:3000/api/health  # expect: {"ok":true,...}

# Survive reboots: `pm2 save` records the current process list…
pm2 save
exit

# …and this generates the boot service. Run the command it prints.
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u crm --hp /home/crm

# Cap the log files — without this they grow until the disk fills.
sudo -iu crm pm2 install pm2-logrotate
sudo -iu crm pm2 set pm2-logrotate:max_size 50M
sudo -iu crm pm2 set pm2-logrotate:retain 14
```

Then nginx and TLS:

```bash
sudo cp /opt/salesforce-crm/deploy/nginx.conf /etc/nginx/sites-available/salesforce-crm
sudo nano /etc/nginx/sites-available/salesforce-crm   # set server_name
sudo ln -s /etc/nginx/sites-available/salesforce-crm /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default           # or it wins on port 80
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.example.com
```

DNS: point an A record for `crm.example.com` at the VPS IP **before**
running certbot, or the challenge fails.

### Why a single PM2 instance

`ecosystem.config.js` sets `instances: 1` / `exec_mode: 'fork'` deliberately.
The API rate limiter counts requests in process memory, so cluster mode gives
each worker its own counters — four workers turn the 10/min sign-in limit
into 40/min. Scaling out needs a shared counter store (Redis) first. One
Node process handles this workload comfortably; add CPU before adding
workers.

## 4. Updating a running deployment

```bash
sudo -iu crm bash -c 'cd /opt/salesforce-crm && git pull && npm ci && npx prisma db push && npm run build'
sudo -iu crm pm2 reload salesforce-crm
```

`pm2 reload` waits for in-flight requests instead of cutting them; the config
allows 10s for open SSE streams to close.

If a deploy goes wrong: `git checkout <previous-sha>`, rebuild, reload. Roll
the database back from the nightly dump only if the schema changed —
`prisma db push` is not reversible on its own.

(`prisma db push` is the interim schema-sync; switch to
`prisma migrate deploy` once migration files are adopted.)

## 5. Backups

```bash
# /etc/cron.d/crm-backup  — nightly dump, 14-day retention
0 2 * * * root mysqldump --single-transaction salesforce | gzip > /var/backups/crm-$(date +\%F).sql.gz && find /var/backups -name 'crm-*.sql.gz' -mtime +14 -delete
```

Restore drill (do this once before go-live, against a scratch database):

```bash
zcat /var/backups/crm-YYYY-MM-DD.sql.gz | mysql salesforce_restore_test
```

Attachments live in S3 (bucket versioning recommended); the database dump
plus the bucket is the full state.

## 6. Health & logs

- `https://crm.example.com/api/health` — DB connectivity + user count;
  point an uptime monitor (UptimeRobot etc.) at it.
- `sudo -iu crm pm2 logs salesforce-crm` — live app logs.
- `sudo -iu crm pm2 status` / `pm2 monit` — state, restarts, memory. A
  climbing restart count is the first sign of a crash loop.
- `/var/log/salesforce-crm/{out,error}.log` — the same output on disk.
- `sudo tail -f /var/log/nginx/access.log` — traffic.

## 7. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

MySQL must remain bound to localhost (default) — never expose 3306.

## First run: creating the organisation

A production deployment starts with an empty database and **no demo data**.

Leave `NEXT_PUBLIC_DEMO_MODE` out of `.env` entirely. With it unset:

- the login page shows only the credentials form — no persona grid;
- `npm run db:seed` refuses to run, so nobody can wipe live data with a
  mistyped command.

Create the single account that cannot be invited, then never use the script
again (it refuses once an active admin exists):

```bash
cd /opt/salesforce-crm
sudo -u crm env ADMIN_NAME="Full Name" ADMIN_EMAIL=you@company.com \
  ADMIN_PASSWORD='a-long-strong-password' npm run bootstrap:admin
```

It also writes the organisation settings row and the pipeline stage rows, so
quotations and the kanban work on a fresh database.

Everyone else is added in-app from **Team → Add member**. Each gets an
emailed single-use link (72-hour expiry) to set their own password; until
they use it they cannot sign in at all. Only the SHA-256 of that token is
stored. If email is not working yet, the app shows the link to the manager
to pass on privately, and Admin → Users can re-send it — which also revokes
the previous link.

SES must be able to send to your team's domain before you rely on this: if
the account is still in the SES sandbox, only verified addresses receive
mail. Check with `aws ses get-account-sending-enabled` and the sending quota.

## Checklist

- [ ] DNS A record → VPS; TLS issued; http→https redirect active
- [ ] `.env` complete; fresh `NEXTAUTH_SECRET`; strong DB password
- [ ] `NEXT_PUBLIC_DEMO_MODE` **unset** — persona grid gone, seeding blocked
- [ ] `npm run bootstrap:admin` run once; its password stored in a manager
- [ ] Invite email actually delivered to a real teammate (not sandboxed)
- [ ] `pm2 status` online; `/api/health` ok via https
- [ ] `pm2 save` + `pm2 startup` done — **reboot the VPS once and confirm it
      comes back up on its own**
- [ ] `pm2-logrotate` installed; `/var/log/salesforce-crm` not growing
- [ ] Backup cron installed AND restore drill performed
- [ ] Uptime monitor pointed at /api/health
- [ ] ufw enabled; 3306 not exposed
- [ ] Sign-in works from a phone; offline capture + sync tested on device
