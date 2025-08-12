
const express = require("express");
const morgan = require("morgan");
const pinoHttp = require("pino-http");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");

// file imports
const swaggerSpec = require("./config/swagger.config");
const logger = require("./config/pino.config");
const errorHandler = require("./middlewares/errorHandler");
const globalRoutes = require("./routes/global.routes");
const AppError = require("./utils/appError");

const app = express();

// app.use(morgan("dev"));
app.use(cors());
app.use(express.json());

app.use(pinoHttp({
    logger: logger.logger, customLogLevel: function (res,err) {
        //   console.log('customLogLevel called:', { statusCode: res.statusCode, err: !!err });
        // console.log(err);
        if (res.statusCode >= 500 ) return "error"
        if (res.statusCode >= 400) return "warn"
        if (res.statusCode >= 200) return "info"
        return "info"
    }
}))

// Serve Swagger docs
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));


app.get("/", (req, res) => {
    logger.info("Root endpoint hit", { route: '/' })
    res.send({message:"Hello World"});
});

app.use('/api/v1',globalRoutes)

// Handle 404
app.use((req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl}`, 404));
});

// Global Error Handler
app.use(errorHandler)

module.exports = app;