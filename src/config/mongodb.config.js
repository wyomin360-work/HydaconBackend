const mongoose = require("mongoose");
const dotenv = require("dotenv");
const logger = require("./pino.config");

dotenv.config();

class Database {
  constructor() {
    this.mongodbUrl = process.env.MONGODB_URL;
    this.maxRetries = 5;
    this.connectionOptions = {
      serverSelectionTimeoutMS: 5000, // 5s timeout on server selection
      connectTimeoutMS: 10000, // 10s initial connection timeout
      socketTimeoutMS: 45000, // 45s socket inactivity timeout
      maxPoolSize: 50, // Up to 50 socket connections
      minPoolSize: 10, // Keep at least 10 connections warm
      heartbeatFrequencyMS: 10000, // Health check node every 10s
    };

    this._setupEventListeners();
  }

  _setupEventListeners() {
    mongoose.connection.on("connected", () => {
      logger.info("✅ Connected to MongoDB");
    });

    mongoose.connection.on("error", (err) => {
      logger.error("❌ MongoDB Connection Error", { error: err.message });
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn(
        "⚠️ MongoDB Disconnected. Reconnection will be attempted automatically.",
      );
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("🔄 MongoDB Reconnected successfully");
    });
  }

  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  async connectDb() {
    let attempt = 0;
    while (attempt < this.maxRetries) {
      try {
        attempt++;
        logger.info(
          `Connecting to MongoDB (Attempt ${attempt}/${this.maxRetries})...`,
        );
        await mongoose.connect(this.mongodbUrl, this.connectionOptions);
        return;
      } catch (error) {
        logger.error(`❌ MongoDB connection attempt ${attempt} failed:`, {
          error: error.message,
        });

        if (attempt >= this.maxRetries) {
          logger.fatal(
            "💥 Max MongoDB connection retries reached. Exiting process.",
          );
          process.exit(1);
        }

        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s, 16s...
        logger.info(`Waiting ${delay / 1000}s before next connection retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async disconnectDb() {
    try {
      await mongoose.disconnect();
      logger.info("🔌 Disconnected from MongoDB");
    } catch (error) {
      logger.error("❌ Failed to disconnect from MongoDB:", {
        error: error.message,
      });
    }
  }
}

module.exports = Database;
