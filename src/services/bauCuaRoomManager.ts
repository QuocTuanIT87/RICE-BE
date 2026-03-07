import { Server, Socket } from "socket.io";
import { User } from "../modules/auth/user.model";
import { socketService } from "./socketService";

const MASCOTS = ["bau", "cua", "tom", "ca", "ga", "nai"];
const BETTING_TIME = 10; // 10 seconds per round

interface Player {
    userId: string;
    name: string;
    avatar: string;
    gameCoins: number;
    socketId: string;
    isDealer: boolean;
}

interface Bet {
    userId: string;
    mascot: string;
    amount: number;
}

interface Room {
    id: string;
    name: string;
    players: Player[];
    dealerId: string | null;
    status: "IDLE" | "BETTING" | "RESULT";
    timer: number;
    bets: Bet[];
    lastResult: string[];
    lastPayouts: { userId: string; name: string; totalPayout: number; netDelta: number }[];
}

export class BauCuaRoomManager {
    private rooms: Room[] = [];
    private io: Server | null = null;

    constructor() {
        for (let i = 1; i <= 5; i++) {
            this.rooms.push({
                id: `room-${i}`,
                name: `Phòng ${i}`,
                players: [],
                dealerId: null,
                status: "IDLE",
                timer: 0,
                bets: [],
                lastResult: [],
                lastPayouts: [],
            });
        }
    }

    public init(io: Server) {
        this.io = io;
        console.log("🎮 BauCuaRoomManager initialized");

        io.on("connection", (socket) => {
            socket.on("baucua:transfer_dealer", ({ roomId, targetUserId }) => {
                this.transferDealer(socket, roomId, targetUserId);
            });
        });
    }

    private transferDealer(socket: Socket, roomId: string, targetUserId: string) {
        const room = this.rooms.find((r) => r.id === roomId);
        if (!room || room.status !== "IDLE") return;

        // Verify socket is current Dealer
        const currentDealer = room.players.find((p) => p.socketId === socket.id);
        if (!currentDealer || currentDealer.userId !== room.dealerId) return;

        // Find target player in the same room
        const targetPlayer = room.players.find((p) => p.userId === targetUserId);
        if (!targetPlayer) return;

        // Perform transfer
        currentDealer.isDealer = false;
        targetPlayer.isDealer = true;
        room.dealerId = targetPlayer.userId;

        this.io?.to(roomId).emit("baucua:new_dealer", {
            dealerId: room.dealerId,
            message: `${currentDealer.name} đã nhường lời làm Cái cho ${targetPlayer.name}!`,
        });
    }

    public getRoomsSummary() {
        return this.rooms.map((r) => ({
            id: r.id,
            name: r.name,
            playerCount: r.players.length,
            status: r.status,
            hasDealer: !!r.dealerId,
        }));
    }

    public async joinRoom(socket: Socket, roomIdx: number, user: any) {
        try {
            const roomId = `room-${roomIdx + 1}`;
            const room = this.rooms[roomIdx];

            if (!room) {
                console.error(`[BauCua] Room not found at index ${roomIdx}`);
                return;
            }

            // Remove from other rooms first
            this.leaveAllRooms(socket);

            if (!user || (!user._id && !user.id)) {
                console.error("[BauCua] User data missing in joinRoom");
                return;
            }

            const userId = (user._id || user.id).toString();

            // CRITICAL: Remove any existing player with the SAME userId (e.g. from a previous tab or ghost session)
            room.players = room.players.filter((p) => p.userId !== userId);

            // If the dealer was the one who left, clear the dealerId so the next person (or the same person reconnecting) can claim it
            if (room.dealerId === userId) {
                room.dealerId = null;
            }

            const player: Player = {
                userId,
                name: user.name || "Vô danh",
                avatar: user.avatar || "",
                gameCoins: user.gameCoins || 0,
                socketId: socket.id,
                isDealer: false,
            };

            // If room is empty, make this player the Dealer
            if (!room.dealerId) {
                room.dealerId = player.userId;
                player.isDealer = true;
            }

            room.players.push(player);
            socket.join(roomId);

            console.log(`👤 User ${player.name} joined ${roomId} (Dealer: ${player.isDealer})`);

            // Notify room
            this.io?.to(roomId).emit("baucua:player_joined", {
                player,
                message: `${player.name} đã vào phòng`,
            });

            // Send full room state to the joiner
            socket.emit("baucua:room_state", room);
        } catch (error) {
            console.error("[BauCua] Error in joinRoom:", error);
        }
    }

    public leaveAllRooms(socket: Socket) {
        this.rooms.forEach((room) => {
            const playerIdx = room.players.findIndex((p) => p.socketId === socket.id);
            if (playerIdx !== -1) {
                const player = room.players[playerIdx];
                room.players.splice(playerIdx, 1);
                socket.leave(room.id);

                // console.log(`👋 User ${player.name} left ${room.id}`);

                // If Dealer left, always elect a new one to prevent stuck room.
                if (room.dealerId === player.userId) {
                    if (room.players.length > 0) {
                        const nextDealer = room.players[0];
                        room.dealerId = nextDealer.userId;
                        nextDealer.isDealer = true;
                        this.io?.to(room.id).emit("baucua:new_dealer", {
                            dealerId: room.dealerId,
                            message: `${nextDealer.name} đã lên làm Cái!`,
                        });
                    } else {
                        room.dealerId = null;
                    }
                }

                this.io?.to(room.id).emit("baucua:player_left", {
                    userId: player.userId,
                });
            }
        });
    }

