import Chat from "@/components/Chat";
import { Box } from "@mui/material";

interface PageProps {
    params: Promise<{
        chatId: string;
    }>;
}

export default async function ChatPage({ params }: PageProps) {
    const { chatId } = await params;

    return (
        <Box sx={{ height: "calc(100vh - 70px)", p: 0 }}>
            <Chat roomId={chatId} />
        </Box>
    );
}