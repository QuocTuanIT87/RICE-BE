import { VipLevel, IVipLevelDocument } from "../modules/vipLevels/vipLevel.model";
import { Vip } from "../modules/vips/vip.model";
import { DepositRequest } from "../modules/depositRequests/depositRequest.model";

const DEFAULT_VIP_LEVELS = [
  { levelCode: "normal", name: "Thành viên thường", threshold: 0, discountRate: 0 },
  { levelCode: "silver", name: "Hội viên Bạc 🥈", threshold: 500000, discountRate: 3 },
  { levelCode: "gold", name: "Hội viên Vàng 🥇", threshold: 1500000, discountRate: 6 },
  { levelCode: "diamond", name: "Hội viên Kim Cương 💎", threshold: 3000000, discountRate: 10 },
];

/**
 * Tự động tạo các cấp VIP mặc định nếu chưa tồn tại
 */
export const seedDefaultVipLevels = async (): Promise<void> => {
  try {
    const count = await VipLevel.countDocuments();
    if (count === 0) {
      await VipLevel.insertMany(DEFAULT_VIP_LEVELS);
      console.log("✅ Seeded default VIP levels successfully!");
    }
  } catch (error) {
    console.error("❌ Error seeding default VIP levels:", error);
  }
};

/**
 * Tính toán cấp VIP phù hợp dựa trên số tiền chi tiêu tích lũy
 */
export const evaluateVipLevel = async (totalSpent: number): Promise<IVipLevelDocument> => {
  // Lấy các VIP levels sắp xếp theo threshold giảm dần
  const vipLevels = await VipLevel.find().sort({ threshold: -1 });
  
  // Tìm cấp VIP đầu tiên đạt điều kiện
  const level = vipLevels.find((vl) => totalSpent >= vl.threshold);
  
  if (level) {
    return level;
  }
  
  // Fallback: tìm normal
  let normalLevel = await VipLevel.findOne({ levelCode: "normal" });
  if (!normalLevel) {
    // Nếu chưa có (hy hữu), tạo tạm thời
    normalLevel = await VipLevel.create(DEFAULT_VIP_LEVELS[0]);
  }
  return normalLevel;
};

/**
 * Tính tổng tiền nạp của người dùng trong năm dương lịch hiện tại
 * và cập nhật cấp VIP tương ứng cho họ.
 */
export const updateUserVipLevel = async (userId: string): Promise<any> => {
  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);
  const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  // Sum all approved deposit amounts for this user in the current calendar year
  const approvedDeposits = await DepositRequest.find({
    userId,
    status: "approved",
    processedAt: { $gte: startOfYear, $lte: endOfYear }
  });

  const totalDepositedThisYear = approvedDeposits.reduce((sum, req) => sum + Number(req.amount || 0), 0);

  // Evaluate VIP Level based on this sum
  const vipLevel = await evaluateVipLevel(totalDepositedThisYear);

  // Update or create VIP record
  let vip = await Vip.findOne({ userId });
  if (!vip) {
    vip = new Vip({
      userId,
      totalSpent: totalDepositedThisYear, // Reusing field name to prevent UI breakages
      vipLevelId: vipLevel._id,
    });
  } else {
    vip.totalSpent = totalDepositedThisYear;
    vip.vipLevelId = vipLevel._id as any;
  }
  await vip.save();
  return vip;
};

/**
 * Tự động tính toán lại cấp VIP cho toàn bộ người dùng trong hệ thống
 */
export const recalculateAllUsersVipLevels = async (): Promise<void> => {
  try {
    const vips = await Vip.find();
    for (const vip of vips) {
      await updateUserVipLevel(vip.userId.toString());
    }
    console.log(`✅ Đã cập nhật lại cấp VIP cho ${vips.length} người dùng.`);
  } catch (error) {
    console.error("❌ Lỗi khi cập nhật lại cấp VIP cho toàn bộ user:", error);
  }
};
