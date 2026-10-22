import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import LoadingMotif from '@/components/loading/LoadingMotif';
import { useAdminUserReports } from '@/hooks/useAdminUserReports';
import { USER_REPORT_RESOLUTION_MAX } from '@/types/results';
import type { AdminUserReport, UserReportReason, UserReportStatus } from '@/types/results';

// Admin screens are Hebrew only today (see app/admin/moderation.tsx).
const REASON_LABELS: Record<UserReportReason, string> = {
    HARASSMENT: 'הטרדה או בריונות',
    VIOLENCE: 'אלימות או איומים',
    CHEATING: 'רמאות במשחק',
    NO_SHOW: 'לא הגיע למשחק',
    FAKE_PROFILE: 'פרופיל מזויף',
    INAPPROPRIATE_CONTENT: 'תוכן לא הולם',
    RESULT_DISPUTE: 'ערעור על תוצאה',
    OTHER: 'אחר',
};

const FILTERS: { status: UserReportStatus; label: string }[] = [
    { status: 'OPEN', label: 'פתוחים' },
    { status: 'RESOLVED', label: 'טופלו' },
    { status: 'DISMISSED', label: 'נדחו' },
];

const EMPTY_TEXT: Record<UserReportStatus, string> = {
    OPEN: 'אין דיווחים פתוחים.',
    RESOLVED: 'אין דיווחים בסטטוס הזה.',
    DISMISSED: 'אין דיווחים בסטטוס הזה.',
};

const STATUS_LABEL: Record<UserReportStatus, string> = { OPEN: 'פתוח', RESOLVED: 'טופל', DISMISSED: 'נדחה' };

interface PendingAction {
    report: AdminUserReport;
    ban: boolean;
}

interface ReportCardProps {
    report: AdminUserReport;
    busy: boolean;
    onResolve: () => void;
    onDismiss: () => void;
    onBan: () => void;
}

/** One report: chips, reporter/target, game context, details, and (OPEN only) 44px action buttons. */
export function ReportCard({ report, busy, onResolve, onDismiss, onBan }: ReportCardProps) {
    const targetName = report.target.name || report.target.id;
    const dispute = report.reason === 'RESULT_DISPUTE';
    const when = new Date(report.createdAt).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
    const game = report.game;
    const gameLine = game
        ? [game.title || game.field?.name || 'משחק', game.title ? game.field?.name : null, game.start ? new Date(game.start).toLocaleDateString('he-IL') : null].filter(Boolean).join(' · ')
        : null;
    const tournamentTitle = report.tournament ? report.tournament.title || 'טורניר' : null;
    const repeat = report.status === 'OPEN' && report.openReportsOnTarget > 1;

    return (
        <View
            testID={`admin-user-report-${report.id}`}
            className="bg-white dark:bg-cyber-card rounded-2xl p-4 border border-gray-100 dark:border-cyber-border"
            style={{ gap: 6 }}
        >
            <View className="flex-row items-center flex-wrap" style={{ gap: 6 }}>
                <View className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-cyber-border">
                    <Text className="text-gray-700 dark:text-cyber-text text-xs font-bold">{STATUS_LABEL[report.status]}</Text>
                </View>
                <View className={`px-2 py-0.5 rounded-full ${dispute ? 'bg-indigo-100 dark:bg-indigo-950' : 'bg-orange-100 dark:bg-orange-950'}`}>
                    <Text className={`text-xs font-bold ${dispute ? 'text-indigo-800 dark:text-indigo-200' : 'text-orange-800 dark:text-orange-200'}`}>
                        {REASON_LABELS[report.reason] ?? report.reason}
                    </Text>
                </View>
                <Text className="text-gray-400 dark:text-cyber-muted text-xs flex-1 text-end">{when}</Text>
            </View>
            <Text className="text-gray-500 dark:text-cyber-muted text-sm">
                דווח על ידי: <Text className="text-gray-800 dark:text-cyber-text">{report.reporter.name || report.reporter.id}</Text>
            </Text>
            <Text className="text-gray-500 dark:text-cyber-muted text-sm">
                על: <Text className="text-gray-900 dark:text-cyber-text font-bold">{targetName}</Text>
            </Text>
            {repeat ? (
                <Text testID={`admin-user-report-repeat-${report.id}`} className="text-orange-700 dark:text-orange-300 text-xs font-bold">
                    {report.openReportsOnTarget} דיווחים פתוחים על השחקן הזה
                </Text>
            ) : null}
            {gameLine ? <Text className="text-gray-500 dark:text-cyber-muted text-xs">משחק: {gameLine}</Text> : null}
            {tournamentTitle ? <Text className="text-gray-500 dark:text-cyber-muted text-xs">טורניר: {tournamentTitle}</Text> : null}
            {report.details ? (
                <Text className="text-gray-700 dark:text-cyber-text text-sm" numberOfLines={4}>{report.details}</Text>
            ) : null}
            {report.status !== 'OPEN' && report.resolution ? (
                <Text className="text-gray-500 dark:text-cyber-muted text-xs">{report.resolution}</Text>
            ) : null}
            {report.status === 'OPEN' && (
                <View className="flex-row flex-wrap items-center" style={{ gap: 4 }}>
                    <TouchableOpacity
                        testID={`admin-user-report-resolve-${report.id}`}
                        onPress={onResolve}
                        disabled={busy}
                        accessibilityRole="button"
                        className="min-h-[44px] px-3 justify-center"
                    >
                        <Text className="text-brand font-bold">טופל</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        testID={`admin-user-report-dismiss-${report.id}`}
                        onPress={onDismiss}
                        disabled={busy}
                        accessibilityRole="button"
                        className="min-h-[44px] px-3 justify-center"
                    >
                        <Text className="text-gray-600 dark:text-cyber-muted font-bold">דחייה</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        testID={`admin-user-report-ban-${report.id}`}
                        onPress={onBan}
                        disabled={busy}
                        accessibilityRole="button"
                        className="min-h-[44px] px-3 justify-center"
                    >
                        <Text className="text-red-600 font-bold">טיפול + השעיה</Text>
                    </TouchableOpacity>
                    {busy ? <ActivityIndicator size="small" /> : null}
                </View>
            )}
        </View>
    );
}

/** Player-reports queue for app/admin/moderation.tsx: status filter, report cards, resolve / dismiss / resolve + ban. */
export default function AdminUserReportsSection() {
    const [status, setStatus] = useState<UserReportStatus>('OPEN');
    const { reports, loading, error, busyId, resolve, dismiss, refresh } = useAdminUserReports(status);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [note, setNote] = useState('');

    const fail = (e: any) => {
        if (e?.status === 409) Alert.alert('', 'הדיווח כבר טופל על ידי מנהל אחר.');
        else Alert.alert('שגיאה', 'הפעולה נכשלה. נסו שוב.');
    };

    // The server requires a non-empty resolution note, so "resolved" starts prefilled and "ban" must be written.
    const openAction = (report: AdminUserReport, ban: boolean) => {
        setNote(ban ? '' : 'טופל');
        setPending({ report, ban });
    };

    const confirm = async () => {
        if (!pending || !note.trim()) return;
        const { report, ban } = pending;
        setPending(null);
        try {
            await resolve(report.id, note, ban ? 'BAN' : 'NONE');
        } catch (e) {
            fail(e);
        }
    };

    const dismissReport = async (report: AdminUserReport) => {
        try {
            await dismiss(report.id);
        } catch (e) {
            fail(e);
        }
    };

    const name = pending ? pending.report.target.name || pending.report.target.id : '';

    return (
        <View testID="admin-user-reports" style={{ gap: 12 }}>
            <Text className="text-lg font-bold text-gray-800 dark:text-cyber-text">דיווחים על שחקנים</Text>
            <View className="flex-row" style={{ gap: 8 }}>
                {FILTERS.map((f) => {
                    const selected = f.status === status;
                    return (
                        <TouchableOpacity
                            key={f.status}
                            testID={`admin-user-reports-filter-${f.status}`}
                            onPress={() => setStatus(f.status)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            className={`h-10 px-4 rounded-full justify-center ${selected ? 'bg-brand' : 'bg-gray-100 dark:bg-cyber-border'}`}
                        >
                            <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700 dark:text-cyber-text'}`}>{f.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {loading ? (
                <View className="py-6 items-center"><LoadingMotif id="brand-pulse" label="טוען…" /></View>
            ) : error ? (
                <View>
                    <Text className="text-red-600 text-sm">לא הצלחנו לטעון את הדיווחים.</Text>
                    <TouchableOpacity onPress={refresh} className="min-h-[44px] justify-center" accessibilityRole="button">
                        <Text className="text-brand font-bold">נסו שוב</Text>
                    </TouchableOpacity>
                </View>
            ) : reports.length === 0 ? (
                <Text className="text-gray-500 dark:text-cyber-muted text-sm">{EMPTY_TEXT[status]}</Text>
            ) : (
                reports.map((r) => (
                    <ReportCard
                        key={r.id}
                        report={r}
                        busy={busyId === r.id}
                        onResolve={() => openAction(r, false)}
                        onDismiss={() => dismissReport(r)}
                        onBan={() => openAction(r, true)}
                    />
                ))
            )}

            <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => setPending(null)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center bg-black/40 px-6">
                    <View className="bg-white dark:bg-cyber-card rounded-2xl p-5" style={{ gap: 12 }}>
                        <Text className="text-lg font-bold text-gray-900 dark:text-cyber-text">
                            {pending?.ban ? `להשעות את ${name}?` : 'סימון כטופל'}
                        </Text>
                        {pending?.ban ? (
                            <Text className="text-gray-600 dark:text-cyber-muted text-sm">
                                המשתמש לא יוכל להתחבר ל-JoinUp. הדיווח יסומן כטופל.
                            </Text>
                        ) : null}
                        <TextInput
                            value={note}
                            onChangeText={setNote}
                            maxLength={USER_REPORT_RESOLUTION_MAX}
                            multiline
                            placeholder="הערה פנימית"
                            placeholderTextColor="#9ca3af"
                            accessibilityLabel="הערה פנימית"
                            className="border border-gray-200 dark:border-cyber-border rounded-xl px-3 py-2 min-h-[72px] text-gray-900 dark:text-cyber-text"
                            style={{ textAlignVertical: 'top' }}
                        />
                        <View className="flex-row" style={{ gap: 8 }}>
                            <TouchableOpacity
                                onPress={() => setPending(null)}
                                accessibilityRole="button"
                                className="flex-1 h-12 rounded-2xl bg-gray-100 dark:bg-cyber-border items-center justify-center"
                            >
                                <Text className="font-bold text-gray-700 dark:text-cyber-text">ביטול</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                testID={pending?.ban ? 'admin-user-report-ban-confirm' : undefined}
                                onPress={confirm}
                                disabled={!note.trim()}
                                accessibilityRole="button"
                                className={`flex-1 h-12 rounded-2xl items-center justify-center ${pending?.ban ? 'bg-red-600' : 'bg-brand'} ${note.trim() ? '' : 'opacity-40'}`}
                            >
                                <Text className="font-bold text-white">{pending?.ban ? 'השעיה' : 'סימון כטופל'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}
