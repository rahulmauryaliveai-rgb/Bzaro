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
      // Bind to loopback only: Caddy is the only thing that should reach it.
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
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
