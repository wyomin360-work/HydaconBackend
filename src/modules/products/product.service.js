const Product = require("../../schemas/product.schema");
const Document = require("../../schemas/document.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");

async function getProduct(productId) {
  const product = await Product.findById(productId)
    .populate("tdsDocument")
    .lean();
  if (!product) sendFailResponse("product not found");
  return { data: product };
}

async function productList(data) {
  const {
    page = 1,
    limit = 10,
    search = "",
    sortBy = "createdAt",
    sortOrder = "desc",
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
      .populate("tdsDocument")
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

async function createProduct(productData) {
  let {
    name,
    description,
    images,
    featuredImage,
    price,
    rewardPoints,
    weightValue,
    weightUnit,
    tdsDocument,
  } = productData;

  if (tdsDocument === "") {
    tdsDocument = null;
  }

  const product = await Product.create({
    name,
    description,
    images,
    price,
    rewardPoints,
    weightValue,
    weightUnit,
    tdsDocument,
    featuredImage,
  });
  const populatedProduct = await Product.findById(product._id).populate(
    "tdsDocument",
  );
  return {
    message: "Product created",
    data: { product: populatedProduct, productCreated: true },
  };
}

async function updateProduct(productData, productId) {
  let {
    name,
    description,
    images,
    featuredImage,
    price,
    rewardPoints,
    weightValue,
    weightUnit,
    tdsDocument,
    active,
  } = productData;

  if (tdsDocument === "") {
    tdsDocument = null;
  }
  await Product.findByIdAndUpdate(productId, {
    $set: {
      name,
      description,
      images,
      featuredImage,
      price,
      rewardPoints,
      weightValue,
      weightUnit,
      tdsDocument,
      active,
    },
  });
  const updatedProduct =
    await Product.findById(productId).populate("tdsDocument");
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
