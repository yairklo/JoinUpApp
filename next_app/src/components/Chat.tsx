"use client";

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { io, Socket } from "socket.io-client";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
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
  Zoom,
  Avatar
} from "@mui/material";
import { useChat } from "@/context/ChatContext";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import EditIcon from "@mui/icons-material/Edit";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MessageBubble from "./MessageBubble";
import { ChatMessage, Reaction, MessageStatus } from "./types";

type ChatProps = {
  roomId?: string;
  language?: "en" | "he";
  isWidget?: boolean;
  chatName?: string;
};

export default function Chat({ roomId = "global", language = "he", isWidget = false, chatName }: ChatProps) {
  const isRTL = language === "he";
  const { user } = useUser();
  const { getToken } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);

  const [chatDetails, setChatDetails] = useState<any>(null);

  // Logic to determine other user and avatar
  const isPrivate = chatDetails?.type?.toUpperCase() === 'PRIVATE';

  const otherParticipant = isPrivate
    ? chatDetails?.participants?.find((p: any) => p.userId !== user?.id)
    : null;

  const otherUserId = otherParticipant?.userId;
  const otherUserAvatar = otherParticipant?.user?.imageUrl; // Assuming API returns included user
  const effectiveChatName = chatName || (isPrivate ? otherParticipant?.user?.name : "Game Chat") || (roomId === "global" ? (isRTL ? "צ'אט כללי" : "Global Chat") : "Chat");

  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unreadNewMessages, setUnreadNewMessages] = useState(0);

  // FIX: Use State for socket to trigger re-renders on connection
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);

  // Track previous message length to differentiate updates from new messages
  const prevMessagesLengthRef = useRef(0);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string | null>>({});
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  // Typing timeouts ref to manage auto-clearing
  const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => { setMounted(true); }, []);

  // Fetch Chat Details
  useEffect(() => {
    if (!roomId || roomId === 'global') return;
    const fetchDetails = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/api/chats/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setChatDetails(data);
        }
      } catch (e) {
        console.error("Failed to fetch chat details", e);
      }
    };
    fetchDetails();
  }, [roomId, API_BASE, getToken]);

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

  // Run scroll logic only if a NEW message arrived
  useLayoutEffect(() => {
    // Immediate scroll if loading finished and at bottom
    if (!isLoading && messages.length > 0 && isUserAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, isLoading, scrollToBottom]);

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

    if (!isLoading) {
      if (isMine || isUserAtBottomRef.current) {
        scrollToBottom();
      } else {
        if (messages.length > 0) {
          setShowScrollButton(true);
          setUnreadNewMessages(prev => prev + 1);
        }
      }
    }
  }, [messages, user?.id, scrollToBottom, isLoading]);

  // Subscribe to presence only when ID is available AND socket is connected
  useEffect(() => {
    if (!socketInstance || !otherUserId) return;
    socketInstance.emit('subscribePresence', otherUserId);
  }, [socketInstance, otherUserId]);

  // --- Socket Logic ---

  useEffect(() => {
    let socket: Socket | null = null;

    const initSocket = async () => {
      try {
        const token = await getToken();
        socket = io(API_BASE, {
          path: "/api/socket",
          transports: ["websocket"],
          withCredentials: true,
          auth: { token }
        });

        // Save socket to State to trigger re-renders for dependency arrays
        setSocketInstance(socket);

        // Connection events
        socket.on("connect", () => {
          socket?.emit("joinRoom", roomId);
          socket?.emit("markAsRead", { roomId, userId: user?.id });
        });

        socket.on("connect_error", async (err: any) => {
          if (err.message.includes("Authentication error") || err.message.includes("JWT") || err.message.includes("token")) {
            try {
              const newToken = await getToken();
              if (newToken && socket) {
                socket.auth = { token: newToken };
                socket.connect();
              }
            } catch (e) { console.error("Refresh token failed", e); }
          }
        });

        // Presence updates
        socket.on('presence:update', ({ userId: uid, isOnline }) => {
          if (uid === otherUserId) {
            setIsOtherUserOnline(isOnline);
          }
        });

        // Typing updates - FIXED LOGIC to use ID comparison
        socket.on('typing:start', ({ chatId, userName, senderId }) => {
          if (String(chatId) !== String(roomId)) return;
          if (String(senderId) === String(user?.id)) return;

          const name = userName || "Someone";

          // Clear existing timeout if exists
          if (typingTimeoutsRef.current[senderId]) {
            clearTimeout(typingTimeoutsRef.current[senderId]);
          }

          setTypingUsers(prev => {
            const next = new Set(prev);
            next.add(name);
            return next;
          });

          // Auto-clear after 3 seconds
          typingTimeoutsRef.current[senderId] = setTimeout(() => {
            setTypingUsers(prev => {
              const next = new Set(prev);
              next.delete(name);
              return next;
            });
          }, 3000);
        });


        socket.on('typing:stop', ({ chatId, userName, senderId }) => {
          if (String(chatId) !== String(roomId)) return;
          if (String(senderId) === String(user?.id)) return;

          const name = userName || "Someone";
          if (typingTimeoutsRef.current[senderId]) {
            clearTimeout(typingTimeoutsRef.current[senderId]);
          }

          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
        });

        socket.on("message", (incomingMsg: ChatMessage) => {
          if (incomingMsg.roomId && String(incomingMsg.roomId) !== String(roomId)) return;

          // DEBUG: See exactly what creates the match failure
          console.log("📨 [SOCKET] Incoming:", {
            id: incomingMsg.id,
            tempId: incomingMsg.tempId,
            replyTo: incomingMsg.replyTo
          });

          setMessages(prev => {
            const matchIndex = prev.findIndex(m => {
              // Check 1: ID Match
              const idMatch = String(m.id) === String(incomingMsg.id);
              // Check 2: TempID Match (Loose comparison for safety)
              const tempMatch = incomingMsg.tempId && (String(m.id) == String(incomingMsg.tempId));

              return idMatch || tempMatch;
            });

            if (matchIndex > -1) {
              const existingMsg = prev[matchIndex];
              console.log("✅ [MERGE] Matched existing msg. Keeping local reply.");

              // CRITICAL FIX: The "||" operator protects the UI from server data loss
              const safeReply = existingMsg.replyTo || incomingMsg.replyTo;

              const newMessages = [...prev];
              newMessages[matchIndex] = {
                ...incomingMsg,
                status: 'sent',
                sender: existingMsg.sender || incomingMsg.sender,
                replyTo: safeReply
              };
              return newMessages;
            } else {
              console.warn("➕ [APPEND] No match found for tempId:", incomingMsg.tempId);
              return [...prev, incomingMsg];
            }
          });

          if (incomingMsg.userId !== user?.id) socket?.emit("markAsRead", { roomId, userId: user?.id });
        });

        socket.on("messageUpdated", (payload: { id: string | number, text: string, isEdited: boolean, roomId?: string }) => {
          if (!payload.roomId || payload.roomId === roomId) {
            setMessages(prev => prev.map(m => m.id === payload.id ? { ...m, text: payload.text, isEdited: payload.isEdited } : m));
          }
        });

        socket.on("messageDeleted", (payload: { id: string | number, roomId?: string }) => {
          // 1. Verify Room Match
          if (payload.roomId && String(payload.roomId) !== String(roomId)) return;

          // 2. Functional Update with strict string comparison
          setMessages(prev => prev.map(msg => {
            if (String(msg.id) === String(payload.id)) {
              return {
                ...msg,
                isDeleted: true,
                text: "[Content Removed by Moderator]",
                status: 'rejected'
              };
            }
            return msg;
          }));
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

        socket.on("error", (err: any) => {
          console.error("Socket error", err);
        });

      } catch (e) {
        console.error("Socket connection failed", e);
      }
    };

    if (user?.id) initSocket();

    return () => { if (socket) socket.disconnect(); };
  }, [roomId, user?.id, getToken, otherUserId, API_BASE]);

  const { messagesCache, loadMessages } = useChat();

  // FIX: Only run this effect when the Room ID changes. 
  // Removing 'messagesCache' from dependencies prevents the optimistic message 
  // from being overwritten by a stale cache update immediately after sending.
  useEffect(() => {
    if (!roomId) return;

    // 1. Instant load from cache if available (mount only)
    if (messagesCache[roomId]) {
      setMessages(messagesCache[roomId]);
      setIsLoading(false);
      prevMessagesLengthRef.current = messagesCache[roomId].length;
    }

    const initMessages = async () => {
      // If we already have data from cache, avoid re-fetching or flickering
      // You can decide to fetch in background if needed, but don't reset state here if not empty.
      if (messagesCache[roomId]) return;

      setIsLoading(true);
      try {
        const msgs = await loadMessages(roomId);
        setMessages(msgs);
        prevMessagesLengthRef.current = msgs.length;
      } catch (e) {
        console.error("Failed to load messages", e);
      } finally {
        setIsLoading(false);
      }
    };

    initMessages();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]); // <--- CRITICAL CHANGE: Dependencies are now locked to roomId only.

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
    if (!trimmed || !socketInstance) return;

    if (editingMessage) {
      socketInstance.emit("editMessage", { messageId: editingMessage.id, text: trimmed, roomId });
      setEditingMessage(null);
    } else {
      const optimisticId = Date.now();
      const optimisticMessage: ChatMessage & { content: string } = {
        id: optimisticId,
        text: trimmed,
        content: trimmed, // Fix: Ensure content matches text for optimistic UI
        roomId,
        userId: user?.id || "anon",
        senderId: user?.id || "anon",
        senderName: user?.fullName || "Me",
        ts: new Date().toISOString(),
        status: "sent", // Show as sent immediately
        sender: { // CRITICAL: Hydrate sender details immediately for the UI
          id: user?.id,
          name: user?.fullName || undefined,
          image: user?.imageUrl || undefined
        },
        replyTo: replyToMessage ? {
          id: replyToMessage.id,
          text: replyToMessage.text,
          // Priority: 1. Direct Sender Object (Most reliable) -> 2. Flat Name -> 3. Participant Lookup -> 4. "User"
          senderName:
            replyToMessage.sender?.name ||
            replyToMessage.senderName ||
            chatDetails?.participants?.find((p: any) => String(p.userId) === String(replyToMessage.userId))?.user?.name ||
            nameByUserId[replyToMessage.userId || ""] ||
            "User"
        } : undefined
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      // Include tempId so server can echo it back for correlation
      const payload: Partial<ChatMessage> & { roomId: string, userId: string, tempId: string | number } = {
        text: trimmed,
        roomId,
        userId: user?.id || "anon",
        replyTo: optimisticMessage.replyTo,
        status: "sent",
        tempId: optimisticId
      };
      socketInstance.emit("message", payload);
    }

    setInputValue("");
    setReplyToMessage(null);
    socketInstance.emit("typing", { isTyping: false, roomId, userName: user?.fullName });
  };

  const handleEdit = (msg: ChatMessage) => { setEditingMessage(msg); setInputValue(msg.text); setReplyToMessage(null); };
  const handleDelete = (messageId: string | number) => { socketInstance?.emit("deleteMessage", { messageId, roomId }); };
  const cancelAction = () => { setReplyToMessage(null); setEditingMessage(null); setInputValue(""); };
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };
  const handleReply = (msg: ChatMessage) => { setReplyToMessage(msg); setEditingMessage(null); };
  const handleReact = (messageId: string | number, emoji: string) => { socketInstance?.emit("addReaction", { messageId, emoji, userId: user?.id, roomId }); };

  const getDayString = (date: Date, isRTL: boolean) => {
    const today = new Date(); const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return isRTL ? "היום" : "Today";
    if (date.toDateString() === yesterday.toDateString()) return isRTL ? "אתמול" : "Yesterday";
    return date.toLocaleDateString(isRTL ? 'he-IL' : 'en-US');
  };

  if (!mounted) return null;

  return (
    <Paper elevation={isWidget ? 0 : 3} dir={isRTL ? "rtl" : "ltr"} sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", borderRadius: isWidget ? 0 : 2, overflow: "hidden", bgcolor: "background.paper" }}>
      {!isWidget && (
        <Box sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "primary.main",
          color: "primary.contrastText",
          display: "flex",
          alignItems: "center",
          gap: 1.5
        }}>
          {/* Back Button */}
          <IconButton
            onClick={() => router.back()}
            sx={{ color: "inherit", p: 0.5 }}
          >
            <ArrowBackIcon sx={{ transform: isRTL ? "scaleX(-1)" : "none" }} />
          </IconButton>

          {/* Avatar (Private Only usually, or Group Icon) */}
          {roomId !== "global" && (
            <Avatar
              src={otherUserAvatar || undefined}
              alt={effectiveChatName}
            >
              {effectiveChatName.charAt(0)}
            </Avatar>
          )}

          {/* Name & Status Column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <Typography variant="subtitle1" fontWeight="bold" noWrap sx={{ lineHeight: 1.2 }}>
              {effectiveChatName}
            </Typography>

            {/* Status Bar Container */}
            <Box sx={{ display: 'flex', alignItems: 'center', minHeight: '18px' }}>
              {/* STATE 1: TYPING */}
              {typingUsers.size > 0 ? (
                <Typography variant="caption" sx={{
                  color: 'secondary.light',
                  fontWeight: 'bold',
                  fontStyle: 'italic',
                  animation: 'pulse 1.5s infinite',
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  '@keyframes pulse': { '0%': { opacity: 0.6 }, '50%': { opacity: 1 }, '100%': { opacity: 0.6 } }
                }}>
                  <span>✎</span>
                  {isRTL ? "מקליד/ה..." : typingUsers.size === 1 ? `${Array.from(typingUsers)[0]} is typing...` : 'Typing...'}
                </Typography>
              ) : (
                /* STATE 2: PRESENCE */
                (isPrivate && otherUserId) ? (
                  isOtherUserOnline ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 8, height: 8, bgcolor: '#4caf50', borderRadius: '50%' }} />
                      <Typography variant="caption" sx={{ color: '#81c784', fontWeight: 500 }}>
                        {isRTL ? "מחובר/ת" : "Online"}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                      {isRTL ? "נראה לאחרונה..." : "Offline"}
                    </Typography>
                  )
                ) : null
              )}
            </Box>
          </Box>
        </Box>
      )}

      <Box sx={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Box
          ref={scrollContainerRef}
          onScroll={handleScroll}
          sx={{ flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50' }}
        >
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {messages.map((m, index) => {
                const isMine = m.userId === user?.id;
                const prevMsg = messages[index - 1]; const nextMsg = messages[index + 1];
                const currentDate = new Date(m.ts); const prevDate = prevMsg ? new Date(prevMsg.ts) : null;
                const showDateSeparator = !prevDate || currentDate.toDateString() !== prevDate.toDateString();
                const isPrevSameSender = prevMsg && prevMsg.userId === m.userId && !showDateSeparator;
                const isNextSameSender = nextMsg && nextMsg.userId === m.userId;

                // Fix Avatar Lookup: Priority = Message Sender Hydration > Participant Info > avatarByUserId Fallback
                const participant = chatDetails?.participants?.find((p: any) => String(p.userId) === String(m.senderId || m.userId));
                const u = participant?.user;
                const avatarUrl = m.sender?.image || u?.image || u?.photoUrl || u?.avatar || u?.profilePicture || u?.imageUrl || (m.userId ? avatarByUserId[m.userId] : undefined);

                return (
                  <div key={m.id || m.tempId}>
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
                      avatarUrl={avatarUrl}
                      // Fix Name Lookup: Use Sender Hydration > Participant > NameMap > Fallback
                      displayName={m.sender?.name || u?.name || (m.userId && nameByUserId[m.userId]) || (isMine ? (user?.fullName || (isRTL ? "אני" : "Me")) : "") || m.senderName || "Unknown"}
                      timeStr={currentDate.toLocaleTimeString(isRTL ? 'he-IL' : 'en-US', { hour: "2-digit", minute: "2-digit" })}
                      showAvatar={!isNextSameSender}
                      showName={!isPrevSameSender && !isMine && !isPrivate}
                      isFirstInGroup={!isPrevSameSender}
                      isLastInGroup={!isNextSameSender}
                      nameByUserId={nameByUserId} // Pass map for robust name lookup
                      currentUserId={user?.id}
                    />
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
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
            onInput={() => socketInstance?.emit("typing", { isTyping: true, roomId, userName: user?.fullName })}
            onBlur={() => socketInstance?.emit("typing", { isTyping: false, roomId, userName: user?.fullName })}
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