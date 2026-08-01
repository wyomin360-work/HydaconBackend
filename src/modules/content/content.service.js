const Content = require("../../schemas/content.schema");
const User = require("../../schemas/user.schema");
const AppError = require("../../utils/appError");
const { ALLOWED_PLACEMENTS } = require("../../constants/content");
const { RuleSet } = require("../../schemas/rule-set.schema");
const ruleSetEvaluator = require("../rule-set/rule-set.evaluator");
const ContentAnalytics = require("../../schemas/contentAnalytics.schema");

const validatePlacements = (placements) => {
  if (!placements || !Array.isArray(placements)) return;
  for (const p of placements) {
    if (!ALLOWED_PLACEMENTS.includes(p)) {
      throw new AppError(
        `Invalid placement: ${p}. Allowed: ${ALLOWED_PLACEMENTS.join(", ")}`,
        400,
      );
    }
  }
};

const hasActivePopupConflict = async (placements, excludeId) => {
  if (!placements || !Array.isArray(placements) || placements.length === 0) {
    return false;
  }

  const filter = {
    type: "POPUP",
    active: true,
    placements: { $in: placements },
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const conflict = await Content.findOne(filter).select("_id placements");
  return !!conflict;
};

const createContent = async (data) => {
  validatePlacements(data.placements);

  let hadConflict = false;
  // right after validatePlacements, before `new Content(data)`
  if (data.type === "POPUP" && data.active !== false) {
    const conflict = await hasActivePopupConflict(data.placements);
    if (conflict) {
      if (data.forceActive) {
        await Content.updateMany(
          { type: "POPUP", active: true, placements: { $in: data.placements } },
          { active: false },
        );
      } else {
        data.active = false;
        hadConflict = true;
      }
    }
  }

  if (data.type !== "POPUP") {
    data.popupType = null;
  }

  // Sync images object from media array
  if (data.media) {
    const primaryImage = data.media[0] || "";
    if (data.type === "ANNOUNCEMENT") {
      data.images = {
        icon: primaryImage,
        mobile: "",
        tablet: "",
        web: "",
        thumbnail: "",
      };
    } else {
      data.images = {
        mobile: primaryImage,
        web: primaryImage,
        thumbnail: primaryImage,
        tablet: primaryImage,
        icon: "",
      };
    }
  }

  const content = new Content(data);
  await content.save();

  const result = content.toObject();
  if (hadConflict) {
    result.hadConflict = true;
  }
  return result;
};

const updateContent = async (id, data) => {
  validatePlacements(data.placements);

  const existing = await Content.findById(id);
  if (!existing) {
    throw new AppError("Content not found", 404);
  }

  // Normalize status if string ("active" / "disabled") supplied
  if (data.status !== undefined) {
    if (typeof data.status === "string") {
      data.active = data.status === "active";
    } else if (typeof data.status === "boolean") {
      data.active = data.status;
    }
    delete data.status;
  }

  // Normalize singleImage / galleryImages to media array if media not directly provided
  if (!data.media && (data.singleImage || data.galleryImages)) {
    const type = data.type || existing.type;
    if (type === "CAMPAIGN") {
      data.media = [data.singleImage, ...(data.galleryImages || [])].filter(
        Boolean,
      );
    } else if (data.singleImage) {
      data.media = [data.singleImage];
    }
    delete data.singleImage;
    delete data.galleryImages;
  }

  if (data.frequency === "ONCE") {
    data.showOnce = true;
  }

  // Remove read-only / metadata properties if present
  delete data._id;
  delete data.id;
  delete data.createdAt;
  delete data.updatedAt;
  delete data.__v;

  const resolvedType = data.type !== undefined ? data.type : existing.type;
  if (resolvedType !== "POPUP") {
    data.popupType = null;
  }
  const resolvedActive =
    data.active !== undefined ? data.active : existing.active;
  const resolvedPlacements =
    data.placements !== undefined ? data.placements : existing.placements;

  if (
    resolvedType === "POPUP" &&
    resolvedActive &&
    resolvedPlacements &&
    resolvedPlacements.length > 0
  ) {
    // Deactivate any other existing active popups for overlapping placements
    await Content.updateMany(
      {
        _id: { $ne: id },
        type: "POPUP",
        active: true,
        placements: { $in: resolvedPlacements },
      },
      { $set: { active: false } },
    );
  }

  // Sync images object from media array if media is updated
  if (data.media) {
    const primaryImage = data.media[0] || "";
    if (resolvedType === "ANNOUNCEMENT") {
      data.images = {
        icon: primaryImage,
        mobile: "",
        tablet: "",
        web: "",
        thumbnail: "",
      };
    } else {
      data.images = {
        mobile: primaryImage,
        web: primaryImage,
        thumbnail: primaryImage,
        tablet: primaryImage,
        icon: "",
      };
    }
  }

  const content = await Content.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, runValidators: true },
  );
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
  const { page = 1, limit = 10, type, placement, active } = query;

  const filter = {};
  if (type) filter.type = type;
  if (placement) filter.placements = placement;
  if (active !== undefined)
    filter.active = active === "true" || active === true;

  let queryBuilder = Content.find(filter)
    .populate("ruleSetId", "name")
    .sort({ sortOrder: 1, createdAt: -1 });

  if (page && limit) {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    queryBuilder = queryBuilder.skip(skip).limit(parseInt(limit));
  } else if (limit) {
    queryBuilder = queryBuilder.limit(parseInt(limit));
  }

  const [data, total] = await Promise.all([
    queryBuilder,
    Content.countDocuments(filter),
  ]);

  return {
    data,
    total,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : total,
  };
};

