# Deployment — Ubuntu VPS

Target: a single Ubuntu 22.04/24.04 VPS running MySQL 8, the Next.js app
under systemd, and nginx in front (TLS via certbot). Templates for the
service unit and nginx site live in `deploy/`.

## 1. Server preparation (once)

```bash
sudo apt update && sudo apt upgrade -y
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx mysql-server git
sudo mysql_secure_installation

# App user + directory
sudo useradd --system --create-home --shell /bin/bash crm
sudo mkdir -p /opt/salesforce-crm && sudo chown crm:crm /opt/salesforce-crm
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

```bash
npm ci
npx prisma db push          # create the schema
npx prisma db seed          # OPTIONAL: demo data — skip for a clean org
npm run build
exit
```

> Going live without demo data: skip the seed, then create the first admin
> by inserting a user row (role `admin`, bcrypt password hash) — or seed,
> change the admin password hash, and deactivate the demo members from the
> admin console.

## 3. systemd + nginx

```bash
sudo cp /opt/salesforce-crm/deploy/salesforce-crm.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now salesforce-crm
systemctl status salesforce-crm          # expect: active (running)
curl -s http://127.0.0.1:3000/api/health # expect: {"ok":true,...}

sudo cp /opt/salesforce-crm/deploy/nginx.conf /etc/nginx/sites-available/salesforce-crm
sudo nano /etc/nginx/sites-available/salesforce-crm   # set server_name
sudo ln -s /etc/nginx/sites-available/salesforce-crm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.example.com
```

DNS: point an A record for `crm.example.com` at the VPS IP before certbot.

## 4. Updating a running deployment

```bash
sudo -iu crm bash -c 'cd /opt/salesforce-crm && git pull && npm ci && npx prisma db push && npm run build'
sudo systemctl restart salesforce-crm
```

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
- `journalctl -u salesforce-crm -f` — app logs.
- `sudo tail -f /var/log/nginx/access.log` — traffic.

## 7. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

MySQL must remain bound to localhost (default) — never expose 3306.

## Checklist

- [ ] DNS A record → VPS; TLS issued; http→https redirect active
- [ ] `.env` complete; fresh `NEXTAUTH_SECRET`; strong DB password
- [ ] `systemctl status salesforce-crm` active; `/api/health` ok via https
- [ ] Demo data decision made (clean org vs seeded demo)
- [ ] Backup cron installed AND restore drill performed
- [ ] Uptime monitor pointed at /api/health
- [ ] ufw enabled; 3306 not exposed
- [ ] Sign-in works from a phone; offline capture + sync tested on device
