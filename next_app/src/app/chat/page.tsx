"use client";

import Chat from "@/components/Chat";

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <Chat roomId="global" />
    </div>
  );
}

