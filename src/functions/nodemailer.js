const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GOOGLE_USER_MAIL,
    pass: process.env.GOOGLE_APP_PASSWORD
  },
  debug: true,
  logger: true
})

const sendMail = async (data) => {
  try {
    const info = await transporter.sendMail(data);
    console.log('Mail sent', info.response);
    return true;
  } catch (error) {
    console.error('Error sending mail', error);
    return false;
  }
};


module.exports = {
  sendMail
}