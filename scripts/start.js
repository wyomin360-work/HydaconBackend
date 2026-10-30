const SUPPORTED_ENVIRONMENTS = Object.freeze({
  DEVELOPMENT: "development",
  PRODUCTION: "production",
});

function configureEnvironment(environment) {
  const supportedEnvironments = Object.values(SUPPORTED_ENVIRONMENTS);

  if (!supportedEnvironments.includes(environment)) {
    throw new Error(
      `Unsupported environment. Use one of: ${supportedEnvironments.join(", ")}`,
    );
  }

  process.env.NODE_ENV = environment;
  require("../src/config/env.config");
}

function startServer() {
  const environment = process.argv[2];
  configureEnvironment(environment);
  require("../server");
}

startServer();
