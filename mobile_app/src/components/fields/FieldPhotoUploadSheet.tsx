import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
    MAX_FIELD_PHOTOS,
    MAX_PENDING_PHOTOS_PER_USER_PER_FIELD,
    type FieldPhotoErrorKind,
} from '@joinup/shared/upload';
import { useFieldPhotoUpload, isRetryable, type UploadItem } from '@/hooks/useFieldPhotoUpload';
import { pickFieldPhotos } from '@/utils/pickFieldPhotos';
import { resizeImage } from '@/utils/resizeImage';

type T = ReturnType<typeof useTranslation>['t'];

function errorText(t: T, kind: FieldPhotoErrorKind): string {
    switch (kind) {
        case 'TYPE':
            return t('fieldPhotos.errorType', 'סוג הקובץ לא נתמך. אפשר להעלות JPEG, PNG, WEBP או GIF');
        case 'SIZE':
            return t('fieldPhotos.errorSize', 'התמונה גדולה מדי (עד 5MB)');
        case 'FIELD_FULL':
            return t('fieldPhotos.errorFieldFull', { defaultValue: 'הגלריה של המגרש מלאה ({{max}} תמונות)', max: MAX_FIELD_PHOTOS });
        case 'PENDING_PER_FIELD':
            return t('fieldPhotos.errorPendingField', {
                defaultValue: 'יש לך כבר {{max}} תמונות שממתינות לאישור במגרש הזה',
                max: MAX_PENDING_PHOTOS_PER_USER_PER_FIELD,
            });
        case 'PENDING_TOTAL':
            return t('fieldPhotos.errorPendingTotal', 'יש לך הרבה תמונות שממתינות לאישור. אפשר להוסיף עוד אחרי שהן ייבדקו');
        case 'DAILY':
            return t('fieldPhotos.errorDaily', 'הגעת למספר ההעלאות היומי. אפשר לנסות שוב מחר');
        case 'RATE':
            return t('errors.tooManyRequests', 'יותר מדי בקשות, נסו שוב בעוד רגע');
        case 'BLOCKED':
            return t('fieldPhotos.errorBlocked', 'אין לך אפשרות להוסיף תמונות למגרשים');
        case 'AUTH':
            return t('fieldPhotos.errorAuth', 'נדרש להתחבר מחדש');
        case 'NETWORK':
            return t('fieldPhotos.errorNetwork', 'ההעלאה נכשלה. בדקו את החיבור ונסו שוב');
        default:
            return t('fieldPhotos.errorUnknown', 'ההעלאה נכשלה, נסו שוב');
    }
}

/** "You can add 1 more photo" / "You can add 3 more photos". */
export function remainingText(t: T, remaining: number): string {
    if (remaining <= 0) return t('fieldPhotos.remainingNone', 'אי אפשר להוסיף עוד תמונות כרגע');
    if (remaining === 1) return t('fieldPhotos.remainingOne', 'אפשר להוסיף עוד תמונה אחת');
    return t('fieldPhotos.remainingMany', { defaultValue: 'אפשר להוסיף עוד {{count}} תמונות', count: remaining });
}

function statusText(t: T, item: UploadItem): string {
    switch (item.status) {
        case 'queued':
            return t('fieldPhotos.statusQueued', 'ממתינה בתור');
        case 'resizing':
            return t('fieldPhotos.statusPreparing', 'מכינה את התמונה');
        case 'uploading':
            return t('fieldPhotos.statusUploading', { defaultValue: 'מעלה {{percent}}%', percent: item.progress });
        case 'done':
            return t('fieldPhotos.statusDone', 'הועלתה');
        default:
            return item.errorKind ? errorText(t, item.errorKind) : t('fieldPhotos.errorUnknown', 'ההעלאה נכשלה, נסו שוב');
    }
}

