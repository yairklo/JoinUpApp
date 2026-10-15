"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import CheckIcon from "@mui/icons-material/Check";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ChatIcon from "@mui/icons-material/Chat";
import BlockIcon from "@mui/icons-material/Block";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import { usersApi } from "@/services/api/users";
import { useUserActions } from "@/hooks/useUserActions";
import MuteNotificationsButton from "@/components/notifications/MuteNotificationsButton";

export default function UserProfileActions({
    targetUserId,
    targetUserName = "משתמש",
    targetUserImage
}: {
    targetUserId: string;
    targetUserName?: string;
    targetUserImage?: string | null;
}) {
    const {
        status,
        loading,
        actionLoading,
        error,
        addFriend,
        removeFriend,
        acceptRequest,
        declineRequest,
        handleMessage,
        isLoaded
    } = useUserActions(targetUserId, targetUserName, targetUserImage);

    const { getToken } = useAuth();
    const [isBlocked, setIsBlocked] = useState(false);
    const [blockLoaded, setBlockLoaded] = useState(false);
    // Blocking removes any friendship / pending request server-side; the hook's status is stale then.
    const [clearedByBlock, setClearedByBlock] = useState(false);
    const [blockBusy, setBlockBusy] = useState(false);
    const [blockError, setBlockError] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const isSelf = status === 'SELF';

    useEffect(() => {
        if (isSelf || !isLoaded) return;
        let active = true;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const list = await usersApi.getBlockedUsers(token);
                if (active) setIsBlocked(list.some((b) => b.id === targetUserId));
            } catch {
                // non-fatal: the button just defaults to "block"
            } finally {
                if (active) setBlockLoaded(true);
            }
        })();
        return () => { active = false; };
    }, [isSelf, isLoaded, targetUserId, getToken]);

    const toggleBlock = async () => {
        setBlockBusy(true);
        setBlockError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('no token');
            if (isBlocked) {
                await usersApi.unblockUser(targetUserId, token);
                setIsBlocked(false);
            } else {
                await usersApi.blockUser(targetUserId, token);
                setIsBlocked(true);
                setClearedByBlock(true);
            }
            setConfirmOpen(false);
        } catch (e) {
            console.error('Failed to toggle block:', e);
            setBlockError('הפעולה נכשלה. נסו שוב.');
        } finally {
            setBlockBusy(false);
        }
    };

    if (status === 'SELF' || !isLoaded) return null;
    if (status === 'LOADING' || !blockLoaded) return <CircularProgress size={20} />;

    const shownStatus = clearedByBlock ? 'NONE' : status;

    return (
        <Box display="flex" flexDirection="column" alignItems="center" gap={1}>
            <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
                {/* Friend Buttons */}
                {isBlocked ? null : shownStatus === 'FRIEND' ? (
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PersonRemoveIcon />}
                        onClick={removeFriend}
                        disabled={loading}
                    >
                        הסר חבר
                    </Button>
                ) : shownStatus === 'REQUESTED' ? (
                    <Button
                        variant="text"
                        color="success"
                        startIcon={<CheckIcon />}
                        disabled
                    >
                        הבקשה נשלחה
                    </Button>
                ) : shownStatus === 'INCOMING' ? (
                    <>
                        <Button
                            variant="contained"
                            color="success"
                            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
                            onClick={acceptRequest}
                            disabled={loading}
                        >
                            אשר בקשת חברות
                        </Button>
                        <Button variant="outlined" color="error" onClick={declineRequest} disabled={loading}>
                            דחה
                        </Button>
                    </>
                ) : (
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
                        onClick={() => { setClearedByBlock(false); addFriend(); }}
                        disabled={loading}
                    >
                        הוסף חבר
                    </Button>
                )}

                {!isBlocked && (
                    <Button
                        variant="outlined"
                        color="primary"
                        startIcon={actionLoading ? <CircularProgress size={16} color="inherit" /> : <ChatIcon />}
                        onClick={handleMessage}
                        disabled={actionLoading}
                    >
                        הודעה
                    </Button>
                )}

                {shownStatus === 'FRIEND' && !isBlocked && (
                    <MuteNotificationsButton targetType="USER" targetId={targetUserId} muteLabel="השתק התראות" />
                )}
            </Box>
            <Button
                size="small"
                color={isBlocked ? "inherit" : "error"}
                startIcon={<BlockIcon fontSize="small" />}
                onClick={() => { setBlockError(null); if (isBlocked) toggleBlock(); else setConfirmOpen(true); }}
                disabled={blockBusy}
            >
                {isBlocked ? "בטל חסימה" : "חסום משתמש"}
            </Button>
            {(error || (blockError && !confirmOpen)) && (
                <Typography variant="caption" color="error" role="alert">
                    {error || blockError}
                </Typography>
            )}

            <Dialog open={confirmOpen} onClose={() => !blockBusy && setConfirmOpen(false)} dir="rtl">
                <DialogTitle>לחסום את {targetUserName}?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        לא תראו יותר הודעות ותגובות מהמשתמש הזה, והוא לא יוכל לשלוח לכם הודעות או בקשות חברות. אפשר לבטל את החסימה בכל עת.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    {blockError && (
                        <Typography variant="caption" color="error" role="alert" sx={{ flex: 1, px: 1 }}>
                            {blockError}
                        </Typography>
                    )}
                    <Button onClick={() => setConfirmOpen(false)} disabled={blockBusy}>ביטול</Button>
                    <Button color="error" onClick={toggleBlock} disabled={blockBusy}>חסום</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
