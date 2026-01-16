import { currentUser } from "@clerk/nextjs/server";
import ChatList from "@/components/ChatList";
import { Box, Typography } from "@mui/material";

export default async function ChatsIndexPage() {
    const user = await currentUser();

    if (!user) return <Typography>Please log in</Typography>;

    return (
        <Box sx={{ height: "calc(100vh - 70px)", p: 2, bgcolor: "background.paper" }}>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>הצ'אטים שלי</Typography>
            {/* Reuse the component in "content mode" */}
            {/* We pass an empty function for onChatSelect because inside ChatList, 
            navigation logic is already handled internally via router.push or openChat */}
            <ChatList userId={user.id} onChatSelect={() => { }} isWidget={true} />
        </Box>
    );
}
