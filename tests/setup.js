// Jest must never inherit credentials from the application's root .env file.
// Integration tests may opt into a dedicated test database through
// TEST_MONGODB_URL; the withdrawal suite pins its database name explicitly.
process.env.NODE_ENV = "test";

// Load only MONGODB_URL from the root .env so integration tests that spin up
// real Mongoose connections (e.g. withdrawals.test.js) can reach Atlas.
// All other secrets are stubbed below so tests never need real credentials.
if (!process.env.MONGODB_URL) {
  require("dotenv").config();
}

// Provide fallback secrets for testing in CI or locally if .env is missing
process.env.ENCRYPTION_SECRET =
  process.env.ENCRYPTION_SECRET || "test_encryption_secret_fallback";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_fallback";
// The S3 client is imported by many services during module initialization.
// Give tests inert credentials so importing those services never requires a
// developer's AWS account or a local .env file.
process.env.AWS_BUCKET_NAME =
  process.env.AWS_BUCKET_NAME || "hydacon-test-bucket";
process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
process.env.AWS_ACCESS_KEY_ID =
  process.env.AWS_ACCESS_KEY_ID || "test-access-key";
process.env.AWS_SECRET_ACCESS_KEY =
  process.env.AWS_SECRET_ACCESS_KEY || "test-secret-key";
