const Product = require("../../schemas/product.schema");
const Document = require("../../schemas/document.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");

const DOCUMENT_POPULATE = [
  { path: "tdsDocument" },
  { path: "msdsDocument" },
  { path: "brochureDocument" },
  { path: "catalogueDocument" },
];

async function getProduct(productId) {
  const product = await Product.findById(productId)
    .populate(DOCUMENT_POPULATE)
    .lean();
  if (!product) sendFailResponse("product not found");
  // Convert specifications Map → plain object for JSON serialisation
  if (product?.specifications) {
    product.specifications = Object.fromEntries(
      Object.entries(product.specifications)
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
    applicationAreas,
    applicationTypes,
    areaTypes,
    roomTypes,
    substrateTypes,
    tileTypes,
    additionalTags,
    tdsDocument,
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
    applicationAreas: applicationAreas || [],
    applicationTypes: applicationTypes || [],
    areaTypes: areaTypes || [],
    roomTypes: roomTypes || [],
    substrateTypes: substrateTypes || [],
    tileTypes: tileTypes || [],
    additionalTags: additionalTags || [],
    tdsDocument: extractDocId(tdsDocument),
    msdsDocument: extractDocId(msdsDocument),
    brochureDocument: extractDocId(brochureDocument),
    catalogueDocument: extractDocId(catalogueDocument),
    featuredImage,
    categoryId: categoryId || null,
  });

  const populatedProduct = await Product.findById(product._id).populate(DOCUMENT_POPULATE);
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
    applicationAreas,
    applicationTypes,
    areaTypes,
    roomTypes,
    substrateTypes,
    tileTypes,
    additionalTags,
    tdsDocument,
    msdsDocument,
    brochureDocument,
    catalogueDocument,
    categoryId,
    active,
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
    tdsDocument: extractDocId(tdsDocument),
    msdsDocument: extractDocId(msdsDocument),
    brochureDocument: extractDocId(brochureDocument),
    catalogueDocument: extractDocId(catalogueDocument),
  };

  if (netWeight !== undefined) updateFields.netWeight = netWeight;
  if (features !== undefined) updateFields.features = features;
  if (specifications !== undefined) updateFields.specifications = specifications;
  if (applicationAreas !== undefined) updateFields.applicationAreas = applicationAreas;
  if (applicationTypes !== undefined) updateFields.applicationTypes = applicationTypes;
  if (areaTypes !== undefined) updateFields.areaTypes = areaTypes;
  if (roomTypes !== undefined) updateFields.roomTypes = roomTypes;
  if (substrateTypes !== undefined) updateFields.substrateTypes = substrateTypes;
  if (tileTypes !== undefined) updateFields.tileTypes = tileTypes;
  if (additionalTags !== undefined) updateFields.additionalTags = additionalTags;
  if (categoryId !== undefined) updateFields.categoryId = categoryId || null;

  await Product.findByIdAndUpdate(productId, { $set: updateFields });

  const updatedProduct = await Product.findById(productId).populate(DOCUMENT_POPULATE);
  return {
    message: "Product updated",
    data: { product: updatedProduct, productUpdated: true },
  };
}

async function deleteProduct(productId) {
  await Product.findByIdAndDelete(productId);
  return { message: "Product deleted", data: { productDeleted: true } };
}

module.exports = {
  createProduct,
  updateProduct,
  getProduct,
  productList,
  deleteProduct,
};
