const videoCreateRequestType = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    description: { type: "string" },
    thumbnailUrl: { type: "string", format: "uri" },
    videoUrl: { type: "string", format: "uri" },
    duration: { type: "string" },
    categoryId: { type: "string", pattern: "^([0-9a-fA-F]{24}|)$" },
    productId: { type: "string", pattern: "^([0-9a-fA-F]{24}|)$" },
    tags: { type: "array", items: { type: "string" } },
    language: { type: "string" },
    region: { type: "string" },
    sortOrder: { type: "integer", minimum: 0 },
    featured: { type: "boolean" },
    active: { type: "boolean" },
  },
  required: ["title", "thumbnailUrl", "videoUrl"],
  additionalProperties: true,
};

const videoUpdateRequestType = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    description: { type: "string" },
    thumbnailUrl: { type: "string", format: "uri" },
    videoUrl: { type: "string", format: "uri" },
    duration: { type: "string" },
    categoryId: { type: "string", pattern: "^([0-9a-fA-F]{24}|)$" },
    productId: { type: "string", pattern: "^([0-9a-fA-F]{24}|)$" },
    tags: { type: "array", items: { type: "string" } },
    language: { type: "string" },
    region: { type: "string" },
    sortOrder: { type: "integer", minimum: 0 },
    featured: { type: "boolean" },
    active: { type: "boolean" },
  },
  additionalProperties: true,
};

module.exports = {
  videoCreateRequestType,
  videoUpdateRequestType,
};
