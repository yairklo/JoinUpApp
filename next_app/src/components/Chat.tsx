"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
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
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import EditIcon from "@mui/icons-material/Edit";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MessageBubble from "./MessageBubble";
import { ChatMessage } from "./types";
import { useChatLogic } from "@/hooks/useChatLogic";

type ChatProps = {
  roomId?: string;
  language?: "en" | "he";
  isWidget?: boolean;
  chatName?: string;
};

export default function Chat({ roomId = "global", language = "he", isWidget = false, chatName }: ChatProps) {
  const isRTL = language === "he";
  const { user } = useUser();
  const theme = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Use the custom hook for all logic
  const { state, actions, refs } = useChatLogic({ roomId, chatName });

  // Scroll To Bottom Action
  const scrollToBottom = () => {
    if (refs.messagesEndRef.current) {
      refs.messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      actions.setUnreadNewMessages(0);
      actions.setShowScrollButton(false);
      refs.isUserAtBottomRef.current = true;
    }
  };

  // Smart Scroll Handler (needed for onScroll event)
  const handleScroll = () => {
    if (!refs.scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = refs.scrollContainerRef.current;

    // Check if we are close to bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    refs.isUserAtBottomRef.current = isAtBottom;

    if (isAtBottom) {
      actions.setShowScrollButton(false);
      actions.setUnreadNewMessages(0);
    } else {
      actions.setShowScrollButton(true);
    }
  };

  // Auto-scroll effect (UI side as it depends on layout ref)
  useEffect(() => {
    if (!state.isLoading && state.messages.length > 0 && refs.isUserAtBottomRef.current) {
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.messages.length, state.isLoading]);


  // Helper for UI date
  const getDayString = (date: Date, isRTL: boolean) => {
    const today = new Date(); const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return isRTL ? "היום" : "Today";
    if (date.toDateString() === yesterday.toDateString()) return isRTL ? "אתמול" : "Yesterday";
    return date.toLocaleDateString(isRTL ? 'he-IL' : 'en-US');
  };

  // Key Down Handler
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); actions.handleSendMessage(); }
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

          {/* Avatar */}
          {roomId !== "global" && (
            <Avatar
              src={state.otherUserAvatar || undefined}
              alt={state.effectiveChatName}
            >
              {state.effectiveChatName.charAt(0)}
            </Avatar>
          )}

          {/* Name & Status Column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <Typography variant="subtitle1" fontWeight="bold" noWrap sx={{ lineHeight: 1.2 }}>
              {state.effectiveChatName}
            </Typography>

            {/* Status Bar */}
            <Box sx={{ display: 'flex', alignItems: 'center', minHeight: '18px' }}>
              {state.typingUsers.size > 0 ? (
                <Typography variant="caption" sx={{
                  color: 'secondary.light', fontWeight: 'bold', fontStyle: 'italic',
                  animation: 'pulse 1.5s infinite', display: 'flex', alignItems: 'center', gap: 0.5,
                  '@keyframes pulse': { '0%': { opacity: 0.6 }, '50%': { opacity: 1 }, '100%': { opacity: 0.6 } }
                }}>
                  <span>✎</span>
                  {isRTL ? "מקליד/ה..." : state.typingUsers.size === 1 ? `${Array.from(state.typingUsers)[0]} is typing...` : 'Typing...'}
                </Typography>
              ) : (
                (state.isPrivate && state.otherUserId) ? (
                  state.isOtherUserOnline ? (
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
          ref={refs.scrollContainerRef}
          onScroll={handleScroll}
          sx={{ flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50' }}
        >
          {state.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {state.messages.map((m, index) => {
                const isMine = m.userId === user?.id;
                const prevMsg = state.messages[index - 1]; const nextMsg = state.messages[index + 1];
                const currentDate = new Date(m.ts); const prevDate = prevMsg ? new Date(prevMsg.ts) : null;
                const showDateSeparator = !prevDate || currentDate.toDateString() !== prevDate.toDateString();
                const isPrevSameSender = prevMsg && prevMsg.userId === m.userId && !showDateSeparator;
                const isNextSameSender = nextMsg && nextMsg.userId === m.userId;

                const participant = state.chatDetails?.participants?.find((p: any) => String(p.userId) === String(m.senderId || m.userId));
                const u = participant?.user;
                const avatarUrl = m.sender?.image || u?.image || u?.photoUrl || u?.avatar || u?.imageUrl || (m.userId ? state.avatarByUserId[m.userId] : undefined);

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
                      onReply={(msg) => actions.setReplyToMessage(msg)}
                      onReact={actions.handleReact}
                      onEdit={(msg) => { actions.setEditingMessage(msg); actions.setInputValue(msg.text); }}
                      onDelete={actions.handleDelete}
                      avatarUrl={avatarUrl}
                      displayName={m.sender?.name || u?.name || (m.userId && state.nameByUserId[m.userId]) || (isMine ? (user?.fullName || (isRTL ? "אני" : "Me")) : "") || m.senderName || "Unknown"}
                      timeStr={currentDate.toLocaleTimeString(isRTL ? 'he-IL' : 'en-US', { hour: "2-digit", minute: "2-digit" })}
                      showAvatar={!isNextSameSender}
                      showName={!isPrevSameSender && !isMine && !state.isPrivate}
                      isFirstInGroup={!isPrevSameSender}
                      isLastInGroup={!isNextSameSender}
                      nameByUserId={state.nameByUserId}
                      currentUserId={user?.id}
                    />
                  </div>
                );
              })}
              <div ref={refs.messagesEndRef} />
            </>
          )}
        </Box>

        <Zoom in={state.showScrollButton}>
          <Box onClick={scrollToBottom} sx={{ position: "absolute", bottom: 16, [isRTL ? "left" : "right"]: 16, zIndex: 20, cursor: "pointer" }}>
            <Badge badgeContent={state.unreadNewMessages} color="error">
              <Fab color="primary" size="small" aria-label="scroll down"><KeyboardArrowDownIcon /></Fab>
            </Badge>
          </Box>
        </Zoom>
      </Box>

      {(state.replyToMessage || state.editingMessage) && (
        <Box sx={{ p: 1, px: 2, bgcolor: "action.hover", borderTop: 1, borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", flexDirection: "column", borderLeft: isRTL ? 0 : "3px solid", borderRight: isRTL ? "3px solid" : 0, borderColor: "primary.main", pl: isRTL ? 0 : 1, pr: isRTL ? 1 : 0 }}>
            {state.editingMessage ? (
              <>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <EditIcon fontSize="small" color="primary" sx={{ fontSize: 16 }} />
                  <Typography variant="caption" color="primary" fontWeight="bold">{isRTL ? "עורך הודעה" : "Editing Message"}</Typography>
                </Box>
                <Typography variant="caption" noWrap sx={{ maxWidth: 300 }}>{state.editingMessage.text}</Typography>
              </>
            ) : (
              <>
                <Typography variant="caption" color="primary" fontWeight="bold">{isRTL ? "מגיב ל:" : "Replying to:"} {state.replyToMessage?.senderName}</Typography>
                <Typography variant="caption" noWrap sx={{ maxWidth: 300 }}>{state.replyToMessage?.text}</Typography>
              </>
            )}
          </Box>
          <IconButton size="small" onClick={() => { actions.setReplyToMessage(null); actions.setEditingMessage(null); actions.setInputValue(""); }}><CloseIcon fontSize="small" /></IconButton>
        </Box>
      )}

      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <TextField
            fullWidth multiline maxRows={3} variant="outlined" size="small"
            placeholder={isRTL ? "כתוב הודעה..." : "Type a message..."}
            value={state.inputValue}
            onChange={(e) => actions.setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={actions.handleTyping}
            onBlur={actions.handleStopTyping}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          <IconButton color="primary" onClick={actions.handleSendMessage} disabled={!state.inputValue.trim()} sx={{ mb: 0.5, transform: isRTL ? "scaleX(-1)" : "none" }}>
            {state.editingMessage ? <CheckIcon /> : <SendIcon />}
          </IconButton>
        </Stack>
      </Box>
    </Paper>
  );
}