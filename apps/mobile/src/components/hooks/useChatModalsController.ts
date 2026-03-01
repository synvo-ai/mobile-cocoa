import { useCallback, useMemo, useState } from "react";

import type { ChatModalOpenHandlers } from "@/components/types/chatModalTypes";
import type { Provider as BrandProvider } from "@/core/modelOptions";
import type { Message } from "@/services/chat/hooks";

type ModalController = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

type SessionPickerItem = {
  id: string;
  provider?: string | null;
  model?: string | null;
  running?: boolean;
  sseConnected?: boolean;
  messages?: Message[];
  cwd?: string | null;
};

type ChatModalsControllerProps = {
  onRefreshSessionManagementWorkspace: () => void;
  onSessionManagementSelect: (session: SessionPickerItem | null) => Promise<void> | void;
  onSessionManagementNewSession: () => void;
  onSessionManagementActiveChat: () => void;
  onWorkspaceSelected: (path?: string) => void;
  onModelProviderChange: (provider: BrandProvider) => void;
  onModelChange: (model: string) => void;
};

type ChatModalsControllerState = {
  openHandlers: ChatModalOpenHandlers;
  modalStates: {
    workspacePicker: ModalController;
    sessionManagement: ModalController;
    skillsConfig: ModalController;
    processes: ModalController;
    docker: ModalController;
    modelPicker: ModalController;
  };
  selectedSkillId: string | null;
  handleSessionSelect: (session: SessionPickerItem | null) => void;
  handleNewSession: () => void;
  handleSelectActiveChat: () => void;
  handleWorkspacePickerFromSession: () => void;
  handleWorkspaceSelected: (path?: string) => void;
  handleModelChange: (nextModel: string) => void;
  handleSelectSkill: (id: string) => void;
  closeSkillsConfig: () => void;
  closeSkillDetail: () => void;
  handleModelProviderChange: (provider: BrandProvider) => void;
};

function useModalController(): ModalController {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return useMemo(
    () => ({
      isOpen,
      open,
      close,
    }),
    [isOpen, open, close]
  );
}

export function useChatModalsController({
  onRefreshSessionManagementWorkspace,
  onSessionManagementSelect,
  onSessionManagementNewSession,
  onSessionManagementActiveChat,
  onWorkspaceSelected,
  onModelProviderChange,
  onModelChange,
}: ChatModalsControllerProps): ChatModalsControllerState {
  const workspacePicker = useModalController();
  const sessionManagement = useModalController();
  const skillsConfig = useModalController();
  const processes = useModalController();
  const docker = useModalController();
  const modelPicker = useModalController();
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const openWorkspacePicker = useCallback(() => {
    workspacePicker.open();
  }, [workspacePicker.open]);

  const closeWorkspacePicker = useCallback(() => {
    workspacePicker.close();
  }, [workspacePicker.close]);

  const openSessionManagement = useCallback(() => {
    onRefreshSessionManagementWorkspace();
    sessionManagement.open();
  }, [onRefreshSessionManagementWorkspace, sessionManagement.open]);

  const openSkillsConfig = useCallback(() => {
    skillsConfig.open();
  }, [skillsConfig.open]);

  const openProcesses = useCallback(() => {
    processes.open();
  }, [processes.open]);

  const openDocker = useCallback(() => {
    docker.open();
  }, [docker.open]);

  const openModelPicker = useCallback(() => {
    modelPicker.open();
  }, [modelPicker.open]);

  const closeSkillsConfig = useCallback(() => {
    skillsConfig.close();
    setSelectedSkillId(null);
  }, [skillsConfig.close]);

  const handleWorkspaceSelected = useCallback(
    (path?: string) => {
      onWorkspaceSelected(path);
      closeWorkspacePicker();
    },
    [onWorkspaceSelected, closeWorkspacePicker]
  );

  const handleSessionSelect = useCallback(
    (session: SessionPickerItem | null) => {
      void Promise.resolve(onSessionManagementSelect(session)).finally(sessionManagement.close);
    },
    [onSessionManagementSelect, sessionManagement.close]
  );

  const handleNewSession = useCallback(() => {
    onSessionManagementNewSession();
    sessionManagement.close();
  }, [onSessionManagementNewSession, sessionManagement.close]);

  const handleSelectActiveChat = useCallback(() => {
    sessionManagement.close();
    onSessionManagementActiveChat();
  }, [onSessionManagementActiveChat, sessionManagement.close]);

  const handleWorkspacePickerFromSession = useCallback(() => {
    sessionManagement.close();
    openWorkspacePicker();
  }, [openWorkspacePicker, sessionManagement.close]);

  const handleModelChange = useCallback(
    (nextModel: string) => {
      onModelChange(nextModel);
      modelPicker.close();
    },
    [modelPicker.close, onModelChange]
  );

  const handleSelectSkill = useCallback((id: string) => {
    setSelectedSkillId(id);
  }, []);

  const closeSkillDetail = useCallback(() => {
    setSelectedSkillId(null);
  }, []);

  const handleModelProviderChange = useCallback(
    (nextProvider: BrandProvider) => {
      onModelProviderChange(nextProvider);
    },
    [onModelProviderChange]
  );

  const openHandlers = useMemo(
    () => ({
      onOpenSessionManagement: openSessionManagement,
      onOpenSkillsConfig: openSkillsConfig,
      onOpenProcesses: openProcesses,
      onOpenDocker: openDocker,
      onOpenModelPicker: openModelPicker,
      isSessionManagementOpen: sessionManagement.isOpen,
      isAnyModalOpen:
        workspacePicker.isOpen ||
        sessionManagement.isOpen ||
        skillsConfig.isOpen ||
        processes.isOpen ||
        docker.isOpen ||
        modelPicker.isOpen,
    }),
    [
      openSessionManagement,
      openSkillsConfig,
      openProcesses,
      openDocker,
      openModelPicker,
      workspacePicker.isOpen,
      sessionManagement.isOpen,
      skillsConfig.isOpen,
      processes.isOpen,
      docker.isOpen,
      modelPicker.isOpen,
    ]
  );

  return {
    openHandlers,
    modalStates: {
      workspacePicker,
      sessionManagement,
      skillsConfig,
      processes,
      docker,
      modelPicker,
    },
    selectedSkillId,
    handleSessionSelect,
    handleNewSession,
    handleSelectActiveChat,
    handleWorkspacePickerFromSession,
    handleWorkspaceSelected,
    handleModelChange,
    handleSelectSkill,
    closeSkillsConfig,
    closeSkillDetail,
    handleModelProviderChange,
  };
}
