const AppError = require("../../utils/appError");

// Helper to convert area between units
const convertArea = (area, from, to) => {
  if (from === to) return area;
  if (from === "sqft" && to === "sqm") return area / 10.7639;
  return area * 10.7639;
};

class StandardAreaStrategy {
  validate(request, config) {
    // Validation is already performed by the main validator, but we do additional strategy checks
  }

  calculate(product, request) {
    const config = product.coverage;
    const coveragePerUnit = config.coveragePerUnit || 1;
    const coverageUnit = config.coverageUnit || "sqft";
    const packageWeight = config.packageWeight || 1;
    const wastage = config.calculatorConfig?.wastagePercentage || 0;
    const rounding = config.calculatorConfig?.rounding || "UP";

    // 1. Convert area to the configured coverage unit
    const areaConverted = convertArea(request.area, request.areaUnit, coverageUnit);

    // 2. Add wastage
    const totalAreaWithWastage = areaConverted * (1 + wastage / 100);

    // 3. Calculate packages
    const unitsRequired = totalAreaWithWastage / coveragePerUnit;

    // 4. Apply rounding
    let bagsRequired = rounding === "NEAREST" ? Math.round(unitsRequired) : Math.ceil(unitsRequired);
    if (request.area > 0 && bagsRequired < 1) {
      bagsRequired = 1;
    }

    // 5. Total weight
    const calculatedWeightKg = bagsRequired * packageWeight;

    const roundingNote = rounding === "NEAREST" ? "rounded to nearest pack" : "rounded up to next pack";
    const wastageNote = wastage > 0 ? `including ${wastage}% wastage` : "no wastage added";

    return {
      recommendedProduct: product.name,
      coverage: `${coveragePerUnit} ${coverageUnit} / ${packageWeight}${config.packageUnit} Bag`,
      area: `${request.area} ${request.areaUnit === "sqft" ? "sq.ft" : "sq.m"}`,
      unitsRequired: parseFloat(unitsRequired.toFixed(2)),
      bagsRequired,
      calculationNotes: `Standard area coverage of ${coveragePerUnit} ${coverageUnit} per bag, ${wastageNote}, and ${roundingNote}.`,
    };
  }
}

class JointFillerStrategy {
  validate(request, config) {
    const { tileWidth, tileLength, tileThickness, jointWidth } = request;

    // Required fields check
    if (tileWidth === undefined || tileWidth === null || isNaN(tileWidth)) {
      throw new AppError("Tile Width is required.", 400);
    }
    if (tileWidth <= 0) {
      throw new AppError("Tile Width must be greater than zero.", 400);
    }

    if (tileLength === undefined || tileLength === null || isNaN(tileLength)) {
      throw new AppError("Tile Length/Height is required.", 400);
    }
    if (tileLength <= 0) {
      throw new AppError("Tile Length/Height must be greater than zero.", 400);
    }

    if (tileThickness === undefined || tileThickness === null || isNaN(tileThickness)) {
      throw new AppError("Tile Thickness is required.", 400);
    }
    if (tileThickness <= 0) {
      throw new AppError("Tile Thickness must be greater than zero.", 400);
    }

    if (jointWidth === undefined || jointWidth === null || isNaN(jointWidth)) {
      throw new AppError("Joint Width is required.", 400);
    }
    if (jointWidth <= 0) {
      throw new AppError("Joint Width must be greater than zero.", 400);
    }
  }

  calculate(product, request) {
    const config = product.coverage;
    const packageWeight = config.packageWeight || 1;
    const density = config.calculatorConfig?.materialDensity || 1.96;
    const wastage = config.calculatorConfig?.wastagePercentage || 0;
    const rounding = config.calculatorConfig?.rounding || "UP";

    const tileLength = request.tileLength;
    const tileWidth = request.tileWidth;
    const tileThickness = request.tileThickness;
    const jointWidth = request.jointWidth;

    // 1. Convert area to square meters
    const areaSqm = convertArea(request.area, request.areaUnit, "sqm");

    // 2. Joint filler coverage rate formula:
    // Rate (kg/m²) = ((L + W) / (L * W)) * Thickness * JointWidth * Density
    const rateKgPerSqm = ((tileLength + tileWidth) / (tileLength * tileWidth)) * tileThickness * jointWidth * density;

    // 3. Total weight in kg
    const totalWeightKg = areaSqm * rateKgPerSqm;

    // 4. Add wastage
    const totalWeightKgWithWastage = totalWeightKg * (1 + wastage / 100);

    // 5. Packages required
    const unitsRequired = totalWeightKgWithWastage / packageWeight;

    // 6. Rounding
    let bagsRequired = rounding === "NEAREST" ? Math.round(unitsRequired) : Math.ceil(unitsRequired);
    if (request.area > 0 && bagsRequired < 1) {
      bagsRequired = 1;
    }

    const calculatedWeightKg = parseFloat(totalWeightKgWithWastage.toFixed(2));
    const wastageNote = wastage > 0 ? `including ${wastage}% wastage` : "no wastage added";
    const roundingNote = rounding === "NEAREST" ? "nearest pack" : "next pack";

    return {
      recommendedProduct: product.name,
      coverage: `density ${density} kg/L / ${packageWeight}${config.packageUnit} Pack`,
      area: `${request.area} ${request.areaUnit === "sqft" ? "sq.ft" : "sq.m"}`,
      unitsRequired: parseFloat(unitsRequired.toFixed(2)),
      bagsRequired,
      calculationNotes: `Joint filler estimation calculated using: tile size ${tileWidth}x${tileLength}x${tileThickness}mm, joint width ${jointWidth}mm, density ${density} kg/L, ${wastageNote}, and rounded to the ${roundingNote}.`,
      materialRequired: `${calculatedWeightKg} kg` // Extra useful info for the response
    };
  }
}

const STRATEGIES = {
  AREA: new StandardAreaStrategy(),
  JOINT_FILLER: new JointFillerStrategy(),
};

const calculateCoverage = (product, request) => {
  const config = product.coverage;
  if (!config || !config.enabled) {
    throw new AppError("Coverage calculator is not enabled for this product.", 400);
  }

  // Common Validations
  const { area, areaUnit } = request;
  if (area === undefined || area === null || isNaN(area)) {
    throw new AppError("Area is a required input field.", 400);
  }
  if (area <= 0) {
    throw new AppError("Area value must be greater than zero.", 400);
  }
  if (area > 10000000) {
    throw new AppError("Area value is too large. Maximum supported area is 10,000,000.", 400);
  }
  if (!areaUnit || (areaUnit !== "sqft" && areaUnit !== "sqm")) {
    throw new AppError('Invalid area unit specified. Must be "sqft" or "sqm".', 400);
  }

  const strategy = STRATEGIES[config.calculationType];
  if (!strategy) {
    throw new AppError(`Unsupported calculation strategy type: ${config.calculationType}`, 400);
  }

  strategy.validate(request, config);
  return strategy.calculate(product, request);
};

module.exports = {
  calculateCoverage,
};
