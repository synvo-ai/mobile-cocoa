import { Box } from "@/components/ui/box";
import {
    Modal,
    ModalBackdrop, ModalBody, ModalContent
} from "@/components/ui/modal";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { EntranceAnimation } from "@/designSystem";
import { useTheme } from "@/theme/index";
import React, { useMemo } from "react";

const URL_PREVIEW_MAX_LEN = 40;

function truncateUrl(url: string, maxLen: number = URL_PREVIEW_MAX_LEN): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + "…";
}

interface UrlChoiceModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  originalUrl: string;
  vpnUrl: string;
  onChooseOriginal: () => void;
  onChooseVpn: () => void;
  onCancel?: () => void;
}

/**
 * Modal for choosing between original (localhost) URL and tunnel URL.
 * Follows UI/UX Pro Max: 44px touch targets, WCAG contrast, clear hierarchy, accessibility.
 */
export function UrlChoiceModal({
  isOpen,
  title,
  description,
  originalUrl,
  vpnUrl,
  onChooseOriginal,
  onChooseVpn,
  onCancel,
}: UrlChoiceModalProps) {
  const theme = useTheme();
  const backdropStyle = useMemo(
    () => ({ backgroundColor: theme.colors.overlay }),
    [theme.colors.overlay]
  );

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="sm"
    >
      <ModalBackdrop onPress={onCancel} />
      <ModalContent className="w-full max-w-90 p-0">
        <ModalBody className="m-0 p-0">
          <Box style={backdropStyle} className="justify-center items-center p-8">
            <EntranceAnimation variant="scale" duration={280}>
            <Box className="w-full max-w-90 rounded-xl p-8 bg-background-0 border border-outline-300">
              <Text size="lg" bold className="text-typography-900 mb-4">{title}</Text>
              <Text size="md" className="text-typography-600 mb-6 leading-5">{description}</Text>

              <Box className="gap-4">
                <Pressable
                  onPress={onChooseVpn}
                  accessibilityRole="button"
                  accessibilityLabel={`Use VPN URL: ${truncateUrl(vpnUrl)}`}
                  accessibilityHint="Loads the page via tunnel so this device can reach it"
                  className="min-h-11 py-4 px-6 rounded-lg border border-primary-500 bg-primary-500/10"
                >
                  <Text size="sm" bold className="text-primary-500 mb-0.5">Use VPN URL</Text>
                  <Text size="xs" numberOfLines={1} className="text-typography-500">{truncateUrl(vpnUrl)}</Text>
                </Pressable>

                <Pressable
                  onPress={onChooseOriginal}
                  accessibilityRole="button"
                  accessibilityLabel={`Keep original URL: ${truncateUrl(originalUrl)}`}
                  accessibilityHint="Keeps localhost; may not work on this device"
                  className="min-h-11 py-4 px-6 rounded-lg border border-outline-400 bg-background-50"
                >
                  <Text size="sm" bold className="text-typography-900 mb-0.5">Keep original</Text>
                  <Text size="xs" numberOfLines={1} className="text-typography-500">{truncateUrl(originalUrl)}</Text>
                </Pressable>
              </Box>

              {onCancel && (
                <Pressable
                  onPress={onCancel}
                  className="min-h-11 mt-6 py-2 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text size="sm" className="text-typography-500">Cancel</Text>
                </Pressable>
              )}
            </Box>
            </EntranceAnimation>
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
