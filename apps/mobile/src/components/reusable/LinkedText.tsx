import { Text } from "@/components/ui/text";
import React, { useCallback, useMemo } from "react";

/**
 * Regex that matches full URLs (http/https) with optional port and path,
 * as well as localhost:port/path patterns.
 *
 * Captures:
 *  - http://host:port/path?query#hash
 *  - https://host:port/path?query#hash
 *  - localhost:3000/some/path
 *  - 127.0.0.1:8080/api/health
 */
const URL_REGEX =
    /(?:https?:\/\/[^\s<>'")\]]+)|(?:(?:localhost|127\.0\.0\.1):\d{1,5}(?:\/[^\s<>'")\]]*)?)/gi;

type Segment =
    | { type: "text"; value: string }
    | { type: "url"; value: string; displayUrl: string };

function parseSegments(text: string): Segment[] {
    const segments: Segment[] = [];
    let lastIndex = 0;
    // Reset regex state
    URL_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_REGEX.exec(text)) !== null) {
        const matchStart = match.index;
        // Push preceding text
        if (matchStart > lastIndex) {
            segments.push({ type: "text", value: text.slice(lastIndex, matchStart) });
        }
        let url = match[0];
        // Strip trailing punctuation that's likely not part of the URL
        const stripped = url.replace(/[.,;:!?)}\]]+$/, "");
        if (stripped.length > 0) {
            // Adjust the lastIndex to account for stripped chars
            const diff = url.length - stripped.length;
            URL_REGEX.lastIndex -= diff;
            url = stripped;
        }
        const displayUrl = url;
        // Ensure URL has a protocol for opening
        const fullUrl = /^https?:\/\//i.test(url) ? url : `http://${url}`;
        segments.push({ type: "url", value: fullUrl, displayUrl });
        lastIndex = URL_REGEX.lastIndex;
    }
    // Push remaining text
    if (lastIndex < text.length) {
        segments.push({ type: "text", value: text.slice(lastIndex) });
    }
    return segments;
}

type LinkedTextProps = {
    /** The raw text that may contain URLs */
    children: string;
    /** Called when a URL is tapped */
    onPressUrl: (url: string) => void;
    /** Color for the URL text (defaults to accent color) */
    urlColor?: string;
    /** Text style props forwarded to every segment  */
    size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xs";
    /** Whether text is selectable */
    selectable?: boolean;
    /** Text style */
    style?: any;
    /** Number of lines */
    numberOfLines?: number;
    /** className */
    className?: string;
};

export function LinkedText({
    children,
    onPressUrl,
    urlColor = "#579DFF",
    size,
    selectable,
    style,
    numberOfLines,
    className,
}: LinkedTextProps) {
    const segments = useMemo(() => parseSegments(children), [children]);

    const handlePress = useCallback(
        (url: string) => {
            onPressUrl(url);
        },
        [onPressUrl]
    );

    // Fast path: no URLs found, just render plain text
    if (segments.length === 1 && segments[0].type === "text") {
        return (
            <Text
                size={size}
                selectable={selectable}
                style={style}
                numberOfLines={numberOfLines}
                className={className}
            >
                {children}
            </Text>
        );
    }

    return (
        <Text
            size={size}
            selectable={selectable}
            style={style}
            numberOfLines={numberOfLines}
            className={className}
        >
            {segments.map((segment, index) => {
                if (segment.type === "text") {
                    return segment.value;
                }
                return (
                    <Text
                        key={`url-${index}`}
                        size={size}
                        style={[
                            style,
                            {
                                color: urlColor,
                                textDecorationLine: "underline" as const,
                            },
                        ]}
                        onPress={() => handlePress(segment.value)}
                        suppressHighlighting={false}
                    >
                        {segment.displayUrl}
                    </Text>
                );
            })}
        </Text>
    );
}
