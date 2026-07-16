const Product = require("../../schemas/product.schema");
const Document = require("../../schemas/document.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");
const AppError = require("../../utils/appError");
const { calculateCoverage } = require("./product.calculation");

const DOCUMENT_POPULATE = [
  { path: "tdsDocument" },
  { path: "msdsDocument" },
  { path: "brochureDocument" },
  { path: "catalogueDocument" },
];

const normalizeTag = (tag) =>
  typeof tag === "string" ? tag.trim().toLowerCase().replace(/\s+/g, "-") : tag;

const normalizeArray = (arr) =>
  Array.isArray(arr) ? arr.map(normalizeTag).filter(Boolean) : [];

async function getProduct(productId) {
  const product = await Product.findById(productId)
    .populate(DOCUMENT_POPULATE)
    .lean();
  if (!product) sendFailResponse("product not found");
  // Convert specifications Map → plain object for JSON serialisation
  if (product?.specifications) {
    product.specifications = Object.fromEntries(
      Object.entries(product.specifications),
    );
  }
  return { data: product };
}

async function productList(data) {
  const {
    page = 1,
    limit = 10,
    search = "",
    sortBy = "createdAt",
    sortOrder = "desc",
    categoryId,
    filters = {},
  } = data;

  const skip = (page - 1) * limit;

  let query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  if (categoryId) {
    query.categoryId = categoryId;
  }

  if (filters.active !== undefined) {
    query.active = filters.active;
  }
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    query.price = {};
    if (filters.minPrice !== undefined)
      query.price.$gte = Number(filters.minPrice);
    if (filters.maxPrice !== undefined)
      query.price.$lte = Number(filters.maxPrice);
  }
  if (filters.minPoints !== undefined || filters.maxPoints !== undefined) {
    query.rewardPoints = {};
    if (filters.minPoints !== undefined)
      query.rewardPoints.$gte = Number(filters.minPoints);
    if (filters.maxPoints !== undefined)
      query.rewardPoints.$lte = Number(filters.maxPoints);
  }
  if (filters.weightValue !== undefined) {
    query.weightValue = Number(filters.weightValue);
  }
  if (filters.weightUnit) {
    query.weightUnit = filters.weightUnit;
  }

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  const products =
    (await Product.find(query)
      .populate(DOCUMENT_POPULATE)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean()) ?? [];

  const totalProducts = await Product.countDocuments(query);

  return {
    data: {
      products,
      limit,
      totalPages: Math.ceil(totalProducts / limit),
      total: totalProducts,
      page,
    },
  };
}

function extractDocId(val) {
  if (!val || val === "") return null;
  if (typeof val === "object") return val.id || val._id || null;
  return val;
}

async function createProduct(productData) {
  const {
    name,
    description,
    images,
    featuredImage,
    price,
    rewardPoints,
    weightValue,
    weightUnit,
    netWeight,
    features,
    specifications,
    tdsDocument,
    coverage,
    roomTypes,
    areaTypes,
    applicationAreas,
    substrateTypes,
    applicationTypes,
    tileTypes,
    additionalTags,
    msdsDocument,
    brochureDocument,
    catalogueDocument,
    categoryId,
  } = productData;

  const product = await Product.create({
    name,
    description,
    images,
    price,
    rewardPoints,
    weightValue,
    weightUnit,
    netWeight,
    features: features || [],
    specifications: specifications || {},
    tdsDocument: extractDocId(tdsDocument),
    msdsDocument: extractDocId(msdsDocument),
    brochureDocument: extractDocId(brochureDocument),
    catalogueDocument: extractDocId(catalogueDocument),
    featuredImage,
    coverage,
    roomTypes: normalizeArray(roomTypes),
    areaTypes: normalizeArray(areaTypes),
    applicationAreas: normalizeArray(applicationAreas),
    substrateTypes: normalizeArray(substrateTypes),
    applicationTypes: normalizeArray(applicationTypes),
    tileTypes: normalizeArray(tileTypes),
    additionalTags: normalizeArray(additionalTags),
    categoryId: categoryId || null,
  });

  const populatedProduct = await Product.findById(product._id).populate(
    DOCUMENT_POPULATE,
  );
  return {
    message: "Product created",
    data: { product: populatedProduct, productCreated: true },
  };
}

