import { ModalScaffold } from "@/components/reusable/ModalScaffold";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import type { AskUserQuestionItem, PendingAskUserQuestion } from "@/core/types";
import { AnimatedPressableView, EntranceAnimation, triggerHaptic } from "@/designSystem";
import { useTheme } from "@/theme/index";
import React, { useCallback, useEffect, useState } from "react";

export interface AskQuestionModalProps {
  pending: PendingAskUserQuestion | null;
  onSubmit: (answers: Array<{ header: string; selected: string[] }>) => void;
  onCancel?: () => void;
}

function useSelections(questions: AskUserQuestionItem[]) {
  const [selected, setSelected] = useState<Record<number, string[]>>({});

  useEffect(() => {
    setSelected({});
  }, [questions.length]);

  const toggle = useCallback((questionIndex: number, label: string, multiSelect: boolean) => {
    setSelected((prev) => {
      const current = prev[questionIndex] ?? [];
      const has = current.includes(label);
      if (multiSelect) {
        const next = has ? current.filter((l) => l !== label) : [...current, label];
        return { ...prev, [questionIndex]: next };
      }
      return { ...prev, [questionIndex]: has ? [] : [label] };
    });
  }, []);

  const getSelected = useCallback((questionIndex: number) => selected[questionIndex] ?? [], [selected]);

  const buildAnswers = useCallback(
    (): Array<{ header: string; selected: string[] }> =>
      questions.map((q, i) => ({
        header: q.header,
        selected: selected[i] ?? [],
      })),
    [questions, selected]
  );

  return { getSelected, toggle, buildAnswers };
}

export function AskQuestionModal({ pending, onSubmit, onCancel }: AskQuestionModalProps) {
  const theme = useTheme();
  const questions = pending?.questions ?? [];
  const { getSelected, toggle, buildAnswers } = useSelections(questions);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [questions.length]);

  const handleConfirm = useCallback(() => {
    onSubmit(buildAnswers());
  }, [buildAnswers, onSubmit]);

  const canSubmit = questions.every((_, i) => (getSelected(i).length ?? 0) > 0);
  const isMultiCard = questions.length > 1;
  const q = questions[currentIndex];
  const currentHasSelection = q ? (getSelected(currentIndex).length ?? 0) > 0 : false;
  const canGoNext = currentHasSelection;
  const isLast = currentIndex === questions.length - 1;

  if (!pending || questions.length === 0) return null;

  const renderQuestion = (qIndex: number) => {
    const question = questions[qIndex];
    if (!question) return null;

    return (
      <Box key={`q-${qIndex}`} className="mb-5">
        <Text size="md" bold className="mb-1 text-typography-900">{question.header}</Text>
        {question.question ? (
          <Text size="sm" className="mb-2.5 text-typography-500">{question.question}</Text>
        ) : null}
        <Box className="gap-2">
          {question.options.map((opt, oIndex) => {
            const sel = getSelected(qIndex);
            const isSelected = sel.includes(opt.label);
            return (
              <AnimatedPressableView
                key={`${qIndex}-${oIndex}`}
                onPress={() => {
                  triggerHaptic("selection");
                  toggle(qIndex, opt.label, !!question.multiSelect);
                }}
                scaleTo={0.98}
                style={[
                  {
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                  },
                  isSelected && {
                    borderColor: theme.colors.accent,
                    backgroundColor: theme.colors.accentSoft,
                  },
                ]}
              >
                <Text size="md" bold className={isSelected ? "text-primary-500" : "text-typography-900"}>{opt.label}</Text>
                {opt.description ? (
                  <Text size="xs" numberOfLines={2} className="mt-0.5 text-typography-500">{opt.description}</Text>
                ) : null}
              </AnimatedPressableView>
            );
          })}
        </Box>
      </Box>
    );
  };

  return (
    <ModalScaffold
      isOpen
      onClose={onCancel ?? (() => undefined)}
      size="full"
      title="Please choose"
      contentClassName="w-full h-full max-w-none rounded-none border-0 bg-transparent p-0 justify-end"
      bodyClassName="m-0 p-0 grow-0"
      showCloseButton={false}
      bodyProps={{ scrollEnabled: false }}
    >
      <EntranceAnimation variant="slideUp" duration={320}>
        <Box
          className="rounded-t-2xl border border-b-0 border-outline-200 bg-surface px-5 pb-6 pt-4 shadow-lg"
          style={{ backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }}
        >
          <Box className="mb-3 flex-row items-center justify-between">
            <Text size="lg" bold className="text-typography-900">Please choose</Text>
            {isMultiCard ? (
              <Box className="flex-row gap-2">
                {questions.map((_, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setCurrentIndex(i)}
                    hitSlop={16}
                    className="min-h-11 min-w-11 items-center justify-center rounded-full active:opacity-80"
                  >
                    <Box
                      className={`h-2.5 w-2.5 rounded-full ${
                        i === currentIndex ? "bg-primary-500" : (getSelected(i).length ?? 0) > 0 ? "bg-success-500" : "bg-outline-400"
                      }`}
                      style={i === currentIndex ? { transform: [{ scale: 1.2 }] } : undefined}
                    />
                  </Pressable>
                ))}
              </Box>
            ) : null}
          </Box>

          {isMultiCard ? (
            <>
              <Box className="min-h-45">{renderQuestion(currentIndex)}</Box>
              <Text size="sm" className="mt-2 text-typography-500">{currentIndex + 1} of {questions.length}</Text>
            </>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              {renderQuestion(0)}
            </ScrollView>
          )}

          <Box className="mt-4 flex-row items-center justify-between gap-3">
            {onCancel ? (
              <Pressable onPress={onCancel} className="min-h-11 justify-center rounded-xl px-5 py-3 active:opacity-80">
                <Text size="md" className="text-typography-500">Cancel</Text>
              </Pressable>
            ) : null}

            {isMultiCard ? (
              <>
                {currentIndex > 0 ? (
                  <Pressable onPress={() => setCurrentIndex((i) => i - 1)} className="min-h-11 justify-center rounded-xl px-4 py-3 active:opacity-80">
                    <Text size="md" bold className="text-primary-500">← Back</Text>
                  </Pressable>
                ) : (
                  <Box className="w-15" />
                )}
                {isLast ? (
                  <Button action="primary" variant="solid" size="md" onPress={handleConfirm} isDisabled={!canSubmit} className="rounded-xl px-6 py-3">
                    <ButtonText className={!canSubmit ? "text-typography-500" : "text-typography-0"}>Confirm</ButtonText>
                  </Button>
                ) : (
                  <Button action="primary" variant="solid" size="md" onPress={() => setCurrentIndex((i) => i + 1)} isDisabled={!canGoNext} className="rounded-xl px-6 py-3">
                    <ButtonText className={!canGoNext ? "text-typography-500" : "text-typography-0"}>Next →</ButtonText>
                  </Button>
                )}
              </>
            ) : (
              <Button action="primary" variant="solid" size="md" onPress={handleConfirm} isDisabled={!canSubmit} className="rounded-xl px-6 py-3">
                <ButtonText className={!canSubmit ? "text-typography-500" : "text-typography-0"}>Confirm</ButtonText>
              </Button>
            )}
          </Box>
        </Box>
      </EntranceAnimation>
    </ModalScaffold>
  );
}
