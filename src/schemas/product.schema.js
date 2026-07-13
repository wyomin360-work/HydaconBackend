const { default: mongoose } = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    name: { type: String, required: true },
    description: { type: String, required: true },
    weightValue: { type: Number, required: true },
    weightUnit: { type: String, required: true, enum: ["kg", "g", "l", "ml"] },
    tdsDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: false,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiftCategory", // Using GiftCategory for now as it's the only category model
      required: false,
    },
    price: { type: Number, required: false },
    images: { type: [String], required: false, default: [] },
    featuredImage: { type: String, required: false },
    rewardPoints: { type: Number, required: true, default: 0 },
    active: { type: Boolean, default: true },
    roomTypes: { type: [String], default: [] },
    areaTypes: { type: [String], default: [] },
    applicationAreas: { type: [String], default: [] },
    substrateTypes: { type: [String], default: [] },
    applicationTypes: { type: [String], default: [] },
    tileTypes: { type: [String], default: [] },
    additionalTags: { type: [String], default: [] },
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
        maxTileThickness: { type: Number },
      },
    },
  },
  { timestamps: true },
);

productSchema.index({
  roomTypes: 1,
  areaTypes: 1,
  substrateTypes: 1,
  applicationTypes: 1,
});

const Product = mongoose.model("Product", productSchema);
module.exports = Product;
