"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Box, Typography, CircularProgress } from "@mui/material";
import ChatList from "@/components/ChatList";

export default function ChatsIndexPage() {
    const { user, isLoaded, isSignedIn } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.push("/sign-in");
        }
    }, [isLoaded, isSignedIn, router]);

    if (!isLoaded) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!user) return null;

    return (
        <Box sx={{ height: "calc(100vh - 70px)", p: 0, bgcolor: "background.paper" }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider", bgcolor: "primary.main", color: "primary.contrastText" }}>
                <Typography variant="h6" fontWeight="bold">My Chats</Typography>
            </Box>

            <ChatList
                userId={user.id}
                onChatSelect={() => { }} // This is now valid because we are in a Client Component
                isWidget={true}
            />
        </Box>
    );
}
