import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getLegalTexts } from '@joinup/shared/legal';
import LegalDocumentView from '@/components/legal/LegalDocumentView';

export default function TermsOfServiceScreen() {
    const { i18n } = useTranslation();
    return (
        <>
            <Stack.Screen options={{ title: getLegalTexts(i18n.language).terms.title, headerShown: true }} />
            <LegalDocumentView kind="terms" />
        </>
    );
}
