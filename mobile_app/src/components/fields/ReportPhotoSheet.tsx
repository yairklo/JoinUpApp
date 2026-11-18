import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/clerk-expo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { fieldPhotosApi, type FieldPhotoReportReason } from '@/services/api/fieldPhotos';
import { appAlert } from '@/i18n/appAlert';

const REASONS: { key: FieldPhotoReportReason; label: string; fallback: string }[] = [
    { key: 'PEOPLE', label: 'fieldPhotos.reportReasonPeople', fallback: 'אנשים שאפשר לזהות (במיוחד ילדים)' },
    { key: 'INAPPROPRIATE', label: 'fieldPhotos.reportReasonInappropriate', fallback: 'תוכן לא הולם' },
    { key: 'WRONG_PLACE', label: 'fieldPhotos.reportReasonWrongPlace', fallback: 'התמונה לא שייכת למגרש הזה' },
    { key: 'OTHER', label: 'fieldPhotos.reportReasonOther', fallback: 'סיבה אחרת' },
];

interface ReportPhotoSheetProps {
    visible: boolean;
    onClose: () => void;
    fieldId: string;
    /** The photo being reported; the sheet is only meaningful while this is set. */
    photoId: string | null;
}

/**
 * "Report photo": tap the reason and it is sent to the admins straight away (one tap, no form).
 * The photo stays up until an admin has looked at it, so the confirmation says what happens next.
 */
export default function ReportPhotoSheet({ visible, onClose, fieldId, photoId }: ReportPhotoSheetProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { getToken } = useAuth();
    const [sending, setSending] = useState<FieldPhotoReportReason | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (visible) {
            setSending(null);
            setFailed(false);
        }
    }, [visible, photoId]);

    const send = async (reason: FieldPhotoReportReason) => {
        if (!photoId || sending) return;
        setSending(reason);
        setFailed(false);
        try {
            const token = await getToken();
            if (!token) throw new Error('no token');
            await fieldPhotosApi.report(fieldId, photoId, reason, token);
            onClose();
            appAlert(t('fieldPhotos.reportThanksTitle', 'תודה'), t('fieldPhotos.reportThanks', 'הדיווח התקבל ויעבור בדיקה של צוות האתר.'));
        } catch {
            setFailed(true);
        } finally {
            setSending(null);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={sending ? undefined : onClose}
        >
            <View className="flex-1 justify-end bg-black/50">
                <View
                    className="bg-white dark:bg-cyber-card rounded-t-3xl px-5 pt-5"
                    style={{ paddingBottom: Math.max(insets.bottom, 16) + 4 }}
                    accessibilityViewIsModal
                >
                    <Text className="text-xl font-bold text-gray-800 dark:text-cyber-text mb-1" accessibilityRole="header">
                        {t('fieldPhotos.reportTitle', 'דיווח על תמונה')}
                    </Text>
                    <Text className="text-gray-500 dark:text-cyber-muted text-sm mb-3">
                        {t('fieldPhotos.reportQuestion', 'מה הבעיה בתמונה?')}
                    </Text>

                    {REASONS.map(({ key, label, fallback }) => (
                        <TouchableOpacity
                            key={key}
                            onPress={() => void send(key)}
                            disabled={!!sending}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !!sending }}
                            className="flex-row items-center py-3.5 border-b border-gray-100 dark:border-cyber-border"
                        >
                            <Text className="flex-1 text-gray-800 dark:text-cyber-text text-base">{t(label, fallback)}</Text>
                            {sending === key ? (
                                <ActivityIndicator size="small" color="#047857" />
                            ) : (
                                <FontAwesome name="flag-o" size={15} color="#9ca3af" />
                            )}
                        </TouchableOpacity>
                    ))}

                    {failed ? (
                        <Text className="text-red-600 text-sm mt-3" accessibilityLiveRegion="polite" accessibilityRole="alert">
                            {t('fieldPhotos.reportFailed', 'שליחת הדיווח נכשלה, נסו שוב')}
                        </Text>
                    ) : null}

                    <View className="flex-row justify-end mt-2">
                        <TouchableOpacity
                            onPress={onClose}
                            disabled={!!sending}
                            accessibilityRole="button"
                            className="px-4 py-3"
                        >
                            <Text className="text-gray-600 dark:text-cyber-muted font-medium">
                                {t('fieldPhotos.reportCancel', 'ביטול')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
