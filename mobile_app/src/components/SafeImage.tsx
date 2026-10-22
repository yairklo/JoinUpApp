import React, { forwardRef, useState } from 'react';
import { Image, View, type ImageProps } from 'react-native';

/**
 * Drop-in replacement for react-native's Image for remote URIs. Stored /uploads/... URLs can point at
 * files that no longer exist; on a load error this swaps to a neutral box that keeps the same
 * className/style (no layout shift) instead of a blank or broken image. No retries until the uri changes.
 */
const SafeImage = forwardRef<Image, ImageProps>(function SafeImage(props, ref) {
    const { source, style, onError, ...rest } = props;
    const isRemote = typeof source === 'object' && source !== null && !Array.isArray(source) && 'uri' in source;
    const uri = isRemote ? (source as { uri?: string }).uri : undefined;
    // Compared against the current uri, so a new uri is automatically "not failed" again.
    const [failedUri, setFailedUri] = useState<string | null>(null);

    if (isRemote && (!uri || uri === failedUri)) {
        return (
            <View
                className={`${rest.className ?? ''} bg-gray-200 dark:bg-cyber-card`.trim()}
                style={style}
                accessible={rest.accessible}
                accessibilityLabel={rest.accessibilityLabel}
                accessibilityRole={rest.accessibilityRole}
                accessibilityHint={rest.accessibilityHint}
                importantForAccessibility={rest.importantForAccessibility}
                testID={rest.testID}
            />
        );
    }

    return (
        <Image
            {...rest}
            ref={ref}
            source={source}
            style={style}
            onError={(e) => {
                if (uri) setFailedUri(uri);
                onError?.(e);
            }}
        />
    );
});

export default SafeImage;
