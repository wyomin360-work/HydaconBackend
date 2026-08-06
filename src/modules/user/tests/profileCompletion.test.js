const mongoose = require("mongoose");
const Role = require("../../../schemas/role.schema");
const User = require("../../../schemas/user.schema");
require("../../../schemas/user-bank-account.schema"); // Ensure it's registered

describe("User Profile Completion Percentage Calculation", () => {
  let mockRoleFindById;
  let mockUserBankAccountFindOne;

  beforeAll(() => {
    // Mock Role.findById to return custom roles
    mockRoleFindById = jest.spyOn(mongoose.model("Role"), "findById");
    // Mock UserBankAccount.findOne to mock bank details existence
    mockUserBankAccountFindOne = jest.spyOn(mongoose.model("UserBankAccount"), "findOne");
  });

  afterAll(() => {
    mockRoleFindById.mockRestore();
    mockUserBankAccountFindOne.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should calculate 100% completion for Contractor (10 fields filled)", async () => {
    mockRoleFindById.mockResolvedValue({
      name: "Contractor",
    });
    mockUserBankAccountFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: "bank_id" })
    });

    const user = new User({
      roleId: new mongoose.Types.ObjectId(),
      name: "John Contractor",
      dob: new Date("1992-05-15"),
      profilePhoto: "/uploads/images/john.jpg",
      experience: 10,
      areaOfOperation: "Zone A",
      kycStatus: "PENDING",
      email: "contractor@example.com",
      phone: "1234567890",
      agreedToTerms: true,
      shopName: null, // Shop name is N/A for Contractor
    });

    await user.calculateCompletionPercentage();

    expect(user.profileCompletionPercentage).toBe(100);
  });

  it("should calculate 100% completion for Retailer (11 fields filled, including shopName)", async () => {
    mockRoleFindById.mockResolvedValue({
      name: "Retailer",
    });
    mockUserBankAccountFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: "bank_id" })
    });

    const user = new User({
      roleId: new mongoose.Types.ObjectId(),
      name: "Shopkeeper Joe",
      dob: new Date("1985-08-20"),
      profilePhoto: "/uploads/images/shop.jpg",
      experience: 15,
      areaOfOperation: "Zone B",
      kycStatus: "APPROVED",
      email: "retailer@example.com",
      phone: "9876543210",
      agreedToTerms: true,
      shopName: "Joe's hardware store",
    });

    await user.calculateCompletionPercentage();

    expect(user.profileCompletionPercentage).toBe(100);
  });

  it("should calculate less than 100% for Retailer if shopName is missing", async () => {
    mockRoleFindById.mockResolvedValue({
      name: "Retailer",
    });
    mockUserBankAccountFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: "bank_id" })
    });

    const user = new User({
      roleId: new mongoose.Types.ObjectId(),
      name: "Shopkeeper Joe",
      dob: new Date("1985-08-20"),
      profilePhoto: "/uploads/images/shop.jpg",
      experience: 15,
      areaOfOperation: "Zone B",
      kycStatus: "APPROVED",
      email: "retailer@example.com",
      phone: "9876543210",
      agreedToTerms: true,
      shopName: null, // Missing shopName
    });

    await user.calculateCompletionPercentage();

    // 10 out of 11 fields filled => 10/11 = 91%
    expect(user.profileCompletionPercentage).toBe(91);
  });

  it("should calculate correct percentage for partially filled profile", async () => {
    mockRoleFindById.mockResolvedValue({
      name: "Mason",
    });
    mockUserBankAccountFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null) // No bank details
    });

    const user = new User({
      roleId: new mongoose.Types.ObjectId(),
      name: "Mason Mark",
      dob: null, // missing
      profilePhoto: null, // missing
      experience: 4,
      areaOfOperation: "Zone C",
      kycStatus: "NOT_STARTED", // counts as missing
      email: null, // missing
      phone: null, // missing
      agreedToTerms: false, // missing
    });

    await user.calculateCompletionPercentage();

    // Fields filled: name, experience, areaOfOperation (3 out of 10) => 30%
    expect(user.profileCompletionPercentage).toBe(30);
  });
});
