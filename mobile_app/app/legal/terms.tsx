import { Stack } from 'expo-router';
import { TERMS } from '@joinup/shared/legal';
import LegalDocumentView from '@/components/legal/LegalDocumentView';

export default function TermsOfServiceScreen() {
    return (
        <>
            <Stack.Screen options={{ title: TERMS.title, headerShown: true }} />
            <LegalDocumentView doc={TERMS} />
        </>
    );
}
