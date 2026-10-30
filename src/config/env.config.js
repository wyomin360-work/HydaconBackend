const path = require("path");
const dotenv = require("dotenv");

const DEVELOPMENT_ENVIRONMENT = "development";
const DEVELOPMENT_ENV_FILE = path.resolve(
  __dirname,
  "../../env/.env.development",
);
const DEFAULT_ENV_FILE = path.resolve(__dirname, "../../.env");

const envFile =
  process.env.NODE_ENV === DEVELOPMENT_ENVIRONMENT
    ? DEVELOPMENT_ENV_FILE
    : DEFAULT_ENV_FILE;

dotenv.config({ path: envFile });
