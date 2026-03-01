import { AlertBanner } from "@/components/reusable/AlertBanner";
import { Button, ButtonText } from "@/components/ui/button";
import { EntranceAnimation } from "@/designSystem";
import type { PermissionDenial } from "@/services/chat/hooks";
import React from "react";
interface PermissionDenialBannerProps {
  denials: PermissionDenial[];
  onDismiss: () => void;
  onAccept: () => void;
}

export function PermissionDenialBanner({ denials, onDismiss, onAccept }: PermissionDenialBannerProps) {
  if (!denials || denials.length === 0) return null;

  const summary = denials.length === 1 ? "Permission denied" : "Permissions denied";
  const detail = denials
    .map((d) => {
      const tool = d.tool_name ?? d.tool ?? "?";
      const path = d.tool_input?.file_path ?? d.tool_input?.path ?? "";
      return path ? `${tool}: ${path}` : tool;
    })
    .join("\n");

  return (
    <EntranceAnimation variant="slideUp" duration={280}>
      <AlertBanner
        title={summary}
        detail={detail}
        tone="error"
        actions={
          <>
          <Button
            variant="outline"
            action="negative"
            size="md"
            onPress={onDismiss}
            className="min-h-11"
          >
            <ButtonText>Dismiss</ButtonText>
          </Button>
          <Button
            variant="solid"
            action="negative"
            size="md"
            onPress={onAccept}
            className="min-h-11"
          >
            <ButtonText>Accept & retry</ButtonText>
          </Button>
          </>
        }
      />
    </EntranceAnimation>
  );
}
