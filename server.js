require("dotenv").config();

const app = require("./src/app");
const Database = require("./src/config/mongodb.config");
const { logger } = require("./src/config/pino.config");

const PORT = process.env.PORT || 5000;
const db = new Database();

// Handle uncaught Errors
process.on("uncaughtException", (err) => {
  logger.fatal(
    { message: err.message, stack: err.stack },
    "Uncaught Exception",
  );
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  logger.fatal(
    { message: err.message, stack: err.stack },
    "Unhandled Rejection",
  );
  server.close(() => {
    process.exit(1); // Exit after cleanup
  });
});


// Add this in src/app.js, right after your 'app' constant is defined
app.use((req, res, next) => {
  // This will print to your terminal every time ANY request hits the server
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next(); // This is required, otherwise the app will hang
});
const startServer = async () => {
  try {
    await db.connectDb();
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

