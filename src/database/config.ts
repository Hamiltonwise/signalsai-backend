import type { Knex } from "knex";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const config: { [key: string]: Knex.Config } = {
  production: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432"),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: 2,
      max: 50,
      acquireTimeoutMillis: 90000, // 90 seconds
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false, // Don't fail fast on connection errors
    },
    acquireConnectionTimeout: 90000, // Match pool timeout
    useNullAsDefault: true,
    log: {
      warn(message) {
        console.warn("[DB WARNING]", message);
      },
      error(message) {
        console.error("[DB ERROR]", message);
      },
      deprecate(message) {
        console.warn("[DB DEPRECATED]", message);
      },
      debug(message) {
        if (process.env.DB_DEBUG === "true") {
          console.log("[DB DEBUG]", message);
        }
      },
    },
  },
  development: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432"),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: 2,
      max: 50,
      acquireTimeoutMillis: 90000, // 90 seconds
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false,
    },
    acquireConnectionTimeout: 90000,
    useNullAsDefault: true,
    log: {
      warn(message) {
        console.warn("[DB WARNING]", message);
      },
      error(message) {
        console.error("[DB ERROR]", message);
      },
      deprecate(message) {
        console.warn("[DB DEPRECATED]", message);
      },
      debug(message) {
        if (process.env.DB_DEBUG === "true") {
          console.log("[DB DEBUG]", message);
        }
      },
    },
  },
};

export default config;
