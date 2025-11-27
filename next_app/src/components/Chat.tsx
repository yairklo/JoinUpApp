"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useUser } from "@clerk/nextjs";
import Toast from "react-bootstrap/Toast";
import ToastContainer from "react-bootstrap/ToastContainer";
import Avatar from "@/components/Avatar";

type ChatMessage = {
  id: number;
  text: string;
  senderId: string;
  senderName?: string;
  ts: string;
  userId?: string;
};

type ChatProps = {
  roomId?: string;
};

export default function Chat({ roomId = "global" }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [mySocketId, setMySocketId] = useState<string>("");
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const socketRef = useRef<Socket | null>(null);
  const { user } = useUser();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string | null>>({});
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    // Ensure the Socket.IO server is initialized
    fetch("/api/socket").catch(() => {});

    const socket = io({ path: "/api/socket" });
    socketRef.current = socket;

    socket.on("connect", () => {
      setMySocketId(socket.id ?? "");
      socket.emit("joinRoom", roomId);
    });

    const handleMessage = (msg: ChatMessage & { roomId?: string }) => {
      if (!msg.roomId || msg.roomId === roomId) {
        setMessages((prev) => [...prev, msg]);
      }
    };
    socket.on("message", handleMessage);

    const handleTyping = (payload: { senderId: string; isTyping: boolean; roomId?: string }) => {
      if (!payload.roomId || payload.roomId === roomId) {
        setTypingUsers((prev) => ({ ...prev, [payload.senderId]: payload.isTyping }));
      }
    };
    socket.on("typing", handleTyping);

    return () => {
      socket.off("message", handleMessage);
      socket.off("typing", handleTyping);
      socket.disconnect();
    };
  }, [roomId]);

  // fetch history
  useEffect(() => {
    if (!roomId) return;
    fetch(`${API_BASE}/api/messages?roomId=${encodeURIComponent(roomId)}&limit=200`).then(r => r.json()).then((arr) => {
      const mapped = arr.map((m: any) => ({ id: m.id || Date.parse(m.ts), text: m.text, senderId: m.userId || "", ts: m.ts, roomId, userId: m.userId }));
      setMessages(mapped);
    }).catch(() => {});
  }, [roomId]);

  // resolve avatars for userIds in messages
  useEffect(() => {
    const missing = Array.from(new Set(messages.map(m => m.userId).filter((id): id is string => !!id))).filter(id => !(id in avatarByUserId));
    if (missing.length === 0) return;
    missing.forEach((uid) => {
      fetch(`${API_BASE}/api/users/${uid}`).then(r => r.json()).then((u) => {
        setAvatarByUserId((prev) => ({ ...prev, [uid]: u?.imageUrl || null }));
        if (u?.name) setNameByUserId((prev) => ({ ...prev, [uid]: String(u.name) }));
      }).catch(() => {
        setAvatarByUserId((prev) => ({ ...prev, [uid]: null }));
      });
    });
  }, [messages]);

  const sendMessage = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !socketRef.current) return;
    socketRef.current.emit("message", { text: trimmed, roomId, userId: user?.id });
    setInputValue("");
    socketRef.current.emit("typing", { isTyping: false, roomId });
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  const otherUserTyping = Object.entries(typingUsers).some(
    ([senderId, isTyping]) => isTyping && senderId !== mySocketId
  );

  if (!mounted) return null;

  return (
    <div className="w-full" suppressHydrationWarning>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Chat</h2>
      </div>
      <div className="mb-3 h-80 overflow-y-auto rounded border p-3 bg-white" role="log" aria-live="polite">
        <ToastContainer className="position-static w-100">
          {messages.map((m) => {
            const isMine = m.userId && user?.id ? m.userId === user.id : false;
            const avatarUrl = m.userId ? avatarByUserId[m.userId] : undefined;
            const timeStr = new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const displayName =
              (m.userId && nameByUserId[m.userId]) ||
              (m.userId && user?.id && m.userId === user.id ? (user.fullName || user.firstName || "Me") : "") ||
              m.senderName ||
              m.userId ||
              "Unknown";
            return (
              <Toast
                key={m.id}
                bg={isMine ? "success" : "secondary"}
                className={`mb-2 ${isMine ? "ms-auto" : ""}`}
                style={{ maxWidth: "75%" }}
              >
                <Toast.Header closeButton={false}>
                  {/* avatar */}
                  <span className="me-2"><Avatar src={avatarUrl || undefined} alt={displayName} name={displayName} size="xs" /></span>
                  <strong className="me-auto">{displayName}</strong>
                  <small className="text-muted">{timeStr}</small>
                </Toast.Header>
                <Toast.Body>{m.text}</Toast.Body>
              </Toast>
            );
          })}
        </ToastContainer>
        {messages.length === 0 ? (
          <div className="text-gray-500 text-sm mt-2">No messages yet <span aria-hidden>👋</span></div>
        ) : null}
        {otherUserTyping ? <div className="text-xs text-gray-500 mt-1">Someone is typing...</div> : null}
      </div>
      <div className="flex gap-2" suppressHydrationWarning>
        <textarea
          className="flex-1 rounded border px-3 py-2 outline-none focus:ring resize-none"
          placeholder="Type a message"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          onInput={() => socketRef.current?.emit("typing", { isTyping: true, roomId })}
          onBlur={() => socketRef.current?.emit("typing", { isTyping: false, roomId })}
          rows={1}
        />
        <button className="btn btn-primary btn-sm" onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

