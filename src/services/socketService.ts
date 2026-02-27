import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";

class SocketService {
    private _io: SocketServer | null = null;

    public init(server: HttpServer, corsOrigins: (string | RegExp)[]) {
        this._io = new SocketServer(server, {
            cors: {
                origin: corsOrigins,
                methods: ["GET", "POST"],
                credentials: true,
            },
            // Ưu tiên polling trước, sau đó upgrade lên websocket
            // Render free tier không hỗ trợ sticky sessions nên websocket-first sẽ fail
            transports: ["polling", "websocket"],
            // Tăng timeout cho môi trường production (Render free tier chậm)
            pingTimeout: 60000,        // 60s thay vì 20s mặc định
            pingInterval: 25000,       // 25s
            connectTimeout: 60000,     // 60s để connect
            allowUpgrades: true,       // Cho phép upgrade từ polling → websocket
        });

        console.log("🔌 Socket.io đã được khởi tạo!");

        this._io.on("connection", (socket) => {
            console.log(`👤 Client kết nối: ${socket.id} (transport: ${socket.conn.transport.name})`);

            // Log khi upgrade transport
            socket.conn.on("upgrade", (transport: any) => {
                console.log(`⬆️ Client ${socket.id} upgraded to ${transport.name}`);
            });

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

            socket.on("disconnect", (reason) => {
                console.log(`👋 Client ngắt kết nối: ${socket.id} (reason: ${reason})`);
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
