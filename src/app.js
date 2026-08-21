const express = require("express");
const morgan = require("morgan");
const pinoHttp = require("pino-http");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const path = require("path");
const mongoose = require("mongoose");

// file imports
const swaggerSpec = require("./config/swagger.config");
const logger = require("./config/pino.config");
const errorHandler = require("./middlewares/errorHandler");
const globalRoutes = require("./routes/global.routes");
const webhookRoutes = require("./modules/webhooks/webhooks.routes");
const AppError = require("./utils/appError");
const translate = require("./utils/translator");

const app = express();
app.disable("etag"); // Always return 200 with body instead of 304 Not Modified

// Log every incoming request in the console
app.use((req, res, next) => {
  console.log(
    `\x1b[36m[${new Date().toISOString()}]\x1b[0m \x1b[32m${req.method}\x1b[0m ${req.url}`,
  );
  next();
});

// const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');

// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin) return callback(null, true);
//     if (allowedOrigins.includes(origin)) {
//       return callback(null, true);
//     } else {
//       return callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
// }));

// For development, allow all origins. In production, restrict this appropriately using function above.
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// app.use(morgan("dev"));
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(
  pinoHttp({
    logger: logger.logger,
    customLogLevel: function (res, err) {
      //   console.log('customLogLevel called:', { statusCode: res.statusCode, err: !!err });
      // console.log(err);
      if (res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      if (res.statusCode >= 200) return "info";
      return "info";
    },
  }),
);

app.use((req, res, next) => {
  if (req.path.includes("/api/v1/user/auth/simple-login-with-otp")) {
    console.log("--- DEBUG LOG ---");
    console.log("Method:", req.method);
    console.log("Path:", req.path);
    console.log("Body Content:", JSON.stringify(req.body, null, 2));
    console.log("-----------------");
  }
  next();
});

// Serve Swagger docs
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  logger.info("Root endpoint hit", { route: "/" });
  res.send({ message: "Hello World" });
});

app.get("/health", (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const statusCode = isDbConnected ? 200 : 503;
  res.status(statusCode).json({
    status: isDbConnected ? "ok" : "degraded",
    database: isDbConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res, next) => {
  const lang = req.headers["accept-language"] || "en_US";
  const originalJson = res.json;
  res.json = function (body) {
    if (body) {
      if (typeof body.message === "string") {
        body.message = translate(body.message, lang);
      }
      if (body.data && typeof body.data.message === "string") {
        body.data.message = translate(body.data.message, lang);
      }
    }
    return originalJson.call(this, body);
  };
  next();
});

app.use("/api/v1", globalRoutes);
app.use("/webhooks", webhookRoutes);

// Handle 404
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl}`, 404));
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
