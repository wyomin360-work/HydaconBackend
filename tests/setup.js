require("dotenv").config();

// Provide fallback secrets for testing in CI or locally if .env is missing
process.env.ENCRYPTION_SECRET =
  process.env.ENCRYPTION_SECRET || "test_encryption_secret_fallback";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_fallback";
