const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client()

const WEB_GOOGLE_CLIENT_ID = process.env.WEB_GOOGLE_CLIENT_ID;
const MOBILE_GOOGLE_CLIENT_ID = process.env.MOBILE_GOOGLE_CLIENT_ID;


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


module.exports = { verifyGoogleToken }