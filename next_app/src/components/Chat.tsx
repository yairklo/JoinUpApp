"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useUser } from "@clerk/nextjs";

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
      }).catch(() => setAvatarByUserId((prev) => ({ ...prev, [uid]: null })));
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
      <div className="mb-3 h-80 overflow-y-auto rounded border p-3 space-y-3 bg-white" role="log" aria-live="polite">
        {messages.map((m, idx) => {
          const isMine = m.senderId === mySocketId;
          const avatarUrl = m.userId ? avatarByUserId[m.userId] : undefined;
          const zebra = idx % 2 === 1;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
              {!isMine && (
                <span className="inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-700 overflow-hidden w-[28px] h-[28px] ring-1 ring-gray-300">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover block" />
                  ) : (
                    <span className="text-[11px] font-semibold">{m.userId ? (m.userId.slice(0,2).toUpperCase()) : "?"}</span>
                  )}
                </span>
              )}
              <div className={`max-w-[70%] rounded px-3 py-2 text-sm shadow ${isMine ? "bg-blue-600 text-white" : zebra ? "bg-gray-100" : "bg-gray-50"} text-gray-900`}>
                <div className="text-[11px] font-medium opacity-70 mb-0.5">{m.senderName || m.userId || ""}</div>
                <div>{m.text}</div>
                <div className="mt-1 text-[10px] opacity-60">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              {isMine && (
                <span className="inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-700 overflow-hidden w-[28px] h-[28px] ring-1 ring-gray-300">
                  {user?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.imageUrl} alt="me" className="w-full h-full object-cover block" />
                  ) : (
                    <span className="text-[11px] font-semibold">ME</span>
                  )}
                </span>
              )}
            </div>
          );
        })}
        {messages.length === 0 && (
          <div className="text-gray-500 text-sm">No messages yet <span aria-hidden>👋</span></div>
        )}
        {otherUserTyping && (
          <div className="text-xs text-gray-500">Someone is typing...</div>
        )}
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
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={sendMessage}>
          Send
        </button>
      </div>
    </div>
  );
}

