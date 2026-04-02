module.exports = {
  apps: [
    {
      name: "signals-backend",
      script: "dist/index.js",
      cwd: "./",
      watch: false,
      max_restarts: 15,
      min_uptime: "10s",
      restart_delay: 3000,
      max_memory_restart: "512M",
      exp_backoff_restart_delay: 1000,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "minds-worker",
      script: "dist/workers/worker.js",
      cwd: "./",
      watch: false,
      max_restarts: 15,
      min_uptime: "10s",
      restart_delay: 3000,
      max_memory_restart: "512M",
      exp_backoff_restart_delay: 1000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
