import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";

class SocketService {
    private _io: SocketServer | null = null;

    public init(server: HttpServer, frontendUrl: string) {
        this._io = new SocketServer(server, {
            cors: {
                origin: frontendUrl,
                methods: ["GET", "POST"],
                credentials: true,
            },
        });

        console.log("🔌 Socket.io đã được khởi tạo!");

        this._io.on("connection", (socket) => {
            console.log(`👤 Client kết nối: ${socket.id}`);

            // Tham gia phòng cá nhân dựa trên userId
            socket.on("join", (userId: string) => {
                socket.join(userId);
                console.log(`🏠 User ${userId} đã gia nhập phòng cá nhân`);
            });

            // Tham gia phòng admin
            socket.on("join_admin", () => {
                socket.join("admin_room");
                console.log(`👑 Admin đã gia nhập phòng quản trị`);
            });

            socket.on("disconnect", () => {
                console.log(`👋 Client ngắt kết nối: ${socket.id}`);
            });
        });
    }

    public get io(): SocketServer {
        if (!this._io) {
            console.error("❌ [Socket] Socket.io chưa được khởi tạo!");
            throw new Error("Socket.io chưa được khởi tạo!");
        }
        return this._io;
    }

    // Gửi sự kiện tới Admin
    public emitToAdmin(event: string, data: any) {
        console.log(`📡 [Socket] Gửi tới Admin: ${event}`);
        this.io.to("admin_room").emit(event, data);
    }

    // Gửi sự kiện tới User cụ thể
    public emitToUser(userId: string, event: string, data: any) {
        if (!userId || userId === "null" || userId === "undefined") {
            console.warn(`⚠️ [Socket] Không thể gửi tới User ${userId} (ID không hợp lệ)`);
            return;
        }
        console.log(`📡 [Socket] Gửi tới User ${userId}: ${event}`);
        this.io.to(userId).emit(event, data);
    }

    // Gửi tới tất cả
    public emitAll(event: string, data: any) {
        console.log(`📡 [Socket] Gửi tới tất cả: ${event}`);
        this.io.emit(event, data);
    }
}

export const socketService = new SocketService();
