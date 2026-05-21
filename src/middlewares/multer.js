const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads/images");
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    let trimmedName = file?.originalname?.trim()?.split(" ")?.join("_");
    cb(null, Date.now() + "-" + trimmedName);
  },
});

const upload = multer({ storage });

module.exports = upload;
