import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import FieldPickerModal from './FieldPickerModal';
import StepBasics from './StepBasics';
import StepFormat from './StepFormat';
import StepRegistration from './StepRegistration';
import StepReview from './StepReview';
import StepTeams from './StepTeams';
import {
    firstInvalidStep,
    validateStep,
    WIZARD_STEPS,
    wizardWarnings,
    type WizardErrors,
    type WizardState,
    type WizardStepKey,
} from './wizardModel';

interface Props {
    initial: WizardState;
    /** `create` and DRAFT edits can publish; published edits only save. */
    mode: 'create' | 'edit-draft' | 'edit-published';
    /** Format/limits are locked by the server once a schedule exists. */
    structureLocked?: boolean;
    pending?: boolean;
    /** Already-translated server error (top alert); `null` for none. */
    serverError?: string | null;
    onSaveDraft: (state: WizardState) => void;
    onPublish: (state: WizardState) => void;
    onSavePublished: (state: WizardState) => void;
    onClose: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Create / edit wizard (spec 3). Presentational shell: owns the step index, the edited state and live
 * validation, delegates saving to the container through callbacks. "Next" never disables; on press it
 * validates the step and shows the first error.
 */
export default function TournamentWizard({
    initial,
    mode,
    structureLocked,
    pending,
    serverError,
    onSaveDraft,
    onPublish,
    onSavePublished,
    onClose,
    onDirtyChange,
}: Props) {
    const { t } = useTranslation();
    const [state, setState] = useState(initial);
    const [stepIdx, setStepIdx] = useState(0);
    const [showErrors, setShowErrors] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const dirty = useRef(false);
    const scroll = useRef<ScrollView>(null);

    useEffect(() => {
        const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
        const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
        return () => {
            show.remove();
            hide.remove();
        };
    }, []);

    const patch = (p: Partial<WizardState>) => {
        if (!dirty.current) {
            dirty.current = true;
            onDirtyChange?.(true);
        }
        setState((s) => ({ ...s, ...p }));
    };

    const step: WizardStepKey = WIZARD_STEPS[stepIdx];
    const errors: WizardErrors = showErrors ? validateStep(step, state) : {};
    const total = WIZARD_STEPS.length;
    const invalidSteps = WIZARD_STEPS.filter((s) => Object.keys(validateStep(s, state)).length > 0);
    const blocked = invalidSteps.length > 0;

    const goTo = (i: number) => {
        setShowErrors(false);
        setStepIdx(i);
        scroll.current?.scrollTo({ y: 0, animated: false });
    };
    const next = () => {
        if (Object.keys(validateStep(step, state)).length) {
            setShowErrors(true);
            scroll.current?.scrollTo({ y: 0, animated: true });
            return;
        }
        goTo(Math.min(total - 1, stepIdx + 1));
    };
    const back = () => goTo(Math.max(0, stepIdx - 1));
    const close = () => {
        if (!dirty.current) return onClose();
        Alert.alert(t('resultEditor.leaveTitle'), undefined, [
            { text: t('resultEditor.keepEditing'), style: 'cancel' },
            { text: t('resultEditor.leave'), style: 'destructive', onPress: onClose },
        ]);
    };
    const draftFromBlocked = () => {
        // A draft only needs a title; everything else can be completed later.
        if (!state.title.trim()) {
            goTo(0);
            setShowErrors(true);
            return;
        }
        onSaveDraft(state);
    };
    const publish = () => {
        const bad = firstInvalidStep(state);
        if (bad) {
            goTo(WIZARD_STEPS.indexOf(bad));
            setShowErrors(true);
            return;
        }
        if (mode === 'edit-published') return onSavePublished(state);
        Alert.alert(
            t('tournaments.wizard.publishConfirmTitle'),
            t('tournaments.wizard.publishConfirmBody', { date: state.regClosesAt ? state.regClosesAt.toLocaleDateString() : '—' }),
            [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('tournaments.wizard.publishAction'), onPress: () => onPublish(state) },
            ]
        );
    };

    const isLast = stepIdx === total - 1;
    const primaryLabel = !isLast
        ? t('tournaments.wizard.next')
        : mode === 'edit-published'
          ? t('tournaments.wizard.saveChanges')
          : t('tournaments.wizard.publish');
    const onPrimary = isLast ? publish : next;

