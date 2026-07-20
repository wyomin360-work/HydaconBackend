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

async function recommendProducts(criteria) {
  const {
    roomType,
    areaType,
    applicationArea,
    substrateType,
    applicationType,
    tileType,
    tags,
  } = criteria || {};

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
  recommendProducts,
};
