const Campaign = require("../../schemas/campaign.schema");
const User = require("../../schemas/user.schema");
const Admin = require("../../schemas/admin.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { attachId } = require("../../utils/heplers");

async function listCampaignsForUser(userId) {
  const user = await User.findById(userId).populate("currentTierId");
  if (!user) sendFailResponse("User not found");

  const tierId = user.currentTierId?._id;

  let query = { isActive: true };

  if (tierId) {
    // Only fetch campaigns where visibilityTiers is empty (visible to all) OR includes user's tier
    query.$or = [
      { visibilityTiers: { $size: 0 } },
      { visibilityTiers: tierId },
    ];
  }

  const campaigns = await Campaign.find(query)
    .populate("visibilityTiers")
    .populate("eligibilityTiers")
    .lean();

  // Attach isLocked flag if user is not in eligibilityTiers
  const campaignsWithLock = campaigns.map((c) => {
    let isLocked = false;
    if (c.eligibilityTiers && c.eligibilityTiers.length > 0) {
      if (
        !tierId ||
        !c.eligibilityTiers.some((t) => t._id.toString() === tierId.toString())
      ) {
        isLocked = true;
      }
    }
    return { ...c, isLocked };
  });

  return { data: attachId(campaignsWithLock) };
}

async function listCampaignsAdmin(adminId, data) {
  const admin = await Admin.findById(adminId);
  if (!admin) sendFailResponse("Admin not found");

  const { page = 1, limit = 20, search } = data;
  const skip = (page - 1) * limit;

  let query = {};
  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  const campaigns = await Campaign.find(query)
    .populate("visibilityTiers")
    .populate("eligibilityTiers")
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

  const totalDocuments = await Campaign.countDocuments(query);
  return {
    data: {
      campaigns: attachId(campaigns),
      page,
      limit,
      totalPages: Math.ceil(totalDocuments / limit),
      total: totalDocuments,
    },
  };
}

async function createCampaign(adminId, data) {
  const admin = await Admin.findById(adminId);
  if (!admin) sendFailResponse("Admin not found");

  const newCampaign = await Campaign.create(data);
  return { message: "Campaign created successfully", data: newCampaign };
}

async function updateCampaign(adminId, campaignId, data) {
  const admin = await Admin.findById(adminId);
  if (!admin) sendFailResponse("Admin not found");

  const updatedCampaign = await Campaign.findByIdAndUpdate(campaignId, data, {
    new: true,
  });
  if (!updatedCampaign) sendFailResponse("Campaign not found");

  return { message: "Campaign updated successfully", data: updatedCampaign };
}

async function deleteCampaign(adminId, campaignId) {
  const admin = await Admin.findById(adminId);
  if (!admin) sendFailResponse("Admin not found");

  await Campaign.findByIdAndDelete(campaignId);
  return { message: "Campaign deleted successfully", data: { deleted: true } };
}

module.exports = {
  listCampaignsForUser,
  listCampaignsAdmin,
  createCampaign,
  updateCampaign,
  deleteCampaign,
};