async function updateProduct(productData, productId) {
  const {
    name,
    description,
    images,
    featuredImage,
    price,
    rewardPoints,
    weightValue,
    weightUnit,
    netWeight,
    features,
    specifications,
    tdsDocument,
    msdsDocument,
    brochureDocument,
    catalogueDocument,
    categoryId,
    active,
    coverage,
    roomTypes,
    areaTypes,
    applicationAreas,
    substrateTypes,
    applicationTypes,
    tileTypes,
    additionalTags,
  } = productData;

  const updateFields = {
    name,
    description,
    images,
    featuredImage,
    price,
    rewardPoints,
    weightValue,
    weightUnit,
    active,
    coverage,
    tdsDocument: extractDocId(tdsDocument),
    msdsDocument: extractDocId(msdsDocument),
    brochureDocument: extractDocId(brochureDocument),
    catalogueDocument: extractDocId(catalogueDocument),
  };

  if (netWeight !== undefined) updateFields.netWeight = netWeight;
  if (features !== undefined) updateFields.features = features;
  if (specifications !== undefined)
    updateFields.specifications = specifications;
  if (categoryId !== undefined) updateFields.categoryId = categoryId || null;

  if (roomTypes !== undefined)
    updateFields.roomTypes = normalizeArray(roomTypes);
  if (areaTypes !== undefined)
    updateFields.areaTypes = normalizeArray(areaTypes);
  if (applicationAreas !== undefined)
    updateFields.applicationAreas = normalizeArray(applicationAreas);
  if (substrateTypes !== undefined)
    updateFields.substrateTypes = normalizeArray(substrateTypes);
  if (applicationTypes !== undefined)
    updateFields.applicationTypes = normalizeArray(applicationTypes);
  if (tileTypes !== undefined)
    updateFields.tileTypes = normalizeArray(tileTypes);
  if (additionalTags !== undefined)
    updateFields.additionalTags = normalizeArray(additionalTags);

  await Product.findByIdAndUpdate(productId, { $set: updateFields });

  const updatedProduct =
    await Product.findById(productId).populate(DOCUMENT_POPULATE);
  return {
    message: "Product updated",
    data: { product: updatedProduct, productUpdated: true },
  };
}

async function deleteProduct(productId) {
  await Product.findByIdAndDelete(productId);
  return { message: "Product deleted", data: { productDeleted: true } };
}

async function calculateProductCoverage(calculationData) {
  const {
    productId,
    area,
    areaUnit,
    tileWidth,
    tileLength,
    tileThickness,
    jointWidth,
  } = calculationData;
  if (!productId) {
    throw new AppError("Product ID is required.", 400);
  }

  const product = await Product.findById(productId).lean();
  if (!product) {
    throw new AppError(`Product with ID '${productId}' not found.`, 404);
  }

  const result = calculateCoverage(product, {
    area: Number(area),
    areaUnit,
    tileWidth: tileWidth !== undefined ? Number(tileWidth) : undefined,
    tileLength: tileLength !== undefined ? Number(tileLength) : undefined,
    tileThickness:
      tileThickness !== undefined ? Number(tileThickness) : undefined,
    jointWidth: jointWidth !== undefined ? Number(jointWidth) : undefined,
  });

  return {
    data: result,
  };
}

