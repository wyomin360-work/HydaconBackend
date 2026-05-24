const nodemailer = require("nodemailer");

function createTransporter() {
  if (process.env.GOOGLE_APP_PASSWORD && process.env.GOOGLE_USER_MAIL) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GOOGLE_USER_MAIL,
        pass: process.env.GOOGLE_APP_PASSWORD,
      },
    });
  }

  if (process.env.SEND_GRID_API_KEY) {
    return nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: process.env.SEND_GRID_API_KEY,
      },
    });
  }

  return null;
}

const transporter = createTransporter();

const sendMail = async (data) => {
  if (!transporter) {
    console.error(
      "[Mail] No transport configured (set GOOGLE_APP_PASSWORD or SEND_GRID_API_KEY)",
    );
    return false;
  }

  const fromMail =
    process.env.GOOGLE_USER_MAIL || process.env.SEND_GRID_FROM_MAIL;

  const metadata = {
    from: `"Hydacon Support" <${fromMail}>`,
    ...data,
  };

  try {
    const info = await transporter.sendMail(metadata);
    console.log("[Mail] sent", info.messageId, info.response);
    return true;
  } catch (error) {
    console.error("[Mail] error", error.message);
    return false;
  }
};

module.exports = {
  sendMail,
};
