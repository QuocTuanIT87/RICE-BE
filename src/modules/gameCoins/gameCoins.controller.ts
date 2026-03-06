// GameCoins Controller - Quản lý xu chơi game
import { Request, Response, NextFunction } from "express";
import { User, IUserDocument } from "../auth/user.model";
import { UserPackage } from "../userPackages/userPackage.model";
import { MealPackage } from "../mealPackages/mealPackage.model";
import { ServiceError } from "../../middlewares";
import { socketService } from "../../services";

const COINS_PER_TURN = 100_000; // 100k xu = 1 lượt
const VALID_TURN_OPTIONS = [1, 3, 5, 7, 10];

/**
 * GET /api/game-coins/balance
 * Lấy số xu hiện tại
 */
export const getBalance = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const user = (await User.findById(req.user!.userId).select("gameCoins")) as IUserDocument | null;
        if (!user) {
            throw new ServiceError("USER_NOT_FOUND", "Không tìm thấy user", 404);
        }

        res.json({
            success: true,
            data: { gameCoins: user.gameCoins || 0 },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/game-coins/update
 * Cập nhật xu sau khi chơi game
 * Body: { delta: number } (+ thắng, - thua)
 */
export const updateCoins = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { delta } = req.body;

        if (typeof delta !== "number" || !Number.isInteger(delta)) {
            throw new ServiceError(
                "INVALID_DELTA",
                "Delta phải là số nguyên",
                400,
            );
        }

        // Use atomic $inc to prevent race conditions
        const user = (await User.findByIdAndUpdate(
            req.user!.userId,
            { $inc: { gameCoins: delta } },
            { new: true, runValidators: true }
        ).select("gameCoins")) as IUserDocument | null;

        if (!user) {
            throw new ServiceError("USER_NOT_FOUND", "Không tìm thấy user", 404);
        }

        // Ensure coins don't go below 0 (extra safety check)
        if (user.gameCoins < 0) {
            user.gameCoins = 0;
            await user.save();
        }

        const newCoins = user.gameCoins;

        // Phát tín hiệu cập nhật xu real-time
        socketService.emitToUser(user._id.toString(), "coins_updated", {
            gameCoins: newCoins
        });

        res.json({
            success: true,
            data: { gameCoins: newCoins },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/game-coins/exchange
 * Đổi xu thành lượt đặt cơm
 * Body: { packageId: string }
 */
export const exchangeCoins = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { packageId } = req.body;

        if (!packageId) {
            throw new ServiceError("PACKAGE_REQUIRED", "PackageId là bắt buộc", 400);
        }

        // Tìm gói đổi xu
        const pkg = await MealPackage.findById(packageId);
        if (!pkg) {
            throw new ServiceError("PACKAGE_NOT_FOUND", "Không tìm thấy gói này", 404);
        }

        if (pkg.packageType !== "coin-exchange") {
            throw new ServiceError("INVALID_PACKAGE_TYPE", "Gói này không phải loại đổi xu", 400);
        }

        const coinsNeeded = pkg.coinPrice || 0;
        if (coinsNeeded <= 0) {
            throw new ServiceError("INVALID_COIN_PRICE", "Gói này chưa có giá xu hợp lệ", 400);
        }

        const user = (await User.findById(req.user!.userId)) as IUserDocument | null;
        if (!user) {
            throw new ServiceError("USER_NOT_FOUND", "Không tìm thấy user", 404);
        }

        const currentCoins = user.gameCoins || 0;
        if (currentCoins < coinsNeeded) {
            throw new ServiceError(
                "INSUFFICIENT_COINS",
                `Không đủ xu. Cần ${coinsNeeded.toLocaleString()} xu, bạn có ${currentCoins.toLocaleString()} xu.`,
                400,
            );
        }

        // Trừ xu
        user.gameCoins = currentCoins - coinsNeeded;
        await user.save();

        // Tạo UserPackage mới loại coin-exchange
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (pkg.validDays || 30));

        const userPackage = new UserPackage({
            userId: user._id,
            mealPackageId: pkg._id,
            packageType: "coin-exchange",
            remainingTurns: pkg.turns,
            purchasedAt: new Date(),
            expiresAt,
            isActive: true,
        });

        await userPackage.save();

        // Nếu user chưa có activePackage, set gói mới
        if (!user.activePackageId) {
            user.activePackageId = userPackage._id;
            await user.save();
        }

        // Phát tín hiệu cập nhật xu real-time
        socketService.emitToUser(user._id.toString(), "coins_updated", {
            gameCoins: user.gameCoins
        });

        res.json({
            success: true,
            message: `Đổi thành công ${pkg.turns} lượt đặt cơm!`,
            data: {
                gameCoins: user.gameCoins,
                userPackage,
            },
        });
    } catch (error) {
        next(error);
    }
};
