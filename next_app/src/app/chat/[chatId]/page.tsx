import Chat from "@/components/Chat";
import { Box, Container, Paper } from "@mui/material";

interface PageProps {
    params: Promise<{
        chatId: string;
    }>;
}

export default async function ChatPage({ params }: PageProps) {
    const { chatId } = await params;

    return (
        <Box
            sx={{
                // Lock container to viewport to prevent body scroll (overscroll)
                position: "fixed",
                top: "70px", // Navbar height
                bottom: 0,
                left: 0,
                right: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: { xs: "background.paper", md: "grey.100" }, // Grey bg only on desktop
                p: { xs: 0, md: 3 },
                overflow: "hidden",
                zIndex: 0 // Ensure it sits below overlay elements but locks scroll
            }}
        >
            {/* Wrapper for Desktop View */}
            <Box
                sx={{
                    width: { xs: "100%", md: "450px", lg: "500px" }, // Small window on desktop
                    height: { xs: "100%", md: "80vh" }, // Not full height on desktop
                    maxHeight: "800px",
                    boxShadow: { xs: 0, md: 4 }, // Shadow only on desktop
                    borderRadius: { xs: 0, md: 2 },
                    overflow: "hidden",
                    bgcolor: "background.paper"
                }}
            >
                <Chat roomId={chatId} />
            </Box>
        </Box>
    );
}