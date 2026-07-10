const Product = require("../../schemas/product.schema");
const Document = require("../../schemas/document.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");
const AppError = require("../../utils/appError");
const { calculateCoverage } = require("./product.calculation");

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
    coverage,
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
    coverage,
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
    coverage,
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
      coverage,
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

async function calculateProductCoverage(calculationData) {
  const { productId, area, areaUnit, tileWidth, tileLength, tileThickness, jointWidth } = calculationData;
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
    tileThickness: tileThickness !== undefined ? Number(tileThickness) : undefined,
    jointWidth: jointWidth !== undefined ? Number(jointWidth) : undefined,
  });

  return {
    data: result,
  };
}

async function seedMockProducts() {
  const mockProducts = [
    {
      _id: "tilebond-ultra",
      name: "Hydacon TileBond Ultra",
      description: "A premium-grade, highly flexible polymer-modified cementitious tile adhesive.",
      weightValue: 25,
      weightUnit: "kg",
      price: 450,
      rewardPoints: 10,
      active: true,
      coverage: {
        enabled: true,
        calculationType: "AREA",
        coveragePerUnit: 55,
        coverageUnit: "sqft",
        packageWeight: 25,
        packageUnit: "kg",
        calculatorConfig: {
          wastagePercentage: 0,
          rounding: "UP"
        }
      }
    },
    {
      _id: "tilegrout-hs",
      name: "Hydacon TileGrout HS",
      description: "A high-performance, water-repellent, polymer-modified cementitious tile grout.",
      weightValue: 5,
      weightUnit: "kg",
      price: 250,
      rewardPoints: 5,
      active: true,
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
          maxTileThickness: 30
        }
      }
    },
    {
      _id: "jointfiller-gf100",
      name: "Hydacon Joint Filler GF-100",
      description: "A premium-grade joint filler for tile and stone applications, offering stain-resistance and high flexibility.",
      weightValue: 1,
      weightUnit: "kg",
      price: 90,
      rewardPoints: 2,
      active: true,
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
          maxTileThickness: 25
        }
      }
    },
    {
      _id: "hydroshield-2k",
      name: "Hydacon HydroShield 2K",
      description: "A state-of-the-art, flexible, two-component polymer-modified waterproofing membrane.",
      weightValue: 30,
      weightUnit: "kg",
      price: 1800,
      rewardPoints: 40,
      active: true,
      coverage: {
        enabled: true,
        calculationType: "AREA",
        coveragePerUnit: 120,
        coverageUnit: "sqft",
        packageWeight: 30,
        packageUnit: "kg",
        calculatorConfig: {
          wastagePercentage: 5,
          rounding: "UP"
        }
      }
    },
    {
      _id: "levelmax-self",
      name: "Hydacon LevelMax Self-Leveling",
      description: "A calcium-aluminate based, rapid-hardening self-leveling underlayment.",
      weightValue: 25,
      weightUnit: "kg",
      price: 650,
      rewardPoints: 15,
      active: true,
      coverage: {
        enabled: true,
        calculationType: "AREA",
        coveragePerUnit: 40,
        coverageUnit: "sqft",
        packageWeight: 25,
        packageUnit: "kg",
        calculatorConfig: {
          wastagePercentage: 0,
          rounding: "UP"
        }
      }
    },
    {
      _id: "tilebond-eco",
      name: "Hydacon TileBond Eco",
      description: "An eco-friendly, standard-setting cementitious adhesive.",
      weightValue: 25,
      weightUnit: "kg",
      price: 320,
      rewardPoints: 8,
      active: true,
      coverage: {
        enabled: true,
        calculationType: "AREA",
        coveragePerUnit: 45,
        coverageUnit: "sqft",
        packageWeight: 25,
        packageUnit: "kg",
        calculatorConfig: {
          wastagePercentage: 0,
          rounding: "UP"
        }
      }
    }
  ];

  for (const prod of mockProducts) {
    await Product.findByIdAndUpdate(prod._id, { $set: prod }, { upsert: true, new: true });
    console.log(`Updated mock product: ${prod.name}`);
  }
}

module.exports = {
  createProduct,
  updateProduct,
  getProduct,
  productList,
  deleteProduct,
  calculateProductCoverage,
  seedMockProducts,
};
