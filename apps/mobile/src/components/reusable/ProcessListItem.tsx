import { StopCircleIcon } from "@/components/icons/ChatActionIcons";
import { LinkedText } from "@/components/reusable/LinkedText";
import { Box } from "@/components/ui/box";
import { Button, ButtonIcon, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { EntranceAnimation } from "@/designSystem";
import { useTheme } from "@/theme/index";
import React, { memo, useMemo } from "react";
import { Platform, TouchableOpacity } from "react-native";

type ProcessListItemProps = {
  pid: number;
  port: number;
  command: string;
  logPaths?: string[];
  accentColor: string;
  isKilling?: boolean;
  isProtected?: boolean;
  onViewLog: (logPath: string) => void;
  onKill: () => void;
  onOpenUrl?: (url: string) => void;
};

function getLogLabel(logPath: string) {
  return logPath.includes("/") ? logPath.split("/").pop() ?? logPath : logPath;
}

function getTerminalFont() {
  return Platform.OS === "ios" ? "Menlo" : "monospace";
}

type ProcessMetaPillProps = {
  label: string;
  accentColor: string;
};

function ProcessMetaPill({ label, accentColor }: ProcessMetaPillProps) {
  return (
    <Box
      className="px-2 py-0.5 rounded-sm border"
      style={{
        backgroundColor: `${accentColor}12`,
        borderColor: `${accentColor}30`,
      }}
    >
      <Text size="xs" bold style={{ color: accentColor }}>
        {label}
      </Text>
    </Box>
  );
}

function ProcessListItem({
  pid,
  port,
  command,
  logPaths,
  accentColor,
  isKilling,
  isProtected,
  onViewLog,
  onKill,
  onOpenUrl,
}: ProcessListItemProps) {
  const theme = useTheme();
  const normalizedLogPaths = useMemo(() => logPaths ?? [], [logPaths]);
  const commandFont = useMemo(getTerminalFont, []);
  const shellHint = useMemo(() => command.split(" ")[0] || "process", [command]);
  const cardStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.surface,
      borderColor: `${accentColor}45`,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    }),
    [accentColor, theme.colors.shadow, theme.colors.surface]
  );
  const commandBlockStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: `${accentColor}33`,
    }),
    [accentColor, theme.colors.surfaceAlt]
  );
  const labelMutedStyle = useMemo(
    () => ({ color: theme.colors.textMuted }),
    [theme.colors.textMuted]
  );
  const commandTextStyle = useMemo(
    () => ({ color: theme.colors.textPrimary, fontFamily: commandFont }),
    [commandFont, theme.colors.textPrimary]
  );

  return (
    <EntranceAnimation variant="slideUp" delay={0}>
      <Box
        className="flex-col rounded-2xl border gap-3 overflow-hidden p-4"
        style={cardStyle}
      >
        <Box className="min-w-0">
          <HStack className="flex-wrap items-center gap-2 mb-3">
            <ProcessMetaPill label={`PID ${pid}`} accentColor={accentColor} />
            <ProcessMetaPill label={`Port ${port}`} accentColor={accentColor} />
            {isProtected ? (
              <Box
                className="px-2 py-0.5 rounded-sm border"
                style={{
                  backgroundColor: `${theme.colors.success ?? theme.colors.accent}18`,
                  borderColor: `${theme.colors.success ?? theme.colors.accent}40`,
                }}
              >
                <Text size="xs" bold style={{ color: theme.colors.success ?? theme.colors.accent }}>
                  System
                </Text>
              </Box>
            ) : (
              <Text size="xs" className="uppercase" style={labelMutedStyle}>
                {shellHint}
              </Text>
            )}
          </HStack>
          <Box className="rounded-xl border px-3 py-2" style={commandBlockStyle}>
            {onOpenUrl ? (
              <LinkedText
                size="xs"
                numberOfLines={4}
                selectable
                className="font-semibold font-mono"
                style={commandTextStyle}
                onPressUrl={onOpenUrl}
                urlColor={accentColor}
              >
                {command}
              </LinkedText>
            ) : (
              <Text
                size="xs"
                numberOfLines={4}
                selectable
                className="font-semibold font-mono"
                style={commandTextStyle}
              >
                {command}
              </Text>
            )}
          </Box>
        </Box>
        {!isProtected && (
          <HStack className="flex-row flex-wrap items-center gap-2 justify-between">
            {normalizedLogPaths.map((logPath) => {
              const label = getLogLabel(logPath);
              return (
                <TouchableOpacity
                  key={logPath}
                  onPress={() => onViewLog(logPath)}
                  accessibilityLabel={`View log ${label}`}
                  accessibilityRole="button"
                  className="rounded-lg border px-3 py-2 min-h-11 justify-center"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    backgroundColor: `${accentColor}14`,
                    borderColor: `${accentColor}40`,
                    minWidth: 84,
                  }}
                >
                  <Text size="xs" bold style={{ color: accentColor }}>
                    Log: {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Box className="min-h-11 justify-center">
              <Button
                action="negative"
                variant="solid"
                size="sm"
                onPress={onKill}
                isDisabled={isKilling}
                className="rounded-lg min-h-11"
              >
                <ButtonIcon as={StopCircleIcon} size="sm" />
                <ButtonText>{isKilling ? "Stopping" : "Kill"}</ButtonText>
              </Button>
            </Box>
          </HStack>
        )}
      </Box>
    </EntranceAnimation>
  );
}

export const ProcessListItemCard = memo(ProcessListItem);
