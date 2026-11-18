import { useCallback, useRef } from 'react';
import { nextWholeNumberInput } from '@/utils/gameFormInput';

/**
 * onChangeText handler for an integer-only TextInput (price, max players, team size).
 * Keeps the field whole however it is typed: see `nextWholeNumberInput`.
 */
export function useWholeNumberInput(
    value: string,
    setValue: (next: string) => void,
    opts: { allowThousands?: boolean } = {},
): (text: string) => void {
    const locked = useRef(false);
    const allowThousands = !!opts.allowThousands;
    return useCallback(
        (text: string) => {
            const result = nextWholeNumberInput(text, value, locked.current, { allowThousands });
            locked.current = result.locked;
            setValue(result.value);
        },
        [value, setValue, allowThousands],
    );
}
