const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

class Database {
    constructor() {
        this.mongodbUrl = process.env.MONGODB_URL;
    }

    async connectDb() {
        try {
            await mongoose.connect(this.mongodbUrl);
            console.log("✅ Connected to MongoDB");
        } catch (error) {
            console.error("❌ Failed to connect to MongoDB:", error);
            process.exit(1);
        }
    }

    async disconnectDb() {
        try {
            await mongoose.disconnect();
            console.log("🔌 Disconnected from MongoDB");
        } catch (error) {
            console.log("❌ Failed to disconnect:", error);
        }
    }
}

module.exports = Database;
