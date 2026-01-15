"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  useTheme,
  Fab,
  Badge,
  Zoom
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import EditIcon from "@mui/icons-material/Edit";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MessageBubble from "./MessageBubble";
import { ChatMessage, Reaction, MessageStatus } from "./types";

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
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadNewMessages, setUnreadNewMessages] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);

  // FIX: Track previous message length to differentiate updates from new messages
  const prevMessagesLengthRef = useRef(0);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string | null>>({});
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // --- Smart Scroll Logic ---

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      setUnreadNewMessages(0);
      setShowScrollButton(false);
      isUserAtBottomRef.current = true;
    }
  }, []);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;

    isUserAtBottomRef.current = isAtBottom;

    if (isAtBottom) {
      setShowScrollButton(false);
      setUnreadNewMessages(0);
    } else {
      setShowScrollButton(true);
    }
  };

  // FIX: This Effect now only runs scroll logic if a NEW message arrived
  useEffect(() => {
    const currentLength = messages.length;
    const prevLength = prevMessagesLengthRef.current;

    // Update the ref for next time
    prevMessagesLengthRef.current = currentLength;

    // If length didn't increase (or decreased), it's an edit/reaction/delete. DO NOT SCROLL.
    if (currentLength <= prevLength) return;

    // Only proceed if a NEW message was actually added
    const lastMessage = messages[messages.length - 1];
    const isMine = lastMessage?.userId === user?.id;

    if (isMine || isUserAtBottomRef.current) {
      scrollToBottom();
    } else {
      if (messages.length > 0) {
        setShowScrollButton(true);
        setUnreadNewMessages(prev => prev + 1);
      }
    }
  }, [messages, user?.id, scrollToBottom]);

  // --- Socket Logic ---

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SOCKET_URL || "";
    if (base) fetch(`${base.replace(/\/$/, "")}/api/health`).catch(() => { });
    else fetch("/api/socket").catch(() => { });

    const socket = io(base, { path: "/api/socket", transports: ["websocket"], withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      setMySocketId(socket.id ?? "");
      socket.emit("joinRoom", roomId);
      socket.emit("markAsRead", { roomId, userId: user?.id });
    });

    socket.on("message", (msg: ChatMessage) => {
      if (!msg.roomId || msg.roomId === roomId) {
        setMessages((prev) => [...prev, msg]);
        if (msg.userId !== user?.id) socket.emit("markAsRead", { roomId, userId: user?.id });
      }
    });

    socket.on("messageUpdated", (payload: { id: string | number, text: string, isEdited: boolean, roomId?: string }) => {
      if (!payload.roomId || payload.roomId === roomId) {
        setMessages(prev => prev.map(m => m.id === payload.id ? { ...m, text: payload.text, isEdited: payload.isEdited } : m));
      }
    });

    socket.on("messageDeleted", (payload: { id: string | number, roomId?: string }) => {
      if (!payload.roomId || payload.roomId === roomId) {
        setMessages(prev => prev.map(m => m.id === payload.id ? { ...m, isDeleted: true, text: "" } : m));
      }
    });

    socket.on("typing", (payload) => {
      if (!payload.roomId || payload.roomId === roomId) {
        setTypingUsers((prev) => ({ ...prev, [payload.senderId]: payload.isTyping }));
      }
    });

    socket.on("messageReaction", (payload: { messageId: string | number; reactions: Record<string, Reaction>; roomId?: string }) => {
      if (!payload.roomId || payload.roomId === roomId) {
        setMessages((prev) => prev.map(m => (String(m.id) === String(payload.messageId)) ? { ...m, reactions: payload.reactions } : m));
      }
    });

    socket.on("messageStatusUpdate", (payload: { roomId: string, status: MessageStatus, userId?: string }) => {
      if (payload.roomId === roomId) {
        setMessages(prev => prev.map(m => (m.userId === user?.id && m.status !== 'read') ? { ...m, status: payload.status } : m));
      }
    });

    return () => { socket.disconnect(); };
  }, [roomId, user?.id]);

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
          reactions: m.reactions,
          status: m.status || "sent",
          isEdited: m.isEdited,
          isDeleted: m.isDeleted
        }));
        setMessages(mapped);

        // Initial load should create specific length reference
        prevMessagesLengthRef.current = mapped.length;

        setTimeout(scrollToBottom, 100);
      })
      .catch(() => { });
  }, [roomId, API_BASE, scrollToBottom]);

  useEffect(() => {
    const missing = Array.from(new Set(messages.map((m) => m.userId).filter((id): id is string => !!id))).filter(id => !(id in avatarByUserId));
    if (missing.length === 0) return;
    missing.forEach((uid) => {
      fetch(`${API_BASE}/api/users/${uid}`).then(r => r.json()).then((u) => {
        setAvatarByUserId((prev) => ({ ...prev, [uid]: u?.imageUrl || null }));
        if (u?.name) setNameByUserId((prev) => ({ ...prev, [uid]: String(u.name) }));
      }).catch(() => setAvatarByUserId((prev) => ({ ...prev, [uid]: null })));
    });
  }, [messages, API_BASE, avatarByUserId]);

  const handleSendMessage = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !socketRef.current) return;

    if (editingMessage) {
      socketRef.current.emit("editMessage", { messageId: editingMessage.id, text: trimmed, roomId });
      setEditingMessage(null);
    } else {
      const payload: Partial<ChatMessage> & { roomId: string, userId: string } = {
        text: trimmed,
        roomId,
        userId: user?.id || "anon",
        replyTo: replyToMessage ? {
          id: replyToMessage.id,
          text: replyToMessage.text,
          senderName: nameByUserId[replyToMessage.userId || ""] || replyToMessage.senderName || "User"
        } : undefined,
        status: "sent"
      };
      socketRef.current.emit("message", payload);
    }

    setInputValue("");
    setReplyToMessage(null);
    socketRef.current.emit("typing", { isTyping: false, roomId });
  };

  const handleEdit = (msg: ChatMessage) => { setEditingMessage(msg); setInputValue(msg.text); setReplyToMessage(null); };
  const handleDelete = (messageId: string | number) => { socketRef.current?.emit("deleteMessage", { messageId, roomId }); };
  const cancelAction = () => { setReplyToMessage(null); setEditingMessage(null); setInputValue(""); };
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };
  const handleReply = (msg: ChatMessage) => { setReplyToMessage(msg); setEditingMessage(null); };
  const handleReact = (messageId: string | number, emoji: string) => { socketRef.current?.emit("addReaction", { messageId, emoji, userId: user?.id, roomId }); };
  const otherUserTyping = Object.entries(typingUsers).some(([senderId, isTyping]) => isTyping && senderId !== mySocketId);

  const getDayString = (date: Date, isRTL: boolean) => {
    const today = new Date(); const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return isRTL ? "היום" : "Today";
    if (date.toDateString() === yesterday.toDateString()) return isRTL ? "אתמול" : "Yesterday";
    return date.toLocaleDateString(isRTL ? 'he-IL' : 'en-US');
  };

  if (!mounted) return null;

  return (
    <Paper elevation={3} dir={isRTL ? "rtl" : "ltr"} sx={{ width: "100%", height: "600px", display: "flex", flexDirection: "column", borderRadius: 2, overflow: "hidden", bgcolor: "background.paper" }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider", bgcolor: "primary.main", color: "primary.contrastText" }}>
        <Typography variant="h6" fontWeight="bold">{isRTL ? "חדר צ'אט" : "Chat Room"}</Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>{roomId === "global" ? (isRTL ? "צ'אט כללי" : "Global Chat") : roomId}</Typography>
      </Box>

      <Box sx={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Box
          ref={scrollContainerRef}
          onScroll={handleScroll}
          sx={{ flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50' }}
        >
          {messages.map((m, index) => {
            const isMine = m.userId === user?.id;
            const prevMsg = messages[index - 1]; const nextMsg = messages[index + 1];
            const currentDate = new Date(m.ts); const prevDate = prevMsg ? new Date(prevMsg.ts) : null;
            const showDateSeparator = !prevDate || currentDate.toDateString() !== prevDate.toDateString();
            const isPrevSameSender = prevMsg && prevMsg.userId === m.userId && !showDateSeparator;
            const isNextSameSender = nextMsg && nextMsg.userId === m.userId;

            return (
              <div key={m.id}>
                {showDateSeparator && (
                  <Box sx={{ display: "flex", justifyContent: "center", my: 2 }}>
                    <Box sx={{ bgcolor: "action.disabledBackground", px: 2, py: 0.5, borderRadius: 4 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight="bold">{getDayString(currentDate, isRTL)}</Typography>
                    </Box>
                  </Box>
                )}
                <MessageBubble
                  message={m}
                  isMine={isMine}
                  isRTL={isRTL}
                  onReply={handleReply}
                  onReact={handleReact}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  avatarUrl={m.userId ? avatarByUserId[m.userId] : undefined}
                  displayName={(m.userId && nameByUserId[m.userId]) || (isMine ? (user?.fullName || (isRTL ? "אני" : "Me")) : "") || m.senderName || "Unknown"}
                  timeStr={currentDate.toLocaleTimeString(isRTL ? 'he-IL' : 'en-US', { hour: "2-digit", minute: "2-digit" })}
                  showAvatar={!isNextSameSender}
                  showName={!isPrevSameSender && !isMine}
                  isFirstInGroup={!isPrevSameSender}
                  isLastInGroup={!isNextSameSender}
                  currentUserId={user?.id}
                />
              </div>
            );
          })}
          {otherUserTyping && <Box sx={{ px: 1, mt: 1 }}><Typography variant="caption">{isRTL ? "מישהו מקליד..." : "Someone is typing..."}</Typography></Box>}
          <div ref={messagesEndRef} />
        </Box>

        <Zoom in={showScrollButton}>
          <Box onClick={scrollToBottom} sx={{ position: "absolute", bottom: 16, [isRTL ? "left" : "right"]: 16, zIndex: 20, cursor: "pointer" }}>
            <Badge badgeContent={unreadNewMessages} color="error">
              <Fab color="primary" size="small" aria-label="scroll down"><KeyboardArrowDownIcon /></Fab>
            </Badge>
          </Box>
        </Zoom>
      </Box>

      {(replyToMessage || editingMessage) && (
        <Box sx={{ p: 1, px: 2, bgcolor: "action.hover", borderTop: 1, borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", flexDirection: "column", borderLeft: isRTL ? 0 : "3px solid", borderRight: isRTL ? "3px solid" : 0, borderColor: "primary.main", pl: isRTL ? 0 : 1, pr: isRTL ? 1 : 0 }}>
            {editingMessage ? (
              <>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <EditIcon fontSize="small" color="primary" sx={{ fontSize: 16 }} />
                  <Typography variant="caption" color="primary" fontWeight="bold">{isRTL ? "עורך הודעה" : "Editing Message"}</Typography>
                </Box>
                <Typography variant="caption" noWrap sx={{ maxWidth: 300 }}>{editingMessage.text}</Typography>
              </>
            ) : (
              <>
                <Typography variant="caption" color="primary" fontWeight="bold">{isRTL ? "מגיב ל:" : "Replying to:"} {replyToMessage?.senderName}</Typography>
                <Typography variant="caption" noWrap sx={{ maxWidth: 300 }}>{replyToMessage?.text}</Typography>
              </>
            )}
          </Box>
          <IconButton size="small" onClick={cancelAction}><CloseIcon fontSize="small" /></IconButton>
        </Box>
      )}

      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <TextField
            fullWidth multiline maxRows={3} variant="outlined" size="small"
            placeholder={isRTL ? "כתוב הודעה..." : "Type a message..."}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={() => socketRef.current?.emit("typing", { isTyping: true, roomId })}
            onBlur={() => socketRef.current?.emit("typing", { isTyping: false, roomId })}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          <IconButton color="primary" onClick={handleSendMessage} disabled={!inputValue.trim()} sx={{ mb: 0.5, transform: isRTL ? "scaleX(-1)" : "none" }}>
            {editingMessage ? <CheckIcon /> : <SendIcon />}
          </IconButton>
        </Stack>
      </Box>
    </Paper>
  );
}