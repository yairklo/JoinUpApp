import React, { useEffect, useState } from 'react';
import { Image, View, type ImageProps } from 'react-native';

/**
 * Drop-in replacement for react-native's Image for remote URIs. Stored /uploads/... URLs can point at
 * files that no longer exist; on the first load error this swaps to a neutral box that keeps the same
 * className/style (no layout shift) instead of a blank or broken image. No retries until the uri changes.
 */
export default function SafeImage(props: ImageProps) {
    const { source, style, onError, ...rest } = props;
    const uri = typeof source === 'object' && source !== null && 'uri' in source ? source.uri : undefined;
    const [failedUri, setFailedUri] = useState<string | null>(null);

    useEffect(() => {
        setFailedUri(null);
    }, [uri]);

    const isRemote = typeof source === 'object' && source !== null && !Array.isArray(source) && 'uri' in source;
    if (isRemote && (!uri || uri === failedUri)) {
        return (
            <View
                accessibilityLabel={props.accessibilityLabel}
                className={rest.className}
                style={[{ backgroundColor: '#e5e7eb' }, style]}
            />
        );
    }

    return (
        <Image
            {...rest}
            source={source}
            style={style}
            onError={(e) => {
                if (uri) setFailedUri(uri);
                onError?.(e);
            }}
        />
    );
}
