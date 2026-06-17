// GameCoins Controller - Quản lý xu chơi game
import { Request, Response, NextFunction } from "express";
import { User, IUserDocument } from "../auth/user.model";
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
 * Đổi xu thành số dư ví
 * Body: { turns: number }
 */
export const exchangeCoins = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { turns = 1 } = req.body;

        if (typeof turns !== "number" || !Number.isInteger(turns) || turns <= 0) {
            throw new ServiceError("INVALID_TURNS", "Số lượt đổi không hợp lệ", 400);
        }

        const coinsNeeded = turns * 100_000;
        const creditAmount = turns * 30_000;

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

        // Trừ xu và cộng số dư ví
        user.gameCoins = currentCoins - coinsNeeded;
        user.balance = (user.balance || 0) + creditAmount;
        await user.save();

        // Phát tín hiệu cập nhật xu & số dư real-time
        socketService.emitToUser(user._id.toString(), "coins_updated", {
            gameCoins: user.gameCoins,
            balance: user.balance,
        });

        res.json({
            success: true,
            message: `Đổi thành công ${turns} lượt, cộng ${creditAmount.toLocaleString("vi-VN")} VND vào ví!`,
            data: {
                gameCoins: user.gameCoins,
                balance: user.balance,
            },
        });
    } catch (error) {
        next(error);
    }
};