async function seedMockProducts() {
  // Purge any legacy product documents that used invalid non-hex string IDs
  await Product.collection.deleteMany({ _id: { $not: { $type: "objectId" } } });

  const mockProducts = [
    {
      _id: "6695ecb8b3f2a52f4c8b4567",
      name: "Hydacon TileBond Ultra",
      description:
        "A premium-grade, highly flexible polymer-modified cementitious tile adhesive.",
      weightValue: 25,
      weightUnit: "kg",
      price: 450,
      rewardPoints: 10,
      active: true,
      roomTypes: ["bathroom", "kitchen", "living-room", "balcony"],
      areaTypes: ["wet-area", "dry-area", "indoor", "outdoor"],
      applicationAreas: ["floor", "wall"],
      substrateTypes: ["concrete", "cement-screed", "existing-tiles"],
      applicationTypes: ["tile-installation"],
      tileTypes: ["ceramic", "porcelain", "natural-stone"],
      additionalTags: ["high-flexibility", "premium-grade"],
      coverage: {
        enabled: true,
        calculationType: "AREA",
        coveragePerUnit: 55,
        coverageUnit: "sqft",
        packageWeight: 25,
        packageUnit: "kg",
        calculatorConfig: {
          wastagePercentage: 0,
          rounding: "UP",
        },
      },
    },
    {
      _id: "6695ecb8b3f2a52f4c8b4568",
      name: "Hydacon TileGrout HS",
      description:
        "A high-performance, water-repellent, polymer-modified cementitious tile grout.",
      weightValue: 5,
      weightUnit: "kg",
      price: 250,
      rewardPoints: 5,
      active: true,
      roomTypes: ["bathroom", "kitchen", "balcony", "swimming-pool"],
      areaTypes: ["wet-area", "outdoor", "indoor"],
      applicationAreas: ["floor", "wall"],
      substrateTypes: ["concrete", "cement-screed", "existing-tiles"],
      applicationTypes: ["joint-filling"],
      tileTypes: ["ceramic", "porcelain", "glass-mosaic"],
      additionalTags: ["water-repellent", "high-performance"],
      coverage: {
        enabled: true,
        calculationType: "JOINT_FILLER",
        packageWeight: 5,
        packageUnit: "kg",
        calculatorConfig: {
          wastagePercentage: 0,
          rounding: "UP",
          materialDensity: 1.96,
          minTileSize: 100,
          maxTileSize: 1200,
          minJointWidth: 1,
          maxJointWidth: 20,
          minTileThickness: 2,
          maxTileThickness: 30,
        },
      },
    },
    {
      _id: "6695ecb8b3f2a52f4c8b4569",
      name: "Hydacon Joint Filler GF-100",
      description:
        "A premium-grade joint filler for tile and stone applications, offering stain-resistance and high flexibility.",
      weightValue: 1,
      weightUnit: "kg",
      price: 90,
      rewardPoints: 2,
      active: true,
      roomTypes: ["living-room", "kitchen", "bathroom"],
      areaTypes: ["dry-area", "wet-area", "indoor"],
      applicationAreas: ["floor", "wall"],
      substrateTypes: ["concrete", "cement-screed"],
      applicationTypes: ["joint-filling"],
      tileTypes: ["ceramic", "porcelain", "natural-stone"],
      additionalTags: ["stain-resistant", "flexible"],
      coverage: {
        enabled: true,
        calculationType: "JOINT_FILLER",
        packageWeight: 1,
        packageUnit: "kg",
        calculatorConfig: {
          wastagePercentage: 0,
          rounding: "UP",
          materialDensity: 1.96,
          minTileSize: 50,
          maxTileSize: 1500,
          minJointWidth: 1,
          maxJointWidth: 15,
          minTileThickness: 2,
          maxTileThickness: 25,
        },
      },
    },
    {
      _id: "6695ecb8b3f2a52f4c8b456a",
      name: "Hydacon HydroShield 2K",
      description:
        "A state-of-the-art, flexible, two-component polymer-modified waterproofing membrane.",
      weightValue: 30,
      weightUnit: "kg",
      price: 1800,
      rewardPoints: 40,
      active: true,
      roomTypes: ["bathroom", "swimming-pool", "terrace", "balcony"],
      areaTypes: ["wet-area", "outdoor"],
      applicationAreas: ["floor", "wall"],
      substrateTypes: ["concrete", "cement-screed"],
      applicationTypes: ["waterproofing"],
      tileTypes: [],
      additionalTags: ["two-component", "flexible"],
      coverage: {
        enabled: true,
        calculationType: "AREA",
        coveragePerUnit: 120,
        coverageUnit: "sqft",
        packageWeight: 30,
        packageUnit: "kg",
        calculatorConfig: {
          wastagePercentage: 5,
          rounding: "UP",
        },
      },
    },
    {
      _id: "6695ecb8b3f2a52f4c8b456b",
      name: "Hydacon LevelMax Self-Leveling",
      description:
        "A calcium-aluminate based, rapid-hardening self-leveling underlayment.",
      weightValue: 25,
      weightUnit: "kg",
      price: 650,
      rewardPoints: 15,
      active: true,
      roomTypes: ["living-room", "bedroom", "kitchen"],
      areaTypes: ["dry-area", "indoor"],
      applicationAreas: ["floor"],
      substrateTypes: ["concrete", "cement-screed"],
      applicationTypes: ["self-leveling"],
      tileTypes: [],
      additionalTags: ["rapid-hardening", "self-leveling"],
      coverage: {
        enabled: true,
        calculationType: "AREA",
        coveragePerUnit: 40,
        coverageUnit: "sqft",
        packageWeight: 25,
        packageUnit: "kg",
        calculatorConfig: {
          wastagePercentage: 0,
          rounding: "UP",
        },
      },
    },
    {
      _id: "6695ecb8b3f2a52f4c8b456c",
      name: "Hydacon TileBond Eco",
      description: "An eco-friendly, standard-setting cementitious adhesive.",
      weightValue: 25,
      weightUnit: "kg",
      price: 320,
      rewardPoints: 8,
      active: true,
      roomTypes: ["living-room", "bedroom"],
      areaTypes: ["dry-area", "indoor"],
      applicationAreas: ["floor"],
      substrateTypes: ["concrete", "cement-screed"],
      applicationTypes: ["tile-installation"],
      tileTypes: ["ceramic"],
      additionalTags: ["eco-friendly", "standard-cementitious"],
      coverage: {
        enabled: true,
        calculationType: "AREA",
        coveragePerUnit: 45,
        coverageUnit: "sqft",
        packageWeight: 25,
        packageUnit: "kg",
        calculatorConfig: {
          wastagePercentage: 0,
          rounding: "UP",
        },
      },
    },
  ];

  for (const prod of mockProducts) {
    const normalizedProd = {
      ...prod,
      roomTypes: normalizeArray(prod.roomTypes),
      areaTypes: normalizeArray(prod.areaTypes),
      applicationAreas: normalizeArray(prod.applicationAreas),
      substrateTypes: normalizeArray(prod.substrateTypes),
      applicationTypes: normalizeArray(prod.applicationTypes),
      tileTypes: normalizeArray(prod.tileTypes),
      additionalTags: normalizeArray(prod.additionalTags),
    };
    await Product.findByIdAndUpdate(
      prod._id,
      { $set: normalizedProd },
      { upsert: true, new: true },
    );
    console.log(`Updated mock product: ${prod.name}`);
  }
}

