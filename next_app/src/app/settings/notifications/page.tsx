'use client';
import { useState, useEffect } from 'react';
import { Form, Button, Card, Alert, Spinner } from 'react-bootstrap';
import { useAuth } from '@clerk/nextjs';

interface NotificationSettings {
    pushEnabled: boolean;
    friendRequestsEnabled: boolean;
    messagesEnabled: boolean;
    gameRemindersEnabled: boolean;
}

export default function NotificationSettingsPage() {
    const { userId } = useAuth();
    const [settings, setSettings] = useState<NotificationSettings>({
        pushEnabled: true,
        friendRequestsEnabled: true,
        messagesEnabled: true,
        gameRemindersEnabled: true
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (userId) {
            fetchSettings();
        }
    }, [userId]);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/notifications/settings', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('__clerk_client_jwt')}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data) {
                    setSettings({
                        pushEnabled: data.pushEnabled ?? true,
                        friendRequestsEnabled: data.friendRequestsEnabled ?? true,
                        messagesEnabled: data.messagesEnabled ?? true,
                        gameRemindersEnabled: data.gameRemindersEnabled ?? true
                    });
                }
            }
        } catch (error) {
            console.error('[SETTINGS] Failed to fetch:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/notifications/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('__clerk_client_jwt')}`
                },
                body: JSON.stringify(settings)
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'ההגדרות נשמרו בהצלחה!' });
                setTimeout(() => setMessage(null), 3000);
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            console.error('[SETTINGS] Failed to save:', error);
            setMessage({ type: 'error', text: 'שגיאה בשמירת ההגדרות. נסה שוב.' });
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = (key: keyof NotificationSettings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (!userId) {
        return (
            <div className="container mt-5">
                <Alert variant="warning">
                    עליך להתחבר כדי לנהל הגדרות התראות
                </Alert>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="container mt-5 text-center">
                <Spinner animation="border" />
            </div>
        );
    }

    return (
        <div className="container mt-5" style={{ maxWidth: '600px' }}>
            <h2 className="mb-4">הגדרות התראות</h2>

            {message && (
                <Alert variant={message.type === 'success' ? 'success' : 'danger'} dismissible onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <Card>
                <Card.Header className="bg-primary text-white">
                    <h5 className="mb-0">העדפות התראות</h5>
                </Card.Header>
                <Card.Body>
                    <Form>
                        <div className="mb-4">
                            <Form.Check
                                type="switch"
                                id="pushEnabled"
                                label={
                                    <div>
                                        <strong>הפעל התראות Push</strong>
                                        <div className="text-muted small">קבל התראות בזמן אמת במכשיר שלך</div>
                                    </div>
                                }
                                checked={settings.pushEnabled}
                                onChange={() => handleToggle('pushEnabled')}
                                className="mb-3"
                            />
                        </div>

                        <hr />

                        <div className="mb-3">
                            <h6 className="text-muted mb-3">סוגי התראות</h6>

                            <Form.Check
                                type="switch"
                                id="friendRequestsEnabled"
                                label={
                                    <div>
                                        <strong>בקשות חברות</strong>
                                        <div className="text-muted small">קבל התראה כשמישהו שולח לך בקשת חברות</div>
                                    </div>
                                }
                                checked={settings.friendRequestsEnabled}
                                onChange={() => handleToggle('friendRequestsEnabled')}
                                disabled={!settings.pushEnabled}
                                className="mb-3"
                            />

                            <Form.Check
                                type="switch"
                                id="messagesEnabled"
                                label={
                                    <div>
                                        <strong>הודעות חדשות</strong>
                                        <div className="text-muted small">קבל התראה כשמגיעה הודעה חדשה בצ'אט</div>
                                    </div>
                                }
                                checked={settings.messagesEnabled}
                                onChange={() => handleToggle('messagesEnabled')}
                                disabled={!settings.pushEnabled}
                                className="mb-3"
                            />

                            <Form.Check
                                type="switch"
                                id="gameRemindersEnabled"
                                label={
                                    <div>
                                        <strong>תזכורות משחקים</strong>
                                        <div className="text-muted small">קבל תזכורת שעה לפני משחק שנרשמת אליו</div>
                                    </div>
                                }
                                checked={settings.gameRemindersEnabled}
                                onChange={() => handleToggle('gameRemindersEnabled')}
                                disabled={!settings.pushEnabled}
                                className="mb-3"
                            />
                        </div>

                        <div className="d-grid gap-2 mt-4">
                            <Button
                                variant="primary"
                                size="lg"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <>
                                        <Spinner animation="border" size="sm" className="me-2" />
                                        שומר...
                                    </>
                                ) : (
                                    'שמור הגדרות'
                                )}
                            </Button>
                        </div>
                    </Form>
                </Card.Body>
            </Card>

            <Card className="mt-4">
                <Card.Body>
                    <h6 className="mb-3">💡 טיפים</h6>
                    <ul className="text-muted small mb-0">
                        <li>כדי לקבל התראות, עליך לאשר הרשאות בדפדפן</li>
                        <li>ההתראות יישלחו לכל המכשירים המחוברים שלך</li>
                        <li>ניתן לכבות התראות ספציפיות בכל עת</li>
                    </ul>
                </Card.Body>
            </Card>
        </div>
    );
}
