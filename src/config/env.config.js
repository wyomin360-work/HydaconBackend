const path = require("path");
const dotenv = require("dotenv");

const DEVELOPMENT_ENVIRONMENT = "development";
const TEST_ENVIRONMENT = "test";
const DEVELOPMENT_ENV_FILE = path.resolve(
  __dirname,
  "../../env/.env.development",
);
const DEFAULT_ENV_FILE = path.resolve(__dirname, "../../.env");

if (process.env.NODE_ENV !== TEST_ENVIRONMENT) {
  const envFile =
    process.env.NODE_ENV === DEVELOPMENT_ENVIRONMENT
      ? DEVELOPMENT_ENV_FILE
      : DEFAULT_ENV_FILE;

  dotenv.config({ path: envFile });
}
