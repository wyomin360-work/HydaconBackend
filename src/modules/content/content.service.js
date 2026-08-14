const mongoose = require("mongoose");
const Content = require("../../schemas/content.schema");
const User = require("../../schemas/user.schema");
const AppError = require("../../utils/appError");
const { ALLOWED_PLACEMENTS } = require("../../constants/content");
const { RuleSet } = require("../../schemas/rule-set.schema");
const ruleSetEvaluator = require("../rule-set/rule-set.evaluator");
const ContentAnalytics = require("../../schemas/contentAnalytics.schema");
const Role = require("../../schemas/role.schema");

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

  invalidateContentCache();

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
  invalidateContentCache();
  return content;
};

const deleteContent = async (id) => {
  const content = await Content.findByIdAndDelete(id);
  if (!content) {
    throw new AppError("Content not found", 404);
  }
  invalidateContentCache();
  return content;
};

const listContent = async (query = {}) => {
  const { type, placement, active } = query;
  const isAll =
    query.isAll === "true" ||
    query.isAll === true ||
    query.limit === "all" ||
    query.limit === "0" ||
    query.limit === 0;
  const page = parseInt(query.page) || 1;
  const limit = isAll ? 0 : parseInt(query.limit || 10);

  const filter = {};
  if (type) filter.type = type;
  if (placement) filter.placements = placement;
  if (active !== undefined)
    filter.active = active === "true" || active === true;

  let queryBuilder = Content.find(filter)
    .populate("ruleSetId", "name")
    .sort({ sortOrder: 1, createdAt: -1 });

  if (limit > 0) {
    const skip = (page - 1) * limit;
    queryBuilder = queryBuilder.skip(skip).limit(limit);
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

// In-Memory Cache for Active Contents & Guest Homepage
let cachedActiveContents = null;
let activeContentsCacheTime = 0;
let cachedGuestHomepage = null;
let guestHomepageCacheTime = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

const USER_EVALUATION_FIELDS =
  "roleId viewedPopups currentTierId hydaconCoins cashBalance totalPoints profileCompletionPercentage areaOfOperation kycStatus referralsCount successfulReferralsCount currentStreak language";

const invalidateContentCache = () => {
  cachedActiveContents = null;
  activeContentsCacheTime = 0;
  cachedGuestHomepage = null;
  guestHomepageCacheTime = 0;
};

const filterContentsByRuleSet = async (contents, user) => {
  if (!user) {
    return contents.filter((c) => !c.ruleSetId);
  }

  // Pre-populate user.roleId if present as an unpopulated ObjectId
  if (user.roleId && typeof user.roleId !== "object") {
    const roleQuery = Role.findById(user.roleId);
    if (roleQuery) {
      const roleObj = roleQuery.lean ? await roleQuery.lean() : await roleQuery;
      if (roleObj) {
        user.roleId = roleObj;
      }
    }
  }

  // Parallelize rule set evaluation across content items using Promise.all
  const results = await Promise.all(
    contents.map(async (content) => {
      if (!content.ruleSetId) {
        return content;
      }
      try {
        let ruleSet = content.ruleSetId;
        // Fetch rule set from DB only if it was not pre-populated
        if (typeof ruleSet !== "object" || !ruleSet || !ruleSet.rules) {
          const rsQuery = RuleSet.findById(content.ruleSetId);
          if (rsQuery) {
            ruleSet = rsQuery.lean ? await rsQuery.lean() : await rsQuery;
          } else {
            ruleSet = null;
          }
        }
        if (ruleSet) {
          const evaluation = await ruleSetEvaluator.evaluateRuleSet(
            ruleSet,
            user,
            { targetId: content._id },
          );
          if (evaluation.eligible) {
            return content;
          }
        }
      } catch (err) {
        console.error(
          `Error evaluating ruleset for content ${content._id}:`,
          err.message,
        );
      }
      return null;
    }),
  );

  return results.filter(Boolean);
};

// Helper: Fetch active contents with 30s in-memory caching and graceful degradation
const getActiveContents = async () => {
  const nowMs = Date.now();
  if (cachedActiveContents && nowMs - activeContentsCacheTime < CACHE_TTL_MS) {
    return cachedActiveContents;
  }

  // Graceful degradation: Check if MongoDB is connected
  const isDbReady = mongoose.connection.readyState === 1 || process.env.NODE_ENV === "test";
  if (!isDbReady) {
    console.warn("⚠️ [ContentService] MongoDB unavailable. Gracefully serving cached or empty content.");
    if (cachedActiveContents) {
      return cachedActiveContents;
    }
    return [];
  }

  try {
    const now = new Date();
    const contents = await Content.find({
      active: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ],
    })
      .populate("ruleSetId")
      .sort({ priority: -1, sortOrder: 1 })
      .lean();

    cachedActiveContents = contents;
    activeContentsCacheTime = nowMs;
    return contents;
  } catch (error) {
    console.error("❌ [ContentService] Database error fetching active contents:", error.message);
    if (cachedActiveContents) {
      return cachedActiveContents;
    }
    return [];
  }
};

const getHomepageContent = async (userId = null) => {
  // Return guest cached response if available
  const nowMs = Date.now();
  if (
    !userId &&
    cachedGuestHomepage &&
    nowMs - guestHomepageCacheTime < CACHE_TTL_MS
  ) {
    return cachedGuestHomepage;
  }

  let activeContents = await getActiveContents();
  let viewedIds = [];

  if (userId && (mongoose.connection.readyState === 1 || process.env.NODE_ENV === "test")) {
    try {
      const user = await User.findById(userId)
        .select(USER_EVALUATION_FIELDS)
        .populate("roleId")
        .lean();
      if (user) {
        activeContents = await filterContentsByRuleSet(activeContents, user);
        if (user.viewedPopups && Array.isArray(user.viewedPopups)) {
          viewedIds = user.viewedPopups.map((id) => id.toString());
        }
      }
    } catch (err) {
      console.error("❌ [ContentService] User lookup error during getHomepageContent:", err.message);
    }
  } else {
    activeContents = await filterContentsByRuleSet(activeContents, null);
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

  if (!userId) {
    cachedGuestHomepage = homepageGroups;
    guestHomepageCacheTime = nowMs;
  }

  return homepageGroups;
};

const getPlacementContent = async (placement, userId = null) => {
  let activeContents = await getActiveContents();
  let viewedIds = [];

  if (userId) {
    const user = await User.findById(userId)
      .select(USER_EVALUATION_FIELDS)
      .populate("roleId")
      .lean();
    if (user) {
      activeContents = await filterContentsByRuleSet(activeContents, user);
      if (user.viewedPopups && Array.isArray(user.viewedPopups)) {
        viewedIds = user.viewedPopups.map((id) => id.toString());
      }
    }
  } else {
    activeContents = await filterContentsByRuleSet(activeContents, null);
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
    console.error(
      "[ContentService] Error updating content daily analytics:",
      err,
    );
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
  const content = await Content.findById(id)
    .populate("ruleSetId", "name")
    .lean();
  if (!content) {
    throw new AppError("Content not found", 404);
  }

  // Calculate start & end
  const start = content.startDate
    ? new Date(content.startDate)
    : new Date(content.createdAt);
  const now = new Date();
  const end =
    content.endDate && new Date(content.endDate) < now
      ? new Date(content.endDate)
      : now;

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
  invalidateContentCache,
  ALLOWED_PLACEMENTS,
};
