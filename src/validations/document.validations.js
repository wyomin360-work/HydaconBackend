const addDocumentRequestType = {
  type: "object",
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          docId: { type: "string" },
          docName: { type: "string" },
          docSize: { type: "number" },
          docType: { type: "string" },
          docUrl: { type: "string" },
          number: { type: "string" },
        },
        required: ["docId", "docName", "docType", "docUrl"],
        additionalProperties: true,
      },
      minItems: 1,
    },
  },
  required: ["documents"],
  additionalProperties: true,
};

const updateDocumentRequestType = {
  type: "object",
  properties: {
    docName: { type: "string" },
    docSize: { type: "number" },
    comment: { type: "string" },
    number: { type: "string" },
    lock: { type: "boolean" },
    status: { type: "string" },
  },
  additionalProperties: true,
};

module.exports = {
  addDocumentRequestType,
  updateDocumentRequestType,
};
