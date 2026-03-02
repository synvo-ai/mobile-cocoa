import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/components/settings/SkillDetailSheet', () => ({
  SkillDetailSheet: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/components/ui/modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Modal: ({ isOpen, children }: { isOpen?: boolean; children: React.ReactNode }) =>
      isOpen ? <View>{children}</View> : null,
  };
});

jest.mock('@/components/ui/alert/nativeAlert', () => ({
  showAlert: jest.fn(),
}));

jest.mock('@/components/icons/ChatActionIcons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = () => <View />;
  return {
    CloseIcon: Icon,
    ChevronRightIcon: Icon,
  };
});

import { SkillConfigurationView } from '@/components/settings/SkillConfigurationView';

describe('settings/SkillConfigurationView', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads skills asynchronously when opened', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockImplementation(async (...args: unknown[]) => {
      const url = String(args[0] ?? '');
      if (url.endsWith('/api/skills')) {
        return {
          ok: true,
          json: async () => ({
            skills: [
              {
                id: 'skill-a',
                name: 'Skill A',
                description: 'First skill',
              },
            ],
          }),
        } as any;
      }

      if (url.endsWith('/api/skills-enabled')) {
        return {
          ok: true,
          json: async () => ({ enabledIds: [] }),
        } as any;
      }

      return {
        ok: true,
        json: async () => ({ enabledIds: [] }),
      } as any;
    });

    const { getByText } = render(
      <SkillConfigurationView
        isOpen
        onClose={jest.fn()}
        serverBaseUrl="http://localhost:3456"
      />
    );

    await waitFor(() => {
      expect(getByText('Skill A')).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it('supports catalog search/install and local creation flows', async () => {
    const { showAlert } = require('@/components/ui/alert/nativeAlert');

    let installCalledWith: any = null;
    let createCalledWith: any = null;
    let installedFromCatalog = false;
    let createdLocally = false;

    const initialSkills = [
      {
        id: 'skill-a',
        name: 'Skill A',
        description: 'First skill',
      },
    ];

    const getSkillsResponse = () => {
      const skills = [...initialSkills];
      if (installedFromCatalog) {
        skills.push({
          id: 'super-power',
          name: 'Super Power',
          description: 'Skill found in catalog',
          source: 'find-skills',
          path: '/tmp/skills/super-power',
          installedAt: '2026-03-01T00:00:00Z',
        });
      }
      if (createdLocally) {
        skills.push({
          id: 'custom-echo-skill',
          name: 'Custom Echo Skill',
          description: 'Created in app',
          category: 'Development',
          source: 'local',
          path: '/tmp/skills/custom-echo-skill',
        });
      }
      return { skills };
    };

    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockImplementation(async (...args: unknown[]) => {
      const url = String((args[0] as any) ?? '');
      const init = (args[1] as RequestInit | undefined) ?? {};

      if (url.endsWith('/api/skills')) {
        return {
          ok: true,
          json: async () => getSkillsResponse(),
        } as any;
      }

      if (url.endsWith('/api/skills-enabled')) {
        const enabledIds = [];
        if (installedFromCatalog) enabledIds.push('super-power');
        if (createdLocally) enabledIds.push('custom-echo-skill');
        return {
          ok: true,
          json: async () => ({ enabledIds }),
        } as any;
      }

      if (url.endsWith('/api/skills/sources')) {
        return {
          ok: true,
          json: async () => ({
            sources: [
              {
                source: 'find-skills',
                label: 'find-skills catalog',
                enabled: true,
                status: 'ok',
                health: 'ready',
              },
              {
                source: 'github',
                label: 'GitHub URL',
                enabled: false,
                status: 'disabled',
                health: 'disabled',
              },
            ],
          }),
        } as any;
      }

      if (url.includes('/api/skills/search')) {
        return {
          ok: true,
          json: async () => ({
            skills: [
              {
                id: 'super-power',
                name: 'Super Power',
                description: 'Searchable',
                source: 'find-skills',
              },
            ],
          }),
        } as any;
      }

      if (url.endsWith('/api/skills/install')) {
        const body = JSON.parse(String(init.body ?? '{}'));
        installCalledWith = body;
        installedFromCatalog = true;
        return {
          ok: true,
          json: async () => ({
            id: 'super-power',
            status: 'installed',
            path: '/tmp/skills/super-power',
            enabled: true,
            source: 'find-skills',
            installedAt: '2026-03-01T00:00:00Z',
            message: 'Skill installed from catalog.',
            name: 'Super Power',
            enabledIds: ['super-power'],
          }),
        } as any;
      }

      if (url.endsWith('/api/skills/create')) {
        const body = JSON.parse(String(init.body ?? '{}'));
        createCalledWith = body;
        createdLocally = true;
        return {
          ok: true,
          json: async () => ({
            id: 'custom-echo-skill',
            status: 'installed',
            path: '/tmp/skills/custom-echo-skill',
            enabled: true,
            source: 'local',
            installedAt: '2026-03-02T00:00:00Z',
            message: 'Skill created.',
            name: 'Custom Echo Skill',
            enabledIds: ['super-power', 'custom-echo-skill'],
          }),
        } as any;
      }

      return {
        ok: true,
        json: async () => ({ enabledIds: [] }),
      } as any;
    });

    const { getByText, getByPlaceholderText, getAllByText } = render(
      <SkillConfigurationView
        isOpen
        onClose={jest.fn()}
        serverBaseUrl="http://localhost:3456"
      />
    );

    await waitFor(() => {
      expect(getByText('Skill A')).toBeTruthy();
    });

    fireEvent.press(getByText('+ Add Skill'));

    await waitFor(() => {
      expect(getByPlaceholderText('Search catalog skills')).toBeTruthy();
      expect(getByText('Install from Catalog')).toBeTruthy();
    });

    fireEvent.changeText(getByPlaceholderText('Search catalog skills'), 'super');

    await waitFor(() => {
      expect(getByText('Super Power')).toBeTruthy();
      expect(getByText('Install')).toBeTruthy();
    });

    fireEvent.press(getByText('Install'));

    await waitFor(() => {
      expect(installCalledWith).toMatchObject({
        source: 'find-skills',
        skillId: 'super-power',
        autoEnable: true,
      });
      expect(showAlert).toHaveBeenCalledWith('Skill added', 'Skill installed from catalog.');
      expect(getByText('Installed')).toBeTruthy();
    });

    fireEvent.press(getAllByText('Create Skill')[0]);

    await waitFor(() => {
      expect(getByPlaceholderText('Enter display name')).toBeTruthy();
    });

    fireEvent.changeText(getByPlaceholderText('Enter display name'), 'Custom Echo Skill');
    fireEvent.changeText(getByPlaceholderText('my-skill-id'), 'Custom-Echo-Skill');
    fireEvent.changeText(getByPlaceholderText('Short description'), 'Skill created by automated flow');
    fireEvent.changeText(getByPlaceholderText('Author (optional)'), 'QA Team');
    fireEvent.changeText(getByPlaceholderText('Source URL (optional)'), 'https://github.com/example/custom-echo-skill');

    const submitButtons = getAllByText('Create Skill');
    fireEvent.press(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(createCalledWith).toMatchObject({
        name: 'Custom Echo Skill',
        id: 'custom-echo-skill',
        category: 'Development',
        description: 'Skill created by automated flow',
        author: 'QA Team',
        repoUrl: 'https://github.com/example/custom-echo-skill',
        autoEnable: true,
      });
      expect(showAlert).toHaveBeenCalledWith('Skill created', 'Skill created.');
    });
  });
});
