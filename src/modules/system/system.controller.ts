import { Request, Response, NextFunction } from "express";
import SystemConfig from "../../models/SystemConfig";
import { socketService } from "../../services/socketService";

/**
 * Lấy cấu hình hệ thống (Public)
 */
export const getSystemConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let config = await SystemConfig.findOne();
    
    // Nếu chưa có thì tạo mặc định
    if (!config) {
      config = await SystemConfig.create({});
    }

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật cấu hình hệ thống (Admin only)
 */
export const updateSystemConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const updateData = req.body;
    
    let config = await SystemConfig.findOne();
    
    if (!config) {
      config = await SystemConfig.create(updateData);
    } else {
      config = await SystemConfig.findByIdAndUpdate(
        config._id,
        { $set: updateData },
        { new: true }
      );
    }

    // Phát tín hiệu Socket cho toàn bộ Client
    if (config) {
        socketService.io.emit("system_config_updated", config);
        
        // Nếu bật bảo trì, thông báo cho client biết
        if (updateData.isMaintenance !== undefined) {
            socketService.io.emit("maintenance_status_changed", {
                isMaintenance: config.isMaintenance,
                maintenanceStart: config.maintenanceStart,
                maintenanceEnd: config.maintenanceEnd,
                message: config.maintenanceMessage
            });
        }
    }

    res.json({
      success: true,
      data: config,
      message: "Cập nhật cấu hình hệ thống thành công",
    });
  } catch (error) {
    next(error);
  }
};
