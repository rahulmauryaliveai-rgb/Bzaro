/**
 * pm2 process file for the VPS (docs/HOSTINGER.md).
 *
 *   pm2 startOrReload deploy/ecosystem.config.cjs --update-env
 *
 * Both processes read /srv/bzaro/app/.env themselves — Next.js at boot, the
 * worker through dotenv — so no secrets live in this file.
 */
const cwd = "/srv/bzaro/app";

module.exports = {
  apps: [
    {
      name: "bzaro-web",
      cwd,
      // No -H: with an explicit bind address Next reports its own origin as
      // localhost:3000, and the tenant rewrite in src/proxy.ts then looks
      // cross-origin and is proxied over TLS to itself (EPROTO, 500 on every
      // seller subdomain). Port 3000 is closed by ufw, so only Caddy reaches it.
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1500M",
      kill_timeout: 10000,
      out_file: "/var/log/bzaro/web.out.log",
      error_file: "/var/log/bzaro/web.err.log",
      time: true,
    },
    {
      // Lead fan-out + WhatsApp delivery (D29). Safe to run more than one.
      name: "bzaro-worker",
      cwd,
      script: "npm",
      args: "run worker",
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      out_file: "/var/log/bzaro/worker.out.log",
      error_file: "/var/log/bzaro/worker.err.log",
      time: true,
    },
  ],
};
