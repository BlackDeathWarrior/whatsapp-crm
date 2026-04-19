# Deploy on Hostinger

Hostinger's **VPS Hosting** plans are the recommended way to run WaCRM in
production: you get a dedicated Node.js process, predictable pricing, and
Hostinger's `hPanel` handles SSL and firewalls for you.

This walkthrough uses a VPS running Ubuntu 24.04.

## 1. Provision the VPS

1. Sign up at <https://www.hostinger.com/vps-hosting> and pick a plan. The
   **KVM 2** tier (2 vCPU / 8 GB RAM) is a comfortable starting point.
2. During the setup wizard:
   - **OS template** → Ubuntu 24.04 (plain, not the managed Node template —
     we install what we need manually).
   - **Location** → region closest to your users.
   - **SSH key** → upload your public key (`~/.ssh/id_ed25519.pub` or
     similar) so you can SSH in passwordless.
3. Wait for provisioning. In hPanel you will see the IPv4 address and
   root credentials.

## 2. SSH in and install dependencies

```bash
ssh root@<your-ip>

# Create a non-root user for the app
adduser wacrm
usermod -aG sudo wacrm
rsync --archive --chown=wacrm:wacrm ~/.ssh /home/wacrm

# Switch user
su - wacrm

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Install PM2 for process management
sudo npm install --global pm2
```

## 3. Clone your fork

```bash
cd ~
git clone https://github.com/<your-username>/wacrm.git
cd wacrm
npm ci
```

## 4. Configure env vars

Create `/home/wacrm/wacrm/.env.local` with the values from
[environment-variables.md](./environment-variables.md). Make sure
`NEXT_PUBLIC_SITE_URL` is set to the exact public URL you will use
(e.g., `https://crm.example.com`).

```bash
chmod 600 .env.local
```

## 5. Build and start with PM2

```bash
npm run build
pm2 start npm --name wacrm -- start
pm2 save
pm2 startup systemd -u wacrm --hp /home/wacrm
# Follow the command PM2 prints — it enables auto-start on reboot.
```

WaCRM is now listening on `127.0.0.1:3000`.

## 6. Front with nginx + SSL

Point your domain's `A` record at the VPS IP. Then:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/wacrm`:

```nginx
server {
    server_name crm.example.com;

    client_max_body_size 25m;  # WhatsApp media upload ceiling

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
}
```

Enable and issue a cert:

```bash
sudo ln -s /etc/nginx/sites-available/wacrm /etc/nginx/sites-enabled/wacrm
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d crm.example.com
```

Certbot writes the 443 block, enables HTTP→HTTPS redirect, and schedules
renewals in `systemd`.

## 7. Firewall

hPanel → **Firewall**: allow inbound 22 (SSH), 80, 443. Everything else
stays closed.

## 8. Update the Meta webhook

Back in **Meta for Developers → WhatsApp → Configuration**, change the
callback URL to `https://crm.example.com/api/whatsapp/webhook` and re-verify.

## 9. Schedule the automation cron

Follow [automations-and-cron.md](./automations-and-cron.md) to drain
pending executions. A simple `cron` entry on the same VPS works:

```bash
crontab -e
```

```cron
* * * * * curl -s -H "x-cron-secret: $AUTOMATION_CRON_SECRET" https://crm.example.com/api/automations/cron > /dev/null
```

Load `AUTOMATION_CRON_SECRET` into the cron environment via
`/etc/environment` or an `EnvironmentFile=` in a `systemd` unit.

## 10. Deploying updates

```bash
ssh wacrm@<your-ip>
cd ~/wacrm
git pull
npm ci
npm run build
pm2 reload wacrm
```

`pm2 reload` performs a zero-downtime restart. If the database schema
changed, apply any new SQL files from `supabase/migrations/` in the
Supabase SQL editor first — migrations are idempotent.

## Where to go next

- [Automations cron →](./automations-and-cron.md) — must-do if you use
  the Wait step in any automation.
- [Troubleshooting →](./troubleshooting.md) — common deploy issues.
