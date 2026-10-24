import type { WizardErrors, WizardValues } from "./wizardModel";

/** Shared props for the presentational wizard steps. */
export interface StepProps {
    values: WizardValues;
    errors: WizardErrors;
    onChange: (patch: Partial<WizardValues>) => void;
    disabled?: boolean;
    /** Fields the server locks once a schedule exists (edit mode). */
    locked?: boolean;
}
