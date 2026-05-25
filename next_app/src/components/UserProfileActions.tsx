"use client";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import CheckIcon from "@mui/icons-material/Check";
import Box from "@mui/material/Box";
import ChatIcon from "@mui/icons-material/Chat";

import { useUserActions } from "@/hooks/useUserActions";

export default function UserProfileActions({
    targetUserId,
    targetUserName = "User",
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
        addFriend,
        removeFriend,
        handleMessage,
        isLoaded
    } = useUserActions(targetUserId, targetUserName, targetUserImage);

    if (status === 'SELF' || !isLoaded) return null;
    if (status === 'LOADING') return <CircularProgress size={20} />;

    return (
        <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
            {/* Friend Buttons */}
            {status === 'FRIEND' ? (
                <Button
                    variant="outlined"
                    color="error"
                    startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PersonRemoveIcon />}
                    onClick={removeFriend}
                    disabled={loading}
                >
                    Remove Friend
                </Button>
            ) : status === 'REQUESTED' ? (
                <Button
                    variant="text"
                    color="success"
                    startIcon={<CheckIcon />}
                    disabled
                >
                    Request Sent
                </Button>
            ) : (
                <Button
                    variant="contained"
                    color="primary"
                    startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
                    onClick={addFriend}
                    disabled={loading}
                >
                    Add Friend
                </Button>
            )}

            <Button
                variant="outlined"
                color="primary"
                startIcon={actionLoading ? <CircularProgress size={16} color="inherit" /> : <ChatIcon />}
                onClick={handleMessage}
                disabled={actionLoading}
            >
                Message
            </Button>
        </Box>
    );
}