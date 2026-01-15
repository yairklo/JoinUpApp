import Chat from "@/components/Chat";
import { Box } from "@mui/material";

interface PageProps {
    params: {
        chatId: string;
    };
}

export default function ChatPage({ params }: PageProps) {
    return (
        <Box sx={{ height: "calc(100vh - 70px)", p: 2 }}>
            <Chat roomId={params.chatId} />
        </Box>
    );
}