const filterContentsByRuleSet = async (contents, user) => {
  if (!user) {
    return contents.filter((c) => !c.ruleSetId);
  }
  const filtered = [];
  for (const content of contents) {
    if (!content.ruleSetId) {
      filtered.push(content);
      continue;
    }
    try {
      const ruleSet = await RuleSet.findById(content.ruleSetId);
      if (ruleSet) {
        const evaluation = await ruleSetEvaluator.evaluateRuleSet(
          ruleSet,
          user,
          { targetId: content._id },
        );
        if (evaluation.eligible) {
          filtered.push(content);
        }
      }
    } catch (err) {
      console.error(
        `Error evaluating ruleset for content ${content._id}:`,
        err.message,
      );
    }
  }
  return filtered;
};

// Helper: Fetch active contents
const getActiveContents = async () => {
  const now = new Date();
  return await Content.find({
    active: true,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  })
    .sort({ priority: -1, sortOrder: 1 })
    .lean();
};

const getHomepageContent = async (userId = null) => {
  let activeContents = await getActiveContents();

  if (userId) {
    const user = await User.findById(userId);
    if (user) {
      activeContents = await filterContentsByRuleSet(activeContents, user);
    }
  } else {
    activeContents = await filterContentsByRuleSet(activeContents, null);
  }

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
  let activeContents = await getActiveContents();

  if (userId) {
    const user = await User.findById(userId);
    if (user) {
      activeContents = await filterContentsByRuleSet(activeContents, user);
    }
  } else {
    activeContents = await filterContentsByRuleSet(activeContents, null);
  }

  // Get viewed popups for the user
  let viewedIds = [];
  if (userId) {
    const user = await User.findById(userId).lean();
    if (user && user.viewedPopups) {
      viewedIds = user.viewedPopups.map((id) => id.toString());
    }
  }

  return activeContents.filter((content) => {
    const isOnce = content.frequency === "ONCE" || content.showOnce;
    if (isOnce && viewedIds.includes(content._id.toString())) {
      return false;
    }
    return content.placements && content.placements.includes(placement);
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

  // Track daily views over time
  try {
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    await ContentAnalytics.findOneAndUpdate(
      { contentId: id, date: todayStr },
      { $inc: { views: 1 } },
      { upsert: true, new: true },
    );
  } catch (err) {
    console.error("[ContentService] Error updating content daily analytics:", err);
  }

  return { message: "Content view tracked successfully", viewed: true };
};

const getContentDetails = async (id) => {
  const content = await Content.findById(id).populate("ruleSetId", "name");
  if (!content) {
    throw new AppError("Content not found", 404);
  }
  return content;
};

const getContentDetailsAdmin = async (id) => {
  const content = await Content.findById(id).populate("ruleSetId", "name").lean();
  if (!content) {
    throw new AppError("Content not found", 404);
  }

  // Calculate start & end
  const start = content.startDate ? new Date(content.startDate) : new Date(content.createdAt);
  const now = new Date();
  const end = (content.endDate && new Date(content.endDate) < now) ? new Date(content.endDate) : now;

  // Format as YYYY-MM-DD
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  // Fetch daily analytics rows between start and end
  const rows = await ContentAnalytics.find({
    contentId: id,
    date: { $gte: startStr, $lte: endStr },
  })
    .sort({ date: 1 })
    .lean();

  const byDate = {};
  rows.forEach((r) => {
    byDate[r.date] = r;
  });

  // Gap-fill all days between start and end
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  const dailyViews = [];
  for (let i = 0; i < diffDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    dailyViews.push({
      date: key,
      views: byDate[key]?.views ?? 0,
    });
  }

  return {
    ...content,
    viewsOverTime: dailyViews,
  };
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
  getContentDetailsAdmin,
  ALLOWED_PLACEMENTS,
};
