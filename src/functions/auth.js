const { default: axios } = require("axios");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");

const client = new OAuth2Client();

const WEB_GOOGLE_CLIENT_ID = process.env.WEB_GOOGLE_CLIENT_ID;
const MOBILE_GOOGLE_CLIENT_ID = process.env.MOBILE_GOOGLE_CLIENT_ID;
const APPLE_PUBLIC_KEYS_URL = "https://appleid.apple.com/auth/keys";

const verifyGoogleToken = async (idToken) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [WEB_GOOGLE_CLIENT_ID, MOBILE_GOOGLE_CLIENT_ID],
    });
    const payload = ticket.getPayload();
    if (!payload) {
      return {
        isData: false,
        message: "Payload missing",
      };
    }

    return {
      isData: true,
      message: "Verification successful",
      ...payload,
    };
  } catch (error) {
    console.log(error);
    return {
      isData: false,
      message: "Invalid token",
      error,
    };
  }
};

async function verifyAppleIdentityToken(identityToken) {
  try {
    const { data } = await axios.get(APPLE_PUBLIC_KEYS_URL);
    const appleKeys = data.keys;

    const header = JSON.parse(
      Buffer.from(identityToken.split(".")[0], "base64").toString("utf8"),
    );

    const appleKey = appleKeys.find((key) => key.kid === header.kid);
    if (!appleKey) {
      throw new Error("Invalid Apple public key");
    }

    const publicKey = jwkToPem(appleKey);

    const payload = jwt.verify(identityToken, publicKey, {
      algorithms: ["RS256"],
      issuer: "https://appleid.apple.com",
    });

    return { isData: true, message: "Verification successful", ...payload };
  } catch (error) {
    return {
      isData: false,
      message: "Invalid Apple data provided or Apple ID banned",
    };
  }
}

module.exports = { verifyGoogleToken, verifyAppleIdentityToken };
