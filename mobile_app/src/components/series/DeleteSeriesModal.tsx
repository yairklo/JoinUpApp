import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { seriesApi, type SeriesDeleteStrategy } from '@/services/api/series';

interface Props {
    visible: boolean;
    seriesId: string;
    seriesName: string;
    onClose: () => void;
    onDeleted: () => void;
}

interface GameSummary { id: string; date: string; }

/** Delete-group flow with the same three strategies as web: delete all, keep games as standalone events, or pick games. */
export default function DeleteSeriesModal({ visible, seriesId, seriesName, onClose, onDeleted }: Props) {
    const { getToken } = useAuth();
    const { t, i18n } = useTranslation();
    const dateLocale = i18n.language === 'he' ? 'he-IL' : 'en-US';
    const [strategy, setStrategy] = useState<SeriesDeleteStrategy>('DELETE_ALL');
    const [games, setGames] = useState<GameSummary[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [fetching, setFetching] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setStrategy('DELETE_ALL');
        setError('');
        setLoadError(false);
        let ignore = false;
        (async () => {
            setFetching(true);
            try {
                const token = await getToken();
                if (!token) throw new Error('no token');
                const data = await seriesApi.getById(seriesId, token, { includeAll: true });
                if (ignore) return;
                const list: GameSummary[] = data.upcomingGames || [];
                setGames(list);
                setSelected(list.map((g) => g.id));
            } catch (e) {
                console.error('Failed to fetch upcoming games', e);
                if (!ignore) setLoadError(true);
            } finally {
                if (!ignore) setFetching(false);
            }
        })();
        return () => { ignore = true; };
    }, [visible, seriesId, getToken]);

    const confirm = async () => {
        setBusy(true);
        setError('');
        try {
            const token = await getToken();
            if (!token) throw new Error(t('series.reauth', 'נדרש להתחבר מחדש'));
            await seriesApi.delete(seriesId, token, strategy, selected);
            onDeleted();
        } catch (e) {
            setError(e instanceof Error ? e.message : t('series.deleteError', 'מחיקת הקבוצה נכשלה'));
        } finally {
            setBusy(false);
        }
    };

    const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));

    const options: { value: SeriesDeleteStrategy; title: string; desc: string }[] = [
        { value: 'DELETE_ALL', title: t('series.deleteAll', 'מחק הכל'), desc: t('series.deleteAllDesc', 'מחק את הקבוצה ובטל את כל המשחקים העתידיים.') },
        { value: 'KEEP_GAMES', title: t('series.keepGames', 'שמור משחקים'), desc: t('series.keepGamesDesc', 'מחק את הקבוצה אך השאר את המשחקים העתידיים כאירועים נפרדים.') },
        { value: 'SELECTIVE', title: t('series.selectiveDelete', 'בחר משחקים למחיקה'), desc: t('series.selectiveDeleteDesc', 'בחר ידנית אילו משחקים לבטל.') },
    ];
    const confirmDisabled = busy || (strategy === 'SELECTIVE' && (loadError || selected.length === 0));

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 bg-black/50 justify-center px-5">
                <View className="bg-white rounded-2xl p-5 max-h-[85%]">
                    <Text className="text-lg font-bold text-red-600 mb-1">{t('series.deleteTitle', 'מחיקת קבוצה')}: {seriesName}</Text>
                    <Text className="text-gray-500 text-sm mb-3">{t('series.deleteIrreversible', 'פעולה זו היא בלתי הפיכה ולא ניתן לבטל אותה.')}</Text>
                    <Text className="text-gray-800 mb-3">
                        {fetching ? '…' : loadError ? t('series.deleteLoadError', 'טעינת המשחקים העתידיים נכשלה. אפשר למחוק הכל או לשמור משחקים, אך לא לבחור משחקים ספציפיים.') : t('series.deleteFoundGames', 'נמצאו {{count}} משחקים עתידיים בקבוצה זו. כיצד תרצה להמשיך?', { count: games.length })}
                    </Text>

                    <ScrollView>
                        {options.map((o) => (
                            <TouchableOpacity key={o.value} onPress={() => setStrategy(o.value)} className="flex-row items-start py-2">
                                <View className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 mt-0.5 ${strategy === o.value ? 'border-red-600' : 'border-gray-300'}`}>
                                    {strategy === o.value && <View className="w-2.5 h-2.5 rounded-full bg-red-600" />}
                                </View>
                                <View className="flex-1">
                                    <Text className="font-bold text-gray-800">{o.title}</Text>
                                    <Text className="text-gray-500 text-xs">{o.desc}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}

                        {strategy === 'SELECTIVE' && (
                            <View className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
                                <View className="flex-row justify-between items-center bg-gray-50 px-3 py-2">
                                    <Text className="text-xs font-bold text-gray-600">{t('series.upcomingGames', 'משחקים עתידיים')}</Text>
                                    <TouchableOpacity onPress={() => setSelected(selected.length === games.length ? [] : games.map((g) => g.id))}>
                                        <Text className="text-brand text-xs font-bold">
                                            {selected.length === games.length ? t('series.clearSelection', 'נקה בחירה') : t('series.selectAll', 'בחר הכל')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                {fetching ? (
                                    <ActivityIndicator className="py-4" />
                                ) : games.length === 0 ? (
                                    <Text className="text-gray-400 text-xs p-3">{t('series.noGames', 'אין משחקים קרובים מתוכננים.')}</Text>
                                ) : (
                                    games.map((g) => (
                                        <TouchableOpacity key={g.id} onPress={() => toggle(g.id)} className="flex-row items-center px-3 py-2 border-t border-gray-100">
                                            <FontAwesome name={selected.includes(g.id) ? 'check-square' : 'square-o'} size={18} color={selected.includes(g.id) ? '#dc2626' : '#9ca3af'} />
                                            <Text className="ml-3 text-gray-700 text-sm">
                                                {new Date(g.date).toLocaleString(dateLocale, { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'short' })}
                                            </Text>
                                        </TouchableOpacity>
                                    ))
                                )}
                            </View>
                        )}
                    </ScrollView>

                    {!!error && <Text className="text-red-600 text-sm mt-3">{error}</Text>}

                    <View className="flex-row gap-3 mt-4">
                        <TouchableOpacity onPress={onClose} disabled={busy} className="flex-1 p-3 rounded-xl items-center bg-gray-100">
                            <Text className="font-bold text-gray-700">{t('common.cancel', 'ביטול')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={confirm}
                            disabled={confirmDisabled}
                            className={`flex-1 p-3 rounded-xl items-center ${confirmDisabled ? 'bg-red-300' : 'bg-red-600'}`}
                        >
                            {busy ? <ActivityIndicator color="#fff" /> : <Text className="font-bold text-white">{t('series.confirmDelete', 'אשר מחיקה')}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
