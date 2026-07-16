const { default: mongoose } = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    name: { type: String, required: true },
    description: { type: String, required: true },
    weightValue: { type: Number, required: true },
    weightUnit: { type: String, required: true, enum: ["kg", "g", "l", "ml"] },
    netWeight: { type: String, required: false },

    // Rich content fields
    features: { type: [String], required: false, default: [] },
    specifications: { type: Map, of: String, required: false, default: {} },
    applicationAreas: { type: [String], required: false, default: [] },
    applicationTypes: { type: [String], required: false, default: [] },
    areaTypes: { type: [String], required: false, default: [] },
    roomTypes: { type: [String], required: false, default: [] },
    substrateTypes: { type: [String], required: false, default: [] },
    tileTypes: { type: [String], required: false, default: [] },
    additionalTags: { type: [String], required: false, default: [] },

    // Documents
    tdsDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: false,
    },
    msdsDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: false,
    },
    brochureDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: false,
    },
    catalogueDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: false,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftCategory",
      required: false,
    },
    price: { type: Number, required: false },
    images: { type: [String], required: false, default: [] },
    featuredImage: { type: String, required: false },
    rewardPoints: { type: Number, required: true, default: 0 },
    active: { type: Boolean, default: true },
    coverage: {
      enabled: { type: Boolean, default: false },
      calculationType: { type: String, enum: ["AREA", "JOINT_FILLER"] },
      coveragePerUnit: { type: Number },
      coverageUnit: { type: String, enum: ["sqft", "sqm"] },
      packageWeight: { type: Number },
      packageUnit: { type: String, enum: ["kg", "ltr"] },
      calculatorConfig: {
        wastagePercentage: { type: Number },
        rounding: { type: String, enum: ["UP", "NEAREST"] },
        materialDensity: { type: Number }, // specific gravity
        minTileSize: { type: Number },
        maxTileSize: { type: Number },
        minJointWidth: { type: Number },
        maxJointWidth: { type: Number },
        minTileThickness: { type: Number },
        maxTileThickness: { type: Number }
      }
    }
  },
  { timestamps: true },
);

const Product = mongoose.model("Product", productSchema);
module.exports = Product;

