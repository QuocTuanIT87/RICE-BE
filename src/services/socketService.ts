import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";

class SocketService {
    private _io: SocketServer | null = null;
    private activeUsers = new Map<string, Set<string>>(); // userId -> Set of socket.ids
    private offlineTimeouts = new Map<string, NodeJS.Timeout>(); // userId -> Timeout

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
                if (!userId) return;
                socket.join(userId);
                console.log(`🏠 User ${userId} đã gia nhập phòng cá nhân`);

                // Hủy timeout offline nếu có (vì họ đã online lại nhanh chóng)
                if (this.offlineTimeouts.has(userId)) {
                    clearTimeout(this.offlineTimeouts.get(userId)!);
                    this.offlineTimeouts.delete(userId);
                }

                // Thêm socket.id vào danh sách kết nối hoạt động của userId
                if (!this.activeUsers.has(userId)) {
                    this.activeUsers.set(userId, new Set());
                }
                this.activeUsers.get(userId)!.add(socket.id);

                // Lưu userId vào socket object để lấy ra khi ngắt kết nối
                (socket as any).userId = userId;

                // Phát sự kiện cập nhật trạng thái online của user này tới mọi người
                this.emitAll("presence_status", {
                    userId,
                    status: "online",
                    lastActive: new Date()
                });
            });

            // Yêu cầu danh sách user online
            socket.on("get_active_users", () => {
                const onlineUsers = Array.from(this.activeUsers.keys());
                socket.emit("active_users_list", onlineUsers);
            });

            // Đang gõ chữ (typing indicator)
            socket.on("chat_typing", (data: { senderId: string; receiverId: string; isTyping: boolean }) => {
                this.emitToUser(data.receiverId, "chat_typing", data);
            });

            // Tham gia phòng admin
            socket.on("join_admin", () => {
                socket.join("admin_room");
                console.log(`👑 Admin đã gia nhập phòng quản trị`);
            });

            socket.on("disconnect", (reason) => {
                const userId = (socket as any).userId;
                console.log(`👋 Client ngắt kết nối: ${socket.id} (reason: ${reason}, userId: ${userId})`);

                if (userId) {
                    const sockets = this.activeUsers.get(userId);
                    if (sockets) {
                        sockets.delete(socket.id);
                        if (sockets.size === 0) {
                            this.activeUsers.delete(userId);

                            // Tránh mất kết nối ảo khi F5, chờ 5 giây rồi mới phát offline
                            const timeout = setTimeout(() => {
                                this.offlineTimeouts.delete(userId);
                                this.emitAll("presence_status", {
                                    userId,
                                    status: "offline",
                                    lastActive: new Date()
                                });
                            }, 5000);
                            this.offlineTimeouts.set(userId, timeout);
                        }
                    }
                }
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
    public emitToAdmin(event: string, data?: any) {
        console.log(`📡 [Socket] Gửi tới Admin: ${event}`);
        this.io.to("admin_room").emit(event, data);
    }

    // Gửi sự kiện tới User cụ thể
    public emitToUser(userId: string, event: string, data?: any) {
        if (!userId || userId === "null" || userId === "undefined") {
            console.warn(`⚠️ [Socket] Không thể gửi tới User ${userId} (ID không hợp lệ)`);
            return;
        }
        console.log(`📡 [Socket] Gửi tới User ${userId}: ${event}`);
        this.io.to(userId).emit(event, data);
    }

    // Gửi tới tất cả
    public emitAll(event: string, data?: any) {
        console.log(`📡 [Socket] Gửi tới tất cả: ${event}`);
        this.io.emit(event, data);
    }
}

export const socketService = new SocketService();

