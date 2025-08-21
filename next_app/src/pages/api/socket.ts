import type { NextApiRequest, NextApiResponse } from "next";
import type { Server as HTTPServer } from "http";
import { Server as IOServer } from "socket.io";

// This API route initializes a single Socket.IO server instance
// and reuses it across requests during dev. It runs on the Node runtime.
type NextApiResponseWithSocketIO = NextApiResponse & {
  socket: {
    server: HTTPServer & { io?: IOServer };
  };
};

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const resWithSocket = res as NextApiResponseWithSocketIO;

  if (!resWithSocket.socket) {
    res.status(500).json({ error: "Socket is not available on the response object" });
    return;
  }

  if (!resWithSocket.socket.server.io) {
    const io = new IOServer(resWithSocket.socket.server, {
      path: "/api/socket",
    });
    resWithSocket.socket.server.io = io;

    io.on("connection", (socket) => {
      socket.on("joinRoom", (roomId: string) => {
        if (roomId) socket.join(roomId);
      });

      type IncomingMessage = string | { text: string; roomId?: string; senderName?: string; userId?: string };

      socket.on("message", async (incoming: IncomingMessage) => {
        const text = typeof incoming === "string" ? incoming : incoming.text;
        const roomId = typeof incoming === "string" ? undefined : incoming.roomId;
        const senderName = typeof incoming === "string" ? undefined : (incoming as any).senderName;
        const userId = typeof incoming === "string" ? undefined : (incoming as any).userId;
        const payload: { id: number; text: string; senderId: string; senderName?: string; ts: string; roomId?: string; userId?: string } = {
          id: Date.now(),
          text,
          senderId: socket.id,
          senderName,
          ts: new Date().toISOString(),
          roomId,
          userId,
        };

        // persist to server REST so offline users will get it later
        try {
          if (roomId) {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'}/api/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId, text: senderName ? `${senderName}: ${text}` : text, userId }),
            });
          }
        } catch {}

        if (payload.roomId) io.to(payload.roomId).emit("message", payload);
        else io.emit("message", payload);
      });

      socket.on("typing", (data: boolean | { isTyping: boolean; roomId?: string }) => {
        const isTyping = typeof data === "boolean" ? data : data.isTyping;
        const roomId = typeof data === "object" && data?.roomId ? data.roomId : undefined;
        const payload = { senderId: socket.id, isTyping, roomId };
        if (roomId) {
          socket.to(roomId).emit("typing", payload);
        } else {
          socket.broadcast.emit("typing", payload);
        }
      });
    });
  }

  res.end();
}

