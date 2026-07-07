const Content = require("../../schemas/content.schema");
const { ErrorHandler } = require("../../utils/heplers");

const ALLOWED_PLACEMENTS = [
  "HOME_TOP_CAROUSEL",
  "HOME_MIDDLE_BANNER",
  "HOME_BOTTOM_BANNER",
  "REWARDS_PAGE",
  "PRODUCT_SELECTOR",
  "COVERAGE_CALCULATOR",
  "GIFT_CATALOGUE",
  "PROFILE",
  "SCAN_PAGE",
  "REWARD_SUCCESS_SCREEN",
  "SEASON_LANDING_PAGE",
  "ANNOUNCEMENTS",
  "SEASON_CAMPAIGN"
];

const validatePlacements = (placements) => {
  if (!placements || !Array.isArray(placements)) return;
  for (const p of placements) {
    if (!ALLOWED_PLACEMENTS.includes(p)) {
      throw new ErrorHandler(`Invalid placement: ${p}. Allowed: ${ALLOWED_PLACEMENTS.join(", ")}`, 400);
    }
  }
};

const createContent = async (data) => {
  validatePlacements(data.placements);
  const content = new Content(data);
  await content.save();
  return content;
};

const updateContent = async (id, data) => {
  validatePlacements(data.placements);
  const content = await Content.findByIdAndUpdate(id, data, { new: true });
  if (!content) {
    throw new ErrorHandler("Content not found", 404);
  }
  return content;
};

const deleteContent = async (id) => {
  const content = await Content.findByIdAndDelete(id);
  if (!content) {
    throw new ErrorHandler("Content not found", 404);
  }
  return content;
};

const listContent = async (query = {}) => {
  const { page = 1, limit = 10, type, placement, active } = query;
  
  const filter = {};
  if (type) filter.type = type;
  if (placement) filter.placements = placement;
  if (active !== undefined) filter.active = active === "true" || active === true;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [data, total] = await Promise.all([
    Content.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Content.countDocuments(filter)
  ]);

  return { data, total, page: parseInt(page), limit: parseInt(limit) };
};

const getHomepageContent = async () => {
  const now = new Date();
  
  // Find active content where current date is within start/end dates (or dates are null)
  const activeContents = await Content.find({
    active: true,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
    ]
  }).sort({ priority: -1, sortOrder: 1 });

  // Group by placement
  const homepageGroups = {};
  ALLOWED_PLACEMENTS.forEach((p) => {
    homepageGroups[p] = [];
  });

  activeContents.forEach((content) => {
    if (content.placements && Array.isArray(content.placements)) {
      content.placements.forEach((placement) => {
        if (homepageGroups[placement]) {
          homepageGroups[placement].push(content);
        } else {
          homepageGroups[placement] = [content];
        }
      });
    }
  });

  return homepageGroups;
};

const getPlacementContent = async (placement) => {
  const now = new Date();
  const contents = await Content.find({
    active: true,
    placements: placement,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
    ]
  }).sort({ priority: -1, sortOrder: 1 });

  return contents;
};

const getContentDetails = async (id) => {
  const content = await Content.findById(id);
  if (!content) {
    throw new ErrorHandler("Content not found", 404);
  }
  return content;
};

module.exports = {
  createContent,
  updateContent,
  deleteContent,
  listContent,
  getHomepageContent,
  getPlacementContent,
  getContentDetails,
  ALLOWED_PLACEMENTS
};
