const express = require("express");
const morgan = require("morgan");
const pinoHttp = require("pino-http");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const path = require("path");

// file imports
const swaggerSpec = require("./config/swagger.config");
const logger = require("./config/pino.config");
const errorHandler = require("./middlewares/errorHandler");
const globalRoutes = require("./routes/global.routes");
const AppError = require("./utils/appError");

const app = express();
app.disable("etag"); // Always return 200 with body instead of 304 Not Modified

// Log every incoming request in the console
app.use((req, res, next) => {
  console.log(`\x1b[36m[${new Date().toISOString()}]\x1b[0m \x1b[32m${req.method}\x1b[0m ${req.url}`);
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
app.use(express.json());

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

app.use("/api/v1", globalRoutes);

// Handle 404
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl}`, 404));
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
