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
  Stack,
  CircularProgress,
  useTheme
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import MessageBubble from "./MessageBubble";
import { ChatMessage, Reaction } from "./types";

type ChatProps = {
  roomId?: string;
  language?: "en" | "he";
};

export default function Chat({ roomId = "global", language = "he" }: ChatProps) {
  const isRTL = language === "he";
  const { user } = useUser();
  const theme = useTheme();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [mySocketId, setMySocketId] = useState<string>("");
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string | null>>({});
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, replyToMessage, typingUsers]);

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

    const handleMessageReaction = (payload: { messageId: string | number; reactions: Record<string, Reaction>; roomId?: string }) => {
      if (!payload.roomId || payload.roomId === roomId) {
        setMessages((prev) => prev.map(m =>
          (m.id === payload.messageId || String(m.id) === String(payload.messageId))
            ? { ...m, reactions: payload.reactions }
            : m
        ));
      }
    };
    socket.on("messageReaction", handleMessageReaction);

    return () => {
      socket.off("message", handleMessage);
      socket.off("typing", handleTyping);
      socket.off("messageReaction", handleMessageReaction);
      socket.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    fetch(`${API_BASE}/api/messages?roomId=${encodeURIComponent(roomId)}&limit=200`)
      .then((r) => r.json())
      .then((arr: Array<any>) => {
        const mapped: ChatMessage[] = arr.map((m) => ({
          id: m.id ?? Date.parse(m.ts),
          text: m.text,
          senderId: m.userId || "",
          ts: m.ts,
          roomId,
          userId: m.userId,
          replyTo: m.replyTo,
          reactions: m.reactions
        }));
        setMessages(mapped);
      })
      .catch(() => { });
  }, [roomId, API_BASE]);

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

    const payload: Partial<ChatMessage> & { roomId: string, userId: string } = {
      text: trimmed,
      roomId,
      userId: user?.id || "anon",
      replyTo: replyToMessage ? {
        id: replyToMessage.id,
        text: replyToMessage.text,
        senderName: nameByUserId[replyToMessage.userId || ""] || replyToMessage.senderName || "User"
      } : undefined
    };

    socketRef.current.emit("message", payload);
    setInputValue("");
    setReplyToMessage(null);
    socketRef.current.emit("typing", { isTyping: false, roomId });
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleReply = (msg: ChatMessage) => {
    setReplyToMessage(msg);
  };

  const handleReact = (messageId: string | number, emoji: string) => {
    socketRef.current?.emit("addReaction", { messageId, emoji, userId: user?.id, roomId });
  };

  const otherUserTyping = Object.entries(typingUsers).some(
    ([senderId, isTyping]) => isTyping && senderId !== mySocketId
  );

  if (!mounted) return null;

  return (
    <Paper
      elevation={3}
      dir={isRTL ? "rtl" : "ltr"}
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
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider", bgcolor: "primary.main", color: "primary.contrastText" }}>
        <Typography variant="h6" fontWeight="bold">
          {isRTL ? "חדר צ'אט" : "Chat Room"}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          {roomId === "global" ? (isRTL ? "צ'אט כללי" : "Global Chat") : roomId}
        </Typography>
      </Box>

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
          const timeStr = new Date(m.ts).toLocaleTimeString(isRTL ? 'he-IL' : 'en-US', { hour: "2-digit", minute: "2-digit" });
          const displayName =
            (m.userId && nameByUserId[m.userId]) ||
            (isMine ? (user?.fullName || (isRTL ? "אני" : "Me")) : "") ||
            m.senderName ||
            m.userId ||
            "Unknown";

          return (
            <MessageBubble
              key={m.id}
              message={m}
              isMine={isMine}
              isRTL={isRTL}
              onReply={handleReply}
              onReact={handleReact}
              avatarUrl={avatarUrl}
              displayName={displayName}
              timeStr={timeStr}
            />
          );
        })}

        {otherUserTyping && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1 }}>
            <CircularProgress size={10} color="inherit" />
            <Typography variant="caption" color="text.secondary">
              {isRTL ? "מישהו מקליד..." : "Someone is typing..."}
            </Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {replyToMessage && (
        <Box sx={{
          p: 1,
          px: 2,
          bgcolor: "action.hover",
          borderTop: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <Box sx={{
            display: "flex",
            flexDirection: "column",
            borderLeft: isRTL ? 0 : "3px solid",
            borderRight: isRTL ? "3px solid" : 0,
            borderColor: "primary.main",
            pl: isRTL ? 0 : 1,
            pr: isRTL ? 1 : 0
          }}>
            <Typography variant="caption" color="primary" fontWeight="bold">
              {isRTL ? "מגיב ל:" : "Replying to:"} {nameByUserId[replyToMessage.userId || ""] || replyToMessage.senderName || "User"}
            </Typography>
            <Typography variant="caption" noWrap sx={{ maxWidth: 300 }}>
              {replyToMessage.text}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setReplyToMessage(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <TextField
            fullWidth
            multiline
            maxRows={3}
            variant="outlined"
            placeholder={isRTL ? "כתוב הודעה..." : "Type a message..."}
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
            sx={{
              mb: 0.5,
              transform: isRTL ? "scaleX(-1)" : "none"
            }}
          >
            <SendIcon />
          </IconButton>
        </Stack>
      </Box>
    </Paper>
  );
}