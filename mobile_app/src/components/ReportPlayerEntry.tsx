import React, { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import ReportUserDialog, { type ReportErrorKind } from '@/components/ReportUserDialog';
import { useReportUser } from '@/hooks/useReportUser';
import type { UserReportReason } from '@/types/results';

interface ReportPlayerEntryProps {
    target: { id: string; name: string | null; imageUrl?: string | null };
    /** Game the report relates to (teammate list); omitted on a plain profile. */
    gameId?: string;
    /** `link`: text row for a profile; `icon`: 44px icon button for a list row. */
    variant?: 'link' | 'icon';
    testID?: string;
}

/** Report-player trigger plus the report sheet (user mode). Owns the submit state. */
export default function ReportPlayerEntry({ target, gameId, variant = 'link', testID }: ReportPlayerEntryProps) {
    const { t } = useTranslation();
    const { submit } = useReportUser();
    const [open, setOpen] = useState(false);
    const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [errorKind, setErrorKind] = useState<ReportErrorKind>('generic');
    const name = target.name || '';

    const handleSubmit = async (reason: UserReportReason, details?: string) => {
        setState('submitting');
        try {
            await submit({ targetId: target.id, reason, details, gameId });
            setState('success');
        } catch (err: any) {
            setErrorKind(err?.status === 429 ? 'rateLimited' : err?.status == null ? 'offline' : 'generic');
            setState('error');
        }
    };

    return (
        <>
            <TouchableOpacity
                testID={testID ?? `report-player-${target.id}`}
                onPress={() => {
                    setState('idle');
                    setOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('userReport.openA11y', { name })}
                className={variant === 'icon' ? 'w-11 h-11 items-center justify-center' : 'flex-row items-center py-2 min-h-[44px]'}
            >
                <Ionicons name="flag-outline" size={variant === 'icon' ? 20 : 14} color="#6b7280" />
                {variant === 'link' ? (
                    <Text className="text-gray-600 font-semibold ms-1.5">{t('userReport.title')}</Text>
                ) : null}
            </TouchableOpacity>
            <ReportUserDialog
                open={open}
                mode="user"
                target={{ name, imageUrl: target.imageUrl }}
                state={state}
                errorKind={errorKind}
                onClose={() => setOpen(false)}
                onSubmit={handleSubmit}
            />
        </>
    );
}