function UploadRow({ item, onRetry, onDismiss }: { item: UploadItem; onRetry: () => void; onDismiss: () => void }) {
    const { t } = useTranslation();
    const working = item.status === 'queued' || item.status === 'resizing' || item.status === 'uploading';
    const failed = item.status === 'error';
    return (
        <View
            className="flex-row items-center py-2"
            accessible
            accessibilityLabel={`${item.name}. ${statusText(t, item)}`}
        >
            <Image
                source={{ uri: item.previewUri }}
                style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: '#e5e7eb' }}
                contentFit="cover"
                accessibilityIgnoresInvertColors
            />
            <View className="flex-1 mx-3">
                <Text numberOfLines={1} className="text-gray-800 dark:text-cyber-text text-sm">{item.name}</Text>
                {working ? (
                    <View
                        className="h-1.5 rounded-full bg-gray-200 dark:bg-cyber-border mt-1.5 overflow-hidden"
                        accessibilityRole="progressbar"
                        accessibilityValue={{ min: 0, max: 100, now: item.progress }}
                    >
                        <View
                            className="h-full rounded-full bg-brand"
                            // Before any bytes are sent there is no real figure, so show a sliver rather than an empty track.
                            style={{ width: `${item.status === 'uploading' ? Math.max(4, item.progress) : 4}%` }}
                        />
                    </View>
                ) : null}
                <Text className={`text-xs mt-1 ${failed ? 'text-red-600' : 'text-gray-500 dark:text-cyber-muted'}`}>
                    {statusText(t, item)}
                </Text>
            </View>
            {item.status === 'done' ? <FontAwesome name="check-circle" size={20} color="#059669" /> : null}
            {item.status === 'resizing' ? <ActivityIndicator size="small" color="#047857" /> : null}
            {failed && isRetryable(item.errorKind) ? (
                <TouchableOpacity
                    onPress={onRetry}
                    hitSlop={10}
                    className="p-2"
                    accessibilityRole="button"
                    accessibilityLabel={t('fieldPhotos.retry', { defaultValue: 'ניסיון נוסף: {{name}}', name: item.name })}
                >
                    <FontAwesome name="refresh" size={16} color="#047857" />
                </TouchableOpacity>
            ) : null}
            {failed || item.status === 'queued' ? (
                <TouchableOpacity
                    onPress={onDismiss}
                    hitSlop={10}
                    className="p-2"
                    accessibilityRole="button"
                    accessibilityLabel={t('fieldPhotos.dismiss', { defaultValue: 'הסרה מהרשימה: {{name}}', name: item.name })}
                >
                    <FontAwesome name="times" size={16} color="#6b7280" />
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

interface FieldPhotoUploadSheetProps {
    visible: boolean;
    onClose: () => void;
    fieldId: string;
    fieldName: string;
    /** Slots the server last reported for this user on this field. */
    remaining: number;
    fieldFull: boolean;
    /** Called after each successful upload so the gallery can show the new photo. */
    onUploaded: () => void;
}

/**
 * "Add photos" bottom sheet: pick several photos at once and watch one row per photo with its own
 * progress and error. A selection larger than the slots left is trimmed and the user is told how
 * many were left out -- nothing is dropped silently.
 */
export default function FieldPhotoUploadSheet({
    visible,
    onClose,
    fieldId,
    fieldName,
    remaining,
    fieldFull,
    onUploaded,
}: FieldPhotoUploadSheetProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const { items, busy, doneCount, addAssets, retry, dismiss, clearSettled } = useFieldPhotoUpload(fieldId, onUploaded, resizeImage);
    const [trimNotice, setTrimNotice] = useState<string | null>(null);
    const [picking, setPicking] = useState(false);

    // Rows already queued hold slots the server has not counted yet.
    const inFlight = items.filter((it) => it.status === 'queued' || it.status === 'resizing' || it.status === 'uploading').length;
    const slots = Math.max(0, remaining - inFlight);
    const canPick = !fieldFull && slots > 0 && !picking;

    useEffect(() => {
        if (!visible) setTrimNotice(null);
    }, [visible]);

    const handlePick = async () => {
        setPicking(true);
        try {
            const picked = await pickFieldPhotos(slots);
            if (!picked) return;
            const result = addAssets(picked, slots);
            setTrimNotice(
                result.skippedCount > 0
                    ? t('fieldPhotos.trimmed', {
                        defaultValue: 'בחרת {{selected}} תמונות, אבל כרגע אפשר להוסיף רק {{slots}}. {{skipped}} לא נשלחו.',
                        selected: picked.length,
                        slots,
                        skipped: result.skippedCount,
                    })
                    : null
            );
        } finally {
            setPicking(false);
        }
    };

    const handleClose = () => {
        if (busy) return;
        clearSettled();
        onClose();
    };

    const allDone = !busy && doneCount > 0;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={handleClose}
        >
            <View className="flex-1 justify-end bg-black/50">
                <View
                    className="bg-white dark:bg-cyber-card rounded-t-3xl px-5 pt-5"
                    style={{ maxHeight: windowHeight - insets.top - 24, paddingBottom: Math.max(insets.bottom, 16) + 4 }}
                    accessibilityViewIsModal
                >
                    <Text className="text-xl font-bold text-gray-800 dark:text-cyber-text mb-1" accessibilityRole="header">
                        {t('fieldPhotos.addTitle', { defaultValue: 'הוספת תמונות ל{{name}}', name: fieldName })}
                    </Text>
                    <Text className="text-gray-500 dark:text-cyber-muted text-sm mb-4">
                        {fieldFull
                            ? errorText(t, 'FIELD_FULL')
                            : `${remainingText(t, slots)}. ${t('fieldPhotos.reviewNote', 'התמונות יוצגו לכולם אחרי אישור של מנהל.')}`}
                    </Text>

                    <TouchableOpacity
                        onPress={handlePick}
                        disabled={!canPick}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !canPick }}
                        className={`flex-row items-center justify-center py-4 rounded-xl border border-dashed ${
                            canPick ? 'border-brand bg-brand-mist dark:bg-brand-ink' : 'border-gray-300 dark:border-cyber-border'
                        }`}
                    >
                        {picking ? (
                            <ActivityIndicator color="#047857" />
                        ) : (
                            <>
                                <FontAwesome name="image" size={16} color={canPick ? '#047857' : '#9ca3af'} />
                                <Text className={`font-bold mx-2 ${canPick ? 'text-brand-dark dark:text-brand-light' : 'text-gray-400'}`}>
                                    {t('fieldPhotos.choose', 'בחירת תמונות')}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <View accessibilityLiveRegion="polite">
                        {trimNotice ? (
                            <View className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30">
                                <Text className="text-amber-800 dark:text-amber-200 text-sm">{trimNotice}</Text>
                            </View>
                        ) : null}
                        {allDone ? (
                            <View className="mt-3 p-3 rounded-xl bg-brand-mist dark:bg-brand-ink">
                                <Text className="text-brand-dark dark:text-brand-light text-sm">
                                    {doneCount === 1
                                        ? t('fieldPhotos.uploadedOne', 'התמונה הועלתה. תודה!')
                                        : t('fieldPhotos.uploadedMany', { defaultValue: '{{count}} תמונות הועלו. תודה!', count: doneCount })}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    {items.length > 0 ? (
                        <ScrollView className="mt-2" style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
                            {items.map((item) => (
                                <UploadRow key={item.id} item={item} onRetry={() => retry(item.id)} onDismiss={() => dismiss(item.id)} />
                            ))}
                        </ScrollView>
                    ) : null}

                    <View className="flex-row justify-end mt-3">
                        <TouchableOpacity
                            onPress={handleClose}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: busy }}
                            className="px-4 py-3"
                        >
                            <Text className={`font-medium ${busy ? 'text-gray-400' : 'text-gray-600 dark:text-cyber-muted'}`}>
                                {busy ? t('fieldPhotos.uploading', 'מעלה...') : t('fieldPhotos.close', 'סגירה')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
