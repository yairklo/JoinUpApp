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
                // Full viewport height minus header
                height: "calc(100vh - 70px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: { xs: "background.paper", md: "grey.100" }, // Grey bg only on desktop
                p: { xs: 0, md: 3 }
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