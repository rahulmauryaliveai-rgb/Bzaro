/**
 * pm2 process file for the SALES DEMO copy of Bzaro (deploy/setup-demo.sh).
 *
 *   cd /srv/bzaro-demo/app && pm2 startOrReload deploy/ecosystem.demo.config.cjs --update-env
 *
 * Same code as the live site, its own folder, database, .env and port. Caddy
 * routes the demo domain to 127.0.0.1:3001 (shared/caddy-sites/demo.caddy).
 * Smaller memory ceilings: the demo serves a handful of prospects at a time.
 */
const cwd = "/srv/bzaro-demo/app";

module.exports = {
  apps: [
    {
      name: "bzaro-demo-web",
      cwd,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "800M",
      kill_timeout: 10000,
      out_file: "/var/log/bzaro/demo-web.out.log",
      error_file: "/var/log/bzaro/demo-web.err.log",
      time: true,
    },
    {
      name: "bzaro-demo-worker",
      cwd,
      script: "npm",
      args: "run worker",
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "300M",
      out_file: "/var/log/bzaro/demo-worker.out.log",
      error_file: "/var/log/bzaro/demo-worker.err.log",
      time: true,
    },
  ],
};
