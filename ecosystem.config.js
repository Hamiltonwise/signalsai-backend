module.exports = {
  apps: [
    {
      name: "signals-backend",
      script: "dist/index.js",
      cwd: "./",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "minds-worker",
      script: "dist/workers/worker.js",
      cwd: "./",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
