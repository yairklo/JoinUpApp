"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useUser } from "@clerk/nextjs";
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  Avatar,
  Stack,
  CircularProgress,
  useTheme
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import SmartToyIcon from "@mui/icons-material/SmartToy";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { user } = useUser();
  const theme = useTheme();

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string | null>>({});
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SOCKET_URL || "";

    if (base) {
      fetch(`${base.replace(/\/$/, "")}/api/health`).catch(() => { });
    } else {
      fetch("/api/socket").catch(() => { });
    }

    const socket = io(base, {
      path: "/api/socket",
      transports: ["websocket"],
      withCredentials: true,
    });
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

  // Fetch history
  useEffect(() => {
    if (!roomId) return;
    fetch(`${API_BASE}/api/messages?roomId=${encodeURIComponent(roomId)}&limit=200`)
      .then((r) => r.json())
      .then((arr: Array<{ id?: number; text: string; userId?: string; ts: string }>) => {
        const mapped = arr.map((m) => ({
          id: m.id ?? Date.parse(m.ts),
          text: m.text,
          senderId: m.userId || "",
          ts: m.ts,
          roomId,
          userId: m.userId,
        }));
        setMessages(mapped);
      })
      .catch(() => { });
  }, [roomId, API_BASE]);

  // Resolve avatars
  useEffect(() => {
    const missing = Array.from(
      new Set(messages.map((m) => m.userId).filter((id): id is string => !!id))
    ).filter((id) => !(id in avatarByUserId));

    if (missing.length === 0) return;

    missing.forEach((uid) => {
      fetch(`${API_BASE}/api/users/${uid}`)
        .then((r) => r.json())
        .then((u) => {
          setAvatarByUserId((prev) => ({ ...prev, [uid]: u?.imageUrl || null }));
          if (u?.name) setNameByUserId((prev) => ({ ...prev, [uid]: String(u.name) }));
        })
        .catch(() => {
          setAvatarByUserId((prev) => ({ ...prev, [uid]: null }));
        });
    });
  }, [messages, API_BASE, avatarByUserId]);

  const sendMessage = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !socketRef.current) return;
    socketRef.current.emit("message", { text: trimmed, roomId, userId: user?.id });
    setInputValue("");
    socketRef.current.emit("typing", { isTyping: false, roomId });
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const otherUserTyping = Object.entries(typingUsers).some(
    ([senderId, isTyping]) => isTyping && senderId !== mySocketId
  );

  if (!mounted) return null;

  return (
    <Paper
      elevation={3}
      sx={{
        width: "100%",
        height: "600px",
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper"
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider", bgcolor: "primary.main", color: "primary.contrastText" }}>
        <Typography variant="h6" fontWeight="bold">
          Chat Room
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          {roomId === "global" ? "Global Chat" : roomId}
        </Typography>
      </Box>

      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'
        }}
      >
        {messages.length === 0 && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4, opacity: 0.5 }}>
            <Typography variant="body2">No messages yet. Start the conversation!</Typography>
          </Box>
        )}

        {messages.map((m) => {
          const isMine = m.userId && user?.id ? m.userId === user.id : false;
          const avatarUrl = m.userId ? avatarByUserId[m.userId] : undefined;
          const timeStr = new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const displayName =
            (m.userId && nameByUserId[m.userId]) ||
            (isMine ? (user?.fullName || "Me") : "") ||
            m.senderName ||
            m.userId ||
            "Unknown";

          return (
            <Box
              key={m.id}
              sx={{
                display: "flex",
                flexDirection: isMine ? "row-reverse" : "row",
                alignItems: "flex-end",
                gap: 1,
                maxWidth: "100%",
              }}
            >
              <Avatar
                src={avatarUrl || undefined}
                alt={displayName}
                sx={{ width: 32, height: 32, bgcolor: isMine ? "primary.dark" : "secondary.main" }}
              >
                {!avatarUrl && <SmartToyIcon fontSize="small" />}
              </Avatar>

              <Box sx={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                <Typography variant="caption" sx={{ ml: 1, mr: 1, color: "text.secondary", fontSize: "0.7rem" }}>
                  {displayName} • {timeStr}
                </Typography>
                <Paper
                  elevation={1}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    borderBottomRightRadius: isMine ? 0 : 2,
                    borderBottomLeftRadius: isMine ? 2 : 0,
                    bgcolor: isMine ? "primary.main" : "background.paper",
                    color: isMine ? "primary.contrastText" : "text.primary",
                    wordBreak: "break-word"
                  }}
                >
                  <Typography variant="body2">{m.text}</Typography>
                </Paper>
              </Box>
            </Box>
          );
        })}

        {/* Typing Indicator */}
        {otherUserTyping && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: 1 }}>
            <CircularProgress size={10} color="inherit" />
            <Typography variant="caption" color="text.secondary">Someone is typing...</Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input Area */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <TextField
            fullWidth
            multiline
            maxRows={3}
            variant="outlined"
            placeholder="Type a message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={() => socketRef.current?.emit("typing", { isTyping: true, roomId })}
            onBlur={() => socketRef.current?.emit("typing", { isTyping: false, roomId })}
            size="small"
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 3,
              }
            }}
          />
          <IconButton
            color="primary"
            onClick={sendMessage}
            disabled={!inputValue.trim()}
            sx={{ mb: 0.5 }}
          >
            <SendIcon />
          </IconButton>
        </Stack>
      </Box>
    </Paper>
  );
}