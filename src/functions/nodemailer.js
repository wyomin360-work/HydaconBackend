const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const handlebars = require("handlebars");

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

const templateCache = {};

const sendTemplateEmail = async (to, templateName, subject, data) => {
  try {
    const templatePath = path.resolve(__dirname, "../templates", `${templateName}.hbs`);
    
    let compiledTemplate = templateCache[templatePath];
    if (!compiledTemplate) {
      const templateSource = fs.readFileSync(templatePath, "utf-8");
      compiledTemplate = handlebars.compile(templateSource);
      templateCache[templatePath] = compiledTemplate;
    }

    const html = compiledTemplate(data);
    const text = html.replace(/<[^>]*>/g, "").trim();

    const mailOptions = {
      to,
      subject,
      text,
      html,
    };

    return await sendMail(mailOptions);
  } catch (error) {
    console.error(`[Mail] Error sending template email (${templateName}):`, error.message);
    return false;
  }
};

module.exports = {
  sendMail,
  sendTemplateEmail,
};
