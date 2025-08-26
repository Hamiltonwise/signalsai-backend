module.exports = {
  apps: [
    {
      name: "signals-backend",
      script: "dist/index.js", // or "dist/index.js" depending on build output
      cwd: "./",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