    const buttons = (
        <View className="flex-row items-center" style={{ gap: 8 }}>
            <TouchableOpacity
                testID="wizard-back"
                accessibilityRole="button"
                disabled={stepIdx === 0 || pending}
                onPress={back}
                className={`h-11 px-4 justify-center ${stepIdx === 0 ? 'opacity-30' : ''}`}
            >
                <Text className="text-gray-700 dark:text-cyber-text font-semibold">{t('tournaments.wizard.back')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
                testID={isLast ? 'wizard-publish' : 'wizard-next'}
                accessibilityRole="button"
                accessibilityState={{ busy: !!pending }}
                disabled={pending}
                onPress={onPrimary}
                className="flex-1 h-[52px] rounded-2xl bg-brand items-center justify-center"
            >
                {pending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-base">{primaryLabel}</Text>}
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView testID="wizard" className="flex-1 bg-gray-50 dark:bg-cyber-bg">
            <View className="flex-row items-center justify-between px-2">
                <TouchableOpacity
                    testID="wizard-close"
                    accessibilityRole="button"
                    accessibilityLabel={t('common.close')}
                    onPress={close}
                    className="w-11 h-11 items-center justify-center"
                >
                    <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
                <Text className="flex-1 text-center text-base font-bold text-gray-900 dark:text-cyber-text" numberOfLines={1}>
                    {mode === 'create' ? t('tournaments.new') : t('tournaments.wizard.editTitle')}
                </Text>
                {mode !== 'edit-published' ? (
                    <TouchableOpacity
                        testID="wizard-save-draft"
                        accessibilityRole="button"
                        disabled={pending}
                        onPress={draftFromBlocked}
                        className="min-h-[44px] px-3 justify-center"
                    >
                        <Text className="text-brand-dark dark:text-brand-light font-bold text-sm">{t('tournaments.wizard.saveDraft')}</Text>
                    </TouchableOpacity>
                ) : (
                    <View className="w-11" />
                )}
            </View>

            <View className="px-4 pb-2">
                <Text className="text-xs text-gray-600 dark:text-cyber-muted mb-1.5">
                    {t('tournaments.wizard.stepOf', { n: stepIdx + 1, total })} · {t(`tournaments.wizard.steps.${step}`)}
                </Text>
                <View className="flex-row" style={{ gap: 4 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: stepIdx + 1 }}>
                    {WIZARD_STEPS.map((s, i) => (
                        <View key={s} className={`flex-1 h-1 rounded-full ${i <= stepIdx ? 'bg-brand' : 'bg-gray-200 dark:bg-cyber-border'}`} />
                    ))}
                </View>
            </View>

            <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView ref={scroll} className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
                    {serverError ? (
                        <View testID="wizard-server-error" accessibilityRole="alert" className="rounded-2xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-3 mb-3">
                            <Text className="text-sm text-red-700 dark:text-red-300">{serverError}</Text>
                        </View>
                    ) : null}
                    {step === 'basics' ? (
                        <StepBasics
                            state={state}
                            errors={errors}
                            onChange={patch}
                            onPickField={() => setPickerOpen(true)}
                            sportLocked={structureLocked}
                        />
                    ) : null}
                    {step === 'teams' ? <StepTeams state={state} errors={errors} onChange={patch} locked={structureLocked} /> : null}
                    {step === 'format' ? <StepFormat state={state} onChange={patch} locked={structureLocked} /> : null}
                    {step === 'registration' ? <StepRegistration state={state} errors={errors} onChange={patch} /> : null}
                    {step === 'review' ? (
                        <StepReview
                            state={state}
                            warnings={wizardWarnings(state)}
                            invalidSteps={blocked ? invalidSteps : []}
                            onEdit={(s) => goTo(WIZARD_STEPS.indexOf(s))}
                        />
                    ) : null}
                    {keyboardOpen ? <View className="mt-2">{buttons}</View> : null}
                </ScrollView>
                {keyboardOpen ? null : (
                    <View className="px-4 py-3 bg-white dark:bg-cyber-card border-t border-gray-100 dark:border-cyber-border">{buttons}</View>
                )}
            </KeyboardAvoidingView>

            <FieldPickerModal
                visible={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onPick={(f) => patch({ fieldId: f.id, fieldName: f.name })}
            />
        </SafeAreaView>
    );
}
