const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.sendgrid.net",
  port: 2525, //587,
  secure: false,
  auth: {
    user: "apikey",
    pass: process.env.SEND_GRID_API_KEY,
  },
  debug: true,
  logger: true,
});

const sendMail = async (data) => {
  let metadata = {
    from: `"Hydacon Support" <${process.env.SEND_GRID_FROM_MAIL}>`,
    ...data,
  };
  try {
    const info = await transporter.sendMail(metadata);
    console.log("Mail sent", info.response);
    return true;
  } catch (error) {
    console.error("Error sending mail", error);
    return false;
  }
};

module.exports = {
  sendMail,
};