    public startRound(socket: Socket, roomId: string) {
        const room = this.rooms.find((r) => r.id === roomId);
        // Allow start from IDLE or RESULT
        if (!room || (room.status !== "IDLE" && room.status !== "RESULT") || room.dealerId === null) return;

        // Verify socket is the Dealer
        const player = room.players.find((p) => p.socketId === socket.id);
        if (!player || player.userId !== room.dealerId) return;

        room.status = "BETTING";
        room.timer = BETTING_TIME;
        room.bets = [];
        room.lastPayouts = [];

        this.io?.to(roomId).emit("baucua:round_start", {
            status: room.status,
            timer: room.timer,
        });

        // Start timer countdown
        const countdown = setInterval(() => {
            room.timer--;
            if (room.timer <= 0) {
                clearInterval(countdown);
                this.processResult(room);
            } else {
                this.io?.to(roomId).emit("baucua:timer", room.timer);
            }
        }, 1000);
    }

    public async placeBet(socket: Socket, roomId: string, mascot: string, amount: number) {
        try {
            const room = this.rooms.find((r) => r.id === roomId);
            if (!room || room.status !== "BETTING") return;

            const player = room.players.find((p) => p.socketId === socket.id);
            if (!player || player.isDealer) return; // Dealer can't bet

            if (player.gameCoins < amount) return;

            // Deduct locally and from DB
            player.gameCoins -= amount;
            await User.findByIdAndUpdate(player.userId, { $inc: { gameCoins: -amount } });

            room.bets.push({ userId: player.userId, mascot, amount });

            // Notify room of global bet snapshot
            this.io?.to(roomId).emit("baucua:bet_placed", {
                userId: player.userId,
                mascot,
                amount,
                newBalance: player.gameCoins,
                totalMascotBet: room.bets.filter(b => b.mascot === mascot).reduce((sum, b) => sum + b.amount, 0)
            });

            // Emit to sync header balance
            socketService.emitToUser(player.userId, "coins_updated", {
                gameCoins: player.gameCoins
            });
        } catch (error) {
            console.error("[BauCua] Error in placeBet:", error);
        }
    }

    private async processResult(room: Room) {
        try {
            room.status = "RESULT";

            // Generate 3 random dice
            const dice = [
                MASCOTS[Math.floor(Math.random() * 6)],
                MASCOTS[Math.floor(Math.random() * 6)],
                MASCOTS[Math.floor(Math.random() * 6)],
            ];
            room.lastResult = dice;

            // Calculate payouts
            const payouts: Map<string, number> = new Map();
            let totalDealerDelta = 0;

            room.bets.forEach(bet => {
                const matches = dice.filter(d => d === bet.mascot).length;
                let delta = 0;
                if (matches > 0) {
                    // Win: capital + matches * amount
                    delta = bet.amount + (matches * bet.amount);
                }

                if (delta > 0) {
                    payouts.set(bet.userId, (payouts.get(bet.userId) || 0) + delta);
                    totalDealerDelta -= (delta - bet.amount); // Dealer pays the Profit
                } else {
                    totalDealerDelta += bet.amount; // Dealer collects the Loss
                }
            });

            // Apply payouts to Players and Dealer
            const payoutReport: { userId: string; name: string; totalPayout: number; netDelta: number; finalBalance: number }[] = [];

            // Update Players
            for (const [userId, amount] of payouts.entries()) {
                const p = room.players.find(pl => pl.userId === userId);
                if (p) {
                    p.gameCoins += amount;
                    const totalBetOfUser = room.bets.filter(b => b.userId === userId).reduce((s, b) => s + b.amount, 0);
                    payoutReport.push({
                        userId: p.userId,
                        name: p.name,
                        totalPayout: amount,
                        netDelta: amount - totalBetOfUser,
                        finalBalance: p.gameCoins
                    });
                    await User.findByIdAndUpdate(userId, { $inc: { gameCoins: amount } });

                    // Emit to sync header balance
                    socketService.emitToUser(p.userId, "coins_updated", {
                        gameCoins: p.gameCoins
                    });
                }
            }

            // Players who lost everything (no payout)
            const bettors = new Set(room.bets.map(b => b.userId));
            for (const bUserId of bettors) {
                if (!payouts.has(bUserId)) {
                    const p = room.players.find(pl => pl.userId === bUserId);
                    if (p) {
                        const totalBetOfUser = room.bets.filter(b => b.userId === bUserId).reduce((s, b) => s + b.amount, 0);
                        payoutReport.push({
                            userId: bUserId,
                            name: p.name,
                            totalPayout: 0,
                            netDelta: -totalBetOfUser,
                            finalBalance: p.gameCoins
                        });
                    }
                }
            }

            // Update Dealer
            if (room.dealerId) {
                const dealer = room.players.find(p => p.userId === room.dealerId);
                if (dealer) {
                    dealer.gameCoins += totalDealerDelta;
                    payoutReport.push({
                        userId: dealer.userId,
                        name: dealer.name,
                        totalPayout: totalDealerDelta,
                        netDelta: totalDealerDelta,
                        finalBalance: dealer.gameCoins
                    });
                    await User.findByIdAndUpdate(room.dealerId, { $inc: { gameCoins: totalDealerDelta } });

                    // Emit to sync header balance
                    socketService.emitToUser(dealer.userId, "coins_updated", {
                        gameCoins: dealer.gameCoins
                    });
                }
            }

            room.lastPayouts = payoutReport;

            this.io?.to(room.id).emit("baucua:result", {
                dice,
                payouts: payoutReport,
            });

            this.io?.to(room.id).emit("baucua:status", "RESULT");

            // REMOVED: Status stays in RESULT until Dealer manually calls startRound
        } catch (error) {
            console.error("[BauCua] Error in processResult:", error);
        }
    }
}

export const bauCuaRoomManager = new BauCuaRoomManager();
