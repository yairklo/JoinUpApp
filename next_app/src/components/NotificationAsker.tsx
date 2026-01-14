"use client";

import React, { useEffect } from "react";
import useNotification from "@/hooks/useNotification";
import Button from "react-bootstrap/Button";
import Toast from "react-bootstrap/Toast";
import ToastContainer from "react-bootstrap/ToastContainer";
import { useState } from "react";

export default function NotificationAsker() {
    const { fcmToken, requestPermission, notification } = useNotification();
    const [showToast, setShowToast] = useState(false);

    useEffect(() => {
        if (notification?.title) {
            setShowToast(true);
        }
    }, [notification]);

    if (fcmToken) {
        // Already enabled
        return (
            <>
                <ToastContainer position="top-end" className="p-3" style={{ zIndex: 9999 }}>
                    <Toast onClose={() => setShowToast(false)} show={showToast} delay={5000} autohide>
                        <Toast.Header>
                            <strong className="me-auto">{notification.title}</strong>
                            <small>Just now</small>
                        </Toast.Header>
                        <Toast.Body>{notification.body}</Toast.Body>
                    </Toast>
                </ToastContainer>
            </>
        );
    }

    // If not enabled, show a discreet button (or explicit as requested)
    // User asked for "Enable Notifications" button in main layout.
    // I'll make it a floating button or just a simple button in footer or top.
    // Let's put it in a fixed position bottom-right for visibility.
    return (
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999 }}>
            <Button
                variant="primary"
                onClick={() => {
                    requestPermission();
                }}
                className="shadow-sm rounded-pill px-3"
            >
                🔔 Enable Notifications
            </Button>
        </div>
    );
}
