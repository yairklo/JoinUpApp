export const getPrivateChatRoomId = (currentUserId: string, otherUserId: string): string => {
    // Sort IDs to ensure the room ID is always the same for these two users
    const sortedIds = [currentUserId, otherUserId].sort();
    return `private_${sortedIds[0]}_${sortedIds[1]}`;
};
