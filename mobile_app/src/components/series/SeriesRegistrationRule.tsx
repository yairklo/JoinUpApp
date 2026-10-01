import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

export type RegistrationOpenMode = 'weekly' | 'hours' | 'none';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const DAY_DEFAULTS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const DEFAULT_REG_OPEN_TIME = '18:00';
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function initialRegMode(day: number | null | undefined, time: string | null | undefined, hours: number | null | undefined): RegistrationOpenMode {
    if (day !== null && day !== undefined && time) return 'weekly';
    if (hours) return 'hours';
    return 'none';
}

/** Default when switching to the weekday rule: the day after the game day (Saturday game -> Sunday). */
export function defaultRegOpenDay(gameDay: number | null | undefined): number {
    return gameDay !== null && gameDay !== undefined ? (gameDay + 1) % 7 : 0;
}

const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

interface Props {
    mode: RegistrationOpenMode;
    onModeChange: (m: RegistrationOpenMode) => void;
    day: number;
    onDayChange: (d: number) => void;
    time: string;
    onTimeChange: (t: string) => void;
    hours: string;
    onHoursChange: (h: string) => void;
    /** Weekly groups only: used for the plain-language preview. */
    gameDay: number | null | undefined;
    gameTime: string;
}

/** Registration-opening rule for a group's games: weekly weekday+time, legacy N-hours-before, or none. Mirrors web. */
export default function SeriesRegistrationRule({ mode, onModeChange, day, onDayChange, time, onTimeChange, hours, onHoursChange, gameDay, gameTime }: Props) {
    const { t } = useTranslation();
    const dayLabel = (i: number) => t(`common.days.${DAY_KEYS[i]}`, DAY_DEFAULTS[i]);

    const preview = (() => {
        if (gameDay === null || gameDay === undefined || !TIME_RE.test(gameTime) || !TIME_RE.test(time)) {
            return t('series.regPreviewGeneric', 'ההרשמה לכל משחק תיפתח ביום {{day}} ב־{{time}} שלפניו', { day: dayLabel(day), time });
        }
        let daysBack = (gameDay - day + 7) % 7;
        if (daysBack === 0 && toMinutes(time) >= toMinutes(gameTime)) daysBack = 7;
        const total = daysBack * 24 * 60 + toMinutes(gameTime) - toMinutes(time);
        const d = Math.floor(total / (24 * 60));
        const h = Math.floor((total % (24 * 60)) / 60);
        const parts = [d ? t('series.regDays', '{{count}} ימים', { count: d }) : '', h ? t('series.regHours', '{{count}} שעות', { count: h }) : '']
            .filter(Boolean).join(' · ');
        return t('series.regPreview', 'למשחק של יום {{gameDay}} {{gameTime}} ההרשמה תיפתח ביום {{day}} {{time}} שלפניו', {
            gameDay: dayLabel(gameDay), gameTime, day: dayLabel(day), time,
        }) + (parts ? ` (${parts} ${t('series.regBefore', 'לפני')})` : '');
    })();

    const renderOption = (value: RegistrationOpenMode, label: string) => (
        <TouchableOpacity onPress={() => onModeChange(value)} className="flex-row items-center py-2">
            <View className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${mode === value ? 'border-brand' : 'border-gray-300'}`}>
                {mode === value && <View className="w-2.5 h-2.5 rounded-full bg-brand" />}
            </View>
            <Text className="text-gray-700 flex-1">{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View className="mb-4 border border-gray-200 rounded-xl p-3">
            <Text className="text-gray-700 font-bold mb-1">{t('series.regRuleTitle', 'פתיחת הרשמה למשחקים בקבוצה')}</Text>

            {renderOption('weekly', t('series.regWeekly', 'ביום ובשעה קבועים בכל שבוע'))}
            {mode === 'weekly' && (
                <View className="mb-2">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
                        {DAY_DEFAULTS.map((_, i) => (
                            <TouchableOpacity
                                key={i}
                                onPress={() => onDayChange(i)}
                                className={`px-3 py-2 rounded-full mr-2 border ${day === i ? 'bg-brand border-brand' : 'bg-white border-gray-300'}`}
                            >
                                <Text className={day === i ? 'text-white font-medium' : 'text-gray-700'}>{dayLabel(i)}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TextInput
                        value={time}
                        onChangeText={onTimeChange}
                        placeholder="HH:MM"
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-2 w-28"
                    />
                    <Text className="text-gray-500 text-xs">{preview}</Text>
                </View>
            )}

            {renderOption('none', t('series.regNone', 'ללא פתיחה מתוזמנת (ההרשמה פתוחה מיד)'))}

            {renderOption('hours', t('series.regHoursMode', 'מתקדם: מספר שעות קבוע לפני כל משחק'))}
            {mode === 'hours' && (
                <TextInput
                    value={hours}
                    onChangeText={onHoursChange}
                    keyboardType="number-pad"
                    placeholder={t('series.regHoursPlaceholder', 'לדוגמה: 48')}
                    className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-2 w-32"
                />
            )}

            <Text className="text-gray-400 text-xs mt-1">
                {t('series.regRuleNote', 'חל על כל המשחקים העתידיים בקבוצה. שינוי במשחק בודד לא משפיע על שאר הקבוצה.')}
            </Text>
        </View>
    );
}
