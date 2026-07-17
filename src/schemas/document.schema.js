const { default: mongoose } = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    docId: { type: String, required: true, index: true },
    docName: { type: String, required: true },
    docSize: { type: Number, required: false }, // Store size in bytes or formatted string, based on usage
    docType: { type: String, required: true },
    docUrl: { type: String, required: true },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    number: { type: String, required: false },
    comment: { type: String, required: false },
    lock: { type: Boolean, default: false },
    status: { type: String, default: "PENDING" },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (doc, ret) => {
        ret.id = doc._id;
        return ret;
      },
    },
  },
);

const Document = mongoose.model("Document", documentSchema);

module.exports = Document;
