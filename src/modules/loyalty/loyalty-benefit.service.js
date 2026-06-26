const TierBenefit = require("../../schemas/tier-benefit.schema");

/**
 * Admin API: Lists configured benefit items with pagination.
 */
async function listBenefits(query = {}) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const filters = {};
  if (query.search) {
    filters.$or = [
      { name: { $regex: query.search, $options: "i" } },
      { key: { $regex: query.search, $options: "i" } },
    ];
  }
  if (query.active === "true") filters.active = true;
  if (query.active === "false") filters.active = false;

  const [benefits, total] = await Promise.all([
    TierBenefit.find(filters).skip(skip).limit(limit).lean(),
    TierBenefit.countDocuments(filters),
  ]);

  return {
    data: benefits,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = {
  listBenefits,
};
