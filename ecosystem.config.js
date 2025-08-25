module.exports = {
  apps: [
    {
      name: "backend",
      script: "index.js", // or "dist/index.js" depending on build output
      cwd: "./",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
