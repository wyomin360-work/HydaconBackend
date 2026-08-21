const Role = require("../../schemas/role.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");

async function createRole(roleData) {
  const { name, description, isActive, pointMultiplier, permissions } =
    roleData;

  const roleExist = await Role.findOne({ name });
  if (roleExist) sendFailResponse("Role with this name already exists");

  const role = await Role.create({
    name,
    description,
    isActive,
    pointMultiplier,
    permissions,
  });

  return {
    message: "Role created successfully",
    data: role,
  };
}

async function getAllRoles(filters = {}) {
  const query = {};
  if (filters.isActive !== undefined) {
    query.isActive = filters.isActive === true || filters.isActive === "true";
  }

  const roles = await Role.find(query).sort({ createdAt: -1 });

  return {
    message: "Roles fetched successfully",
    data: roles,
  };
}

async function getPublicRoles() {
  const roles = await Role.find({
    isActive: true,
    name: { $not: /^admin$/i },
  })
    .select("name description isActive pointMultiplier")
    .sort({ createdAt: -1 });

  return {
    message: "Roles fetched successfully",
    data: roles,
  };
}

async function updateRole(roleId, updateData) {
  const role = await Role.findById(roleId);
  if (!role) sendFailResponse("Role not found");

  if (updateData.name) {
    const roleExist = await Role.findOne({
      name: updateData.name,
      _id: { $ne: roleId },
    });
    if (roleExist) sendFailResponse("Role with this name already exists");
  }

  const updatedRole = await Role.findByIdAndUpdate(roleId, updateData, {
    new: true,
  });

  return {
    message: "Role updated successfully",
    data: updatedRole,
  };
}

async function deleteRole(roleId) {
  const role = await Role.findById(roleId);
  if (!role) sendFailResponse("Role not found");

  // Optional: Check if role is assigned to any users before deleting
  // const User = require("../../schemas/user.schema");
  // const userCount = await User.countDocuments({ roleId });
  // if (userCount > 0) sendFailResponse("Cannot delete role assigned to users");

  await Role.findByIdAndDelete(roleId);

  return {
    message: "Role deleted successfully",
    data: { roleDeleted: true },
  };
}

module.exports = {
  createRole,
  getAllRoles,
  getPublicRoles,
  updateRole,
  deleteRole,
};
