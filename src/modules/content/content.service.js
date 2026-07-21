const Content = require("../../schemas/content.schema");
const User = require("../../schemas/user.schema");
const AppError = require("../../utils/appError");
const { ALLOWED_PLACEMENTS } = require("./content.constants");

const validatePlacements = (placements) => {
  if (!placements || !Array.isArray(placements)) return;
  for (const p of placements) {
    if (!ALLOWED_PLACEMENTS.includes(p)) {
      throw new AppError(`Invalid placement: ${p}. Allowed: ${ALLOWED_PLACEMENTS.join(", ")}`, 400);
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
    throw new AppError("Content not found", 404);
  }
  return content;
};

const deleteContent = async (id) => {
  const content = await Content.findByIdAndDelete(id);
  if (!content) {
    throw new AppError("Content not found", 404);
  }
  return content;
};

const listContent = async (query = {}) => {
  const { page, limit, type, placement, active } = query;
  
  const filter = {};
  if (type) filter.type = type;
  if (placement) filter.placements = placement;
  if (active !== undefined) filter.active = active === "true" || active === true;

  let queryBuilder = Content.find(filter).sort({ sortOrder: 1, createdAt: -1 });

  if (page && limit) {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    queryBuilder = queryBuilder.skip(skip).limit(parseInt(limit));
  } else if (limit) {
    queryBuilder = queryBuilder.limit(parseInt(limit));
  }

  const [data, total] = await Promise.all([
    queryBuilder,
    Content.countDocuments(filter)
  ]);

  return { 
    data, 
    total, 
    page: page ? parseInt(page) : 1, 
    limit: limit ? parseInt(limit) : total 
  };
};

const getHomepageContent = async (userId = null) => {
  const now = new Date();
  
  // Find active content where current date is within start/end dates (or dates are null)
  const activeContents = await Content.find({
    active: true,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
    ]
  }).sort({ priority: -1, sortOrder: 1 });

  // Get viewed popups for the user
  let viewedIds = [];
  if (userId) {
    const user = await User.findById(userId).lean();
    if (user && user.viewedPopups) {
      viewedIds = user.viewedPopups.map((id) => id.toString());
    }
  }

  // Group by placement
  const homepageGroups = {};
  ALLOWED_PLACEMENTS.forEach((p) => {
    homepageGroups[p] = [];
  });

  activeContents.forEach((content) => {
    // Filter out viewed popups only if frequency is ONCE (or showOnce is true)
    const isOnce = content.frequency === "ONCE" || content.showOnce;
    if (isOnce && viewedIds.includes(content._id.toString())) {
      return;
    }

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

const getPlacementContent = async (placement, userId = null) => {
  const now = new Date();

  // Get viewed popups for the user
  let viewedIds = [];
  if (userId) {
    const user = await User.findById(userId).lean();
    if (user && user.viewedPopups) {
      viewedIds = user.viewedPopups.map((id) => id.toString());
    }
  }

  const contents = await Content.find({
    active: true,
    placements: placement,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
    ]
  }).sort({ priority: -1, sortOrder: 1 });

  return contents.filter((content) => {
    const isOnce = content.frequency === "ONCE" || content.showOnce;
    if (isOnce && viewedIds.includes(content._id.toString())) {
      return false;
    }
    return true;
  });
};

const trackContentView = async (id, userId) => {
  const content = await Content.findById(id);
  if (!content) {
    throw new AppError("Content not found", 404);
  }

  await User.findByIdAndUpdate(userId, {
    $addToSet: { viewedPopups: id },
  });

  return { message: "Content view tracked successfully", viewed: true };
};

const getContentDetails = async (id) => {
  const content = await Content.findById(id);
  if (!content) {
    throw new AppError("Content not found", 404);
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
  trackContentView,
  getContentDetails,
  ALLOWED_PLACEMENTS
};