async function recommendProducts(criteria) {
  const {
    roomType,
    areaType,
    applicationArea,
    substrateType,
    applicationType,
    tileType,
    tags,
  } = criteria;

  const normRoomType = normalizeTag(roomType);
  const normAreaType = normalizeTag(areaType);
  const normAppArea = normalizeTag(applicationArea);
  const normSubstrate = normalizeTag(substrateType);
  const normAppType = normalizeTag(applicationType);
  const normTileType = normalizeTag(tileType);
  const normTags = normalizeArray(tags);

  const query = {
    active: true,
  };

  if (normRoomType) {
    query.roomTypes = normRoomType;
  }
  if (normAreaType) {
    query.areaTypes = normAreaType;
  }
  if (normAppArea) {
    query.applicationAreas = normAppArea;
  }
  if (normSubstrate) {
    query.substrateTypes = normSubstrate;
  }
  if (normAppType) {
    query.applicationTypes = normAppType;
  }
  if (normTileType) {
    query.tileTypes = normTileType;
  }
  if (normTags && normTags.length > 0) {
    query.additionalTags = { $all: normTags };
  }

  let products = await Product.find(query).populate("tdsDocument").lean();
  let isFallback = false;

  // Tier 1 Fallback: Drop tags but retain structural and tileType filters if applicable
  if (
    products.length === 0 &&
    ((normTags && normTags.length > 0) || normTileType)
  ) {
    isFallback = true;
    const tier1Query = {
      active: true,
    };
    if (normRoomType) tier1Query.roomTypes = normRoomType;
    if (normAreaType) tier1Query.areaTypes = normAreaType;
    if (normAppArea) tier1Query.applicationAreas = normAppArea;
    if (normSubstrate) tier1Query.substrateTypes = normSubstrate;
    if (normAppType) tier1Query.applicationTypes = normAppType;
    if (normTileType) tier1Query.tileTypes = normTileType;
    products = await Product.find(tier1Query).populate("tdsDocument").lean();
  }

  // Tier 2 Fallback: Broad fallback based only on active, roomType, and applicationType
  if (products.length === 0 && (normRoomType || normAppType)) {
    isFallback = true;
    const tier2Query = {
      active: true,
    };
    if (normRoomType) tier2Query.roomTypes = normRoomType;
    if (normAppType) tier2Query.applicationTypes = normAppType;
    products = await Product.find(tier2Query).populate("tdsDocument").lean();
  }

  return {
    data: {
      products,
      isFallback,
    },
  };
}

module.exports = {
  createProduct,
  updateProduct,
  getProduct,
  productList,
  deleteProduct,
  calculateProductCoverage,
  seedMockProducts,
  recommendProducts,
};
