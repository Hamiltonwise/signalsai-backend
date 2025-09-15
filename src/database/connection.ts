import knex from "knex";
import config from "./config";

// Get the environment (default to development)
const environment = process.env.NODE_ENV || "development";

// Create and export the database connection
export const db = knex(config[environment]);

// Test connection function
export const testConnection = async (): Promise<boolean> => {
  try {
    await db.raw("SELECT 1");
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
};

// Graceful shutdown function
export const closeConnection = async (): Promise<void> => {
  try {
    await db.destroy();
    console.log("🔌 Database connection closed");
  } catch (error) {
    console.error("Error closing database connection:", error);
  }
};

// Health check function
export const healthCheck = async (): Promise<{
  status: string;
  message: string;
  timestamp: Date;
}> => {
  try {
    await db.raw("SELECT 1");
    return {
      status: "healthy",
      message: "Database connection is active",
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      message: `Database connection failed: ${error}`,
      timestamp: new Date(),
    };
  }
};

export default db;
