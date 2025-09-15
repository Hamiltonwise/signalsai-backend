import type { Knex } from "knex";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const config: { [key: string]: Knex.Config } = {
  production: {
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: "utf8mb4",
      ssl:
        process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 2,
      max: 50,
    },
    acquireConnectionTimeout: 60000,
    useNullAsDefault: true,
  },
  development: {
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: "utf8mb4",
      ssl:
        process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 2,
      max: 50,
    },
    acquireConnectionTimeout: 60000,
    useNullAsDefault: true,
  },
};

export default config;
