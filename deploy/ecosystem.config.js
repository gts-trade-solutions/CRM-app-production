// PM2 process definition — /opt/salesforce-crm/deploy/ecosystem.config.js
//
//   pm2 start deploy/ecosystem.config.js
//   pm2 save                      # survive reboots (after `pm2 startup`)
//   pm2 reload salesforce-crm     # zero-downtime restart after a deploy
//
// Run it from the app directory: Next.js loads .env relative to cwd.

module.exports = {
  apps: [
    {
      name: 'salesforce-crm',
      // Call Next's binary directly rather than going through npm, so PM2
      // supervises the server itself instead of an npm wrapper that would
      // swallow signals and confuse restarts.
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: '/opt/salesforce-crm',

      // IMPORTANT: single instance, not cluster.
      //
      // The API rate limiter (lib/ratelimit.ts) counts requests in process
      // memory. Under cluster mode each worker keeps its own counters, so N
      // workers means an attacker gets N times the allowance — the sign-in
      // limit of 10/min silently becomes 40/min on 4 workers. Scaling out
      // needs a shared store (Redis) first; until then this stays at 1.
      instances: 1,
      exec_mode: 'fork',

      // A leak restarts the app instead of the VPS starting to swap.
      max_memory_restart: '600M',

      // Crash-loop guard: back off rather than hammering a broken build.
      autorestart: true,
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 4000,

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Timestamped, in one place. Rotation comes from pm2-logrotate — see
      // DEPLOYMENT.md; without it these files grow without limit.
      error_file: '/var/log/salesforce-crm/error.log',
      out_file: '/var/log/salesforce-crm/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // SSE clients hold connections open; give them a moment to close on a
      // reload rather than cutting them mid-stream.
      kill_timeout: 10000,
    },
  ],
};
