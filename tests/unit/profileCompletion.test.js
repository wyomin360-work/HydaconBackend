const mongoose = require("mongoose");
const Role = require("../../src/schemas/role.schema");
const User = require("../../src/schemas/user.schema");

describe("User Profile Completion Percentage Calculation", () => {
  let mockRoleFindById;

  beforeAll(() => {
    // Mock Role.findById to return custom roles
    mockRoleFindById = jest.spyOn(mongoose.model("Role"), "findById");
  });

  afterAll(() => {
    mockRoleFindById.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should calculate 100% completion for Contractor (6 fields filled)", async () => {
    mockRoleFindById.mockResolvedValue({
      name: "Contractor"
    });

    const user = new User({
      roleId: new mongoose.Types.ObjectId(),
      name: "John Contractor",
      dob: new Date("1992-05-15"),
      profilePhoto: "/uploads/images/john.jpg",
      experience: 10,
      areaOfOperation: "Zone A",
      kycStatus: "PENDING",
      shopName: null // Shop name is N/A for Contractor
    });

    await user.calculateCompletionPercentage();

    expect(user.profileCompletionPercentage).toBe(100);
  });

  it("should calculate 100% completion for Retailer (7 fields filled, including shopName)", async () => {
    mockRoleFindById.mockResolvedValue({
      name: "Retailer"
    });

    const user = new User({
      roleId: new mongoose.Types.ObjectId(),
      name: "Shopkeeper Joe",
      dob: new Date("1985-08-20"),
      profilePhoto: "/uploads/images/shop.jpg",
      experience: 15,
      areaOfOperation: "Zone B",
      kycStatus: "APPROVED",
      shopName: "Joe's hardware store"
    });

    await user.calculateCompletionPercentage();

    expect(user.profileCompletionPercentage).toBe(100);
  });

  it("should calculate less than 100% for Retailer if shopName is missing", async () => {
    mockRoleFindById.mockResolvedValue({
      name: "Retailer"
    });

    const user = new User({
      roleId: new mongoose.Types.ObjectId(),
      name: "Shopkeeper Joe",
      dob: new Date("1985-08-20"),
      profilePhoto: "/uploads/images/shop.jpg",
      experience: 15,
      areaOfOperation: "Zone B",
      kycStatus: "APPROVED",
      shopName: null // Missing shopName
    });

    await user.calculateCompletionPercentage();

    // 6 out of 7 fields filled => 6/7 = 86%
    expect(user.profileCompletionPercentage).toBe(86);
  });

  it("should calculate correct percentage for partially filled profile", async () => {
    mockRoleFindById.mockResolvedValue({
      name: "Mason"
    });

    const user = new User({
      roleId: new mongoose.Types.ObjectId(),
      name: "Mason Mark",
      dob: null, // missing
      profilePhoto: null, // missing
      experience: 4,
      areaOfOperation: "Zone C",
      kycStatus: "NOT_STARTED" // counts as missing
    });

    await user.calculateCompletionPercentage();

    // Fields filled: name, experience, areaOfOperation (3 out of 6) => 50%
    expect(user.profileCompletionPercentage).toBe(50);
  });
});
