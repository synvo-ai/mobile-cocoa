import { render } from "@testing-library/react-native";
import React from "react";
import { AccessibilityInfo } from "react-native";

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("@/designSystem", () => ({
  triggerHaptic: jest.fn(),
  EntranceAnimation: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/icons/ProviderIcons", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Icon = () => <View />;
  return {
    ClaudeSendIcon: Icon,
    GeminiSendIcon: Icon,
    CodexSendIcon: Icon,
    CodexEnterIcon: Icon,
  };
});

jest.mock("@/components/icons/ChatActionIcons", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Icon = () => <View />;
  return {
    AttachPlusIcon: Icon,
    ChevronDownIcon: Icon,
    ChevronUpIcon: Icon,
    CloseIcon: Icon,
    DockerIcon: Icon,
    GlobeIcon: Icon,
    SkillIcon: Icon,
    VibeIcon: Icon,
    StopCircleIcon: Icon,
    TerminalIcon: Icon,
  };
});

jest.mock("@/components/ui/actionsheet", () => {
  const React = require("react");
  const { View, Pressable, Text } = require("react-native");

  return {
    Actionsheet: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? <View>{children}</View> : null,
    ActionsheetBackdrop: (props: any) => <Pressable {...props} />,
    ActionsheetContent: (props: any) => <View {...props} />,
    ActionsheetItem: ({ onPress, children, ...props }: any) => (
      <Pressable onPress={onPress} {...props}>
        {children}
      </Pressable>
    ),
    ActionsheetItemText: (props: any) => <Text {...props} />,
    ActionsheetDragIndicator: (props: any) => <View {...props} />,
    ActionsheetDragIndicatorWrapper: (props: any) => <View {...props} />,
  };
});

import { InputPanel } from "@/components/chat/InputPanel";

function renderPanel() {
  return render(
    <InputPanel
      connected
      sessionRunning={false}
      waitingForUserInput={false}
      permissionMode="default"
      onSubmit={jest.fn()}
      pendingCodeRefs={[]}
      onRemoveCodeRef={jest.fn()}
      onTerminateAgent={jest.fn()}
      onOpenWebPreview={jest.fn()}
      onOpenProcesses={jest.fn()}
      provider="codex"
      model="gpt-5.1-codex-mini"
      modelOptions={[{ value: "gpt-5.1-codex-mini", label: "gpt-5.1-codex-mini" }]}
      onOpenModelPicker={jest.fn()}
      onOpenSkillsConfig={jest.fn()}
      onOpenDocker={jest.fn()}
    />
  );
}

describe("chat/InputPanel accessibility gate", () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false as never);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("exposes labeled interactive controls", () => {
    const { getByLabelText } = renderPanel();
    expect(getByLabelText("Skill Hub")).toBeTruthy();
    expect(getByLabelText("Select model")).toBeTruthy();
    expect(getByLabelText("System menu")).toBeTruthy();
    expect(getByLabelText("Send message")).toBeTruthy();
  });

  it("keeps minimum touch target classes on key controls", () => {
    const { getByLabelText } = renderPanel();
    const send = getByLabelText("Send message");
    const menu = getByLabelText("System menu");
    const more = getByLabelText("Skill Hub");
    const model = getByLabelText("Select model");

    expect(send.props.className).toContain("h-12");
    expect(menu.props.className).toContain("min-h-11");
    expect(more.props.className).toContain("h-11");
    expect(model.props.className).toContain("min-h-11");
  });
});
