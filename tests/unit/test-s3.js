require("dotenv").config();
const { checkS3FileExists } = require("../../src/utils/s3");

async function run() {
  const url =
    "https://test-bucket.s3.us-east-1.amazonaws.com/uploads/products/hydaclean_ns/tds/invoice_13_Foundation.pdf";
  console.log("Checking...", url);
  const result = await checkS3FileExists(url);
  console.log("Result:", result);
}
run();
