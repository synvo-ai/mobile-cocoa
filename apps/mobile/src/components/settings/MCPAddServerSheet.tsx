import { ChevronLeftIcon, CloseIcon } from "@/components/icons/ChatActionIcons";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Input, InputField } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/index";
import React, { useCallback, useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MCPServer = {
  id: string;
  name: string;
  description?: string;
  type: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
};

export interface MCPAddServerSheetProps {
  isOpen: boolean;
  serverBaseUrl: string;
  editingServer?: MCPServer | null;
  onClose: () => void;
  onSave: () => void;
}

export function MCPAddServerSheet({
  isOpen,
  serverBaseUrl,
  editingServer = null,
  onClose,
  onSave,
}: MCPAddServerSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme.mode === "dark";
  const pageSurface = isDark ? "rgba(7, 11, 21, 0.94)" : "rgba(255, 255, 255, 0.96)";
  const headerSurface = isDark ? "rgba(10, 16, 30, 0.94)" : "rgba(248, 250, 252, 0.98)";
  const panelBorder = isDark ? "rgba(162, 210, 255, 0.28)" : "rgba(15, 23, 42, 0.12)";
  const titleColor = isDark ? "#EAF4FF" : "#0F172A";
  const bodyColor = isDark ? "#D9E8F9" : "#1E293B";
  const mutedColor = isDark ? "rgba(217, 232, 249, 0.82)" : "#475569";
  const cardSurface = isDark ? "rgba(16, 24, 40, 0.9)" : "rgba(248, 250, 252, 0.96)";
  const inputBg = isDark ? "rgba(2, 6, 23, 0.6)" : "#FFFFFF";
  const accentColor = isDark ? "#60A5FA" : "#2563EB";
  const errorColor = isDark ? "#EF4444" : "#DC2626";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envVars, setEnvVars] = useState("");
  const [cwd, setCwd] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingServer) {
      setName(editingServer.name);
      setDescription(editingServer.description || "");
      setType(editingServer.type);
      setCommand(editingServer.command || "");
      setArgs(editingServer.args?.join(" ") || "");
      setEnvVars(
        editingServer.env
          ? Object.entries(editingServer.env)
              .map(([k, v]) => `${k}=${v}`)
              .join("\n")
          : ""
      );
      setCwd(editingServer.cwd || "");
      setUrl(editingServer.url || "");
      setHeaders(
        editingServer.headers
          ? Object.entries(editingServer.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")
          : ""
      );
    } else {
      setName("");
      setDescription("");
      setType("stdio");
      setCommand("");
      setArgs("");
      setEnvVars("");
      setCwd("");
      setUrl("");
      setHeaders("");
    }
    setError(null);
  }, [editingServer, isOpen]);

  const parseEnvVars = (text: string): Record<string, string> => {
    const result: Record<string, string> = {};
    const lines = text.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const eqIndex = line.indexOf("=");
      if (eqIndex > 0) {
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        if (key) result[key] = value;
      }
    }
    return result;
  };

  const parseHeaders = (text: string): Record<string, string> => {
    const result: Record<string, string> = {};
    const lines = text.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (key) result[key] = value;
      }
    }
    return result;
  };

  const handleSave = useCallback(async () => {
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (type === "stdio" && !command.trim()) {
      setError("Command is required for stdio servers");
      return;
    }

    if (type === "http" && !url.trim()) {
      setError("URL is required for HTTP servers");
      return;
    }

    const config: any = {
      name: name.trim(),
      description: description.trim() || undefined,
      type,
    };

    if (type === "stdio") {
      config.command = command.trim();
      config.args = args.trim() ? args.trim().split(/\s+/) : [];
      const parsedEnv = parseEnvVars(envVars);
      if (Object.keys(parsedEnv).length > 0) {
        config.env = parsedEnv;
      }
      if (cwd.trim()) {
        config.cwd = cwd.trim();
      }
    } else {
      config.url = url.trim();
      const parsedHeaders = parseHeaders(headers);
      if (Object.keys(parsedHeaders).length > 0) {
        config.headers = parsedHeaders;
      }
    }

    setSaving(true);
    try {
      const endpoint = editingServer
        ? `${serverBaseUrl}/api/mcp-servers/${editingServer.id}`
        : `${serverBaseUrl}/api/mcp-servers`;
      const method = editingServer ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const result = await res.json();
      if (result.ok) {
        onSave();
      } else {
        setError(result.error || "Failed to save server");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save server");
    } finally {
      setSaving(false);
    }
  }, [
    name,
    description,
    type,
    command,
    args,
    envVars,
    cwd,
    url,
    headers,
    editingServer,
    serverBaseUrl,
    onSave,
  ]);

  if (!isOpen) return null;

  const safeStyle = {
    paddingTop: 0,
    paddingBottom: Math.max(insets.bottom, 8),
  };

  return (
    <Box className="flex-1 overflow-hidden" style={{ backgroundColor: pageSurface }}>
      <Box className="flex-1" style={safeStyle}>
        {/* Header */}
        <Box
          className="flex-row items-center justify-between py-4 px-5 border-b"
          style={{ borderBottomColor: panelBorder, backgroundColor: headerSurface }}
        >
          <Box className="flex-row items-center gap-3">
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Go back"
              className="p-2 -ml-2"
            >
              <ChevronLeftIcon size={24} color={mutedColor} />
            </Pressable>
            <Text className="text-lg font-semibold" style={{ color: titleColor }}>
              {editingServer ? "Edit Server" : "Add MCP Server"}
            </Text>
          </Box>
        </Box>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 24,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Error Message */}
          {error && (
            <Box
              style={{
                backgroundColor: isDark ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.1)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <Text className="text-sm" style={{ color: errorColor }}>
                {error}
              </Text>
            </Box>
          )}

          {/* Name */}
          <Box className="mb-4">
            <Text className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mutedColor }}>
              Name *
            </Text>
            <Input
              variant="outline"
              size="md"
              style={{ backgroundColor: inputBg, borderColor: panelBorder }}
            >
              <InputField
                placeholder="My MCP Server"
                value={name}
                onChangeText={setName}
                style={{ color: bodyColor }}
                placeholderTextColor={mutedColor}
              />
            </Input>
          </Box>

          {/* Description */}
          <Box className="mb-4">
            <Text className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mutedColor }}>
              Description
            </Text>
            <Input
              variant="outline"
              size="md"
              style={{ backgroundColor: inputBg, borderColor: panelBorder }}
            >
              <InputField
                placeholder="Optional description"
                value={description}
                onChangeText={setDescription}
                style={{ color: bodyColor }}
                placeholderTextColor={mutedColor}
              />
            </Input>
          </Box>

          {/* Type Selector */}
          <Box className="mb-4">
            <Text className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mutedColor }}>
              Type
            </Text>
            <Box className="flex-row gap-2">
              <Pressable
                onPress={() => setType("stdio")}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: type === "stdio" ? accentColor : panelBorder,
                  backgroundColor: type === "stdio"
                    ? (isDark ? "rgba(96, 165, 250, 0.15)" : "rgba(37, 99, 235, 0.1)")
                    : cardSurface,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: type === "stdio" ? "600" : "500",
                    color: type === "stdio" ? accentColor : bodyColor,
                  }}
                >
                  Local (stdio)
                </Text>
                <Text
                  className="text-xs mt-1"
                  style={{ color: mutedColor, textAlign: "center" }}
                >
                  Run a local command
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setType("http")}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: type === "http" ? accentColor : panelBorder,
                  backgroundColor: type === "http"
                    ? (isDark ? "rgba(96, 165, 250, 0.15)" : "rgba(37, 99, 235, 0.1)")
                    : cardSurface,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: type === "http" ? "600" : "500",
                    color: type === "http" ? accentColor : bodyColor,
                  }}
                >
                  HTTP
                </Text>
                <Text
                  className="text-xs mt-1"
                  style={{ color: mutedColor, textAlign: "center" }}
                >
                  Connect to remote URL
                </Text>
              </Pressable>
            </Box>
          </Box>

          {/* Type-specific fields */}
          {type === "stdio" ? (
            <>
              {/* Command */}
              <Box className="mb-4">
                <Text className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mutedColor }}>
                  Command *
                </Text>
                <Input
                  variant="outline"
                  size="md"
                  style={{ backgroundColor: inputBg, borderColor: panelBorder }}
                >
                  <InputField
                    placeholder="npx, node, python, etc."
                    value={command}
                    onChangeText={setCommand}
                    style={{ color: bodyColor, fontFamily: "monospace" }}
                    placeholderTextColor={mutedColor}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Input>
              </Box>

              {/* Args */}
              <Box className="mb-4">
                <Text className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mutedColor }}>
                  Arguments
                </Text>
                <Input
                  variant="outline"
                  size="md"
                  style={{ backgroundColor: inputBg, borderColor: panelBorder }}
                >
                  <InputField
                    placeholder="-y @modelcontextprotocol/server-filesystem /path"
                    value={args}
                    onChangeText={setArgs}
                    style={{ color: bodyColor, fontFamily: "monospace" }}
                    placeholderTextColor={mutedColor}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Input>
                <Text className="text-xs mt-1" style={{ color: mutedColor }}>
                  Space-separated arguments
                </Text>
              </Box>

              {/* Environment Variables */}
              <Box className="mb-4">
                <Text className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mutedColor }}>
                  Environment Variables
                </Text>
                <Input
                  variant="outline"
                  size="md"
                  style={{ backgroundColor: inputBg, borderColor: panelBorder, minHeight: 80 }}
                >
                  <InputField
                    placeholder={"API_KEY=xxx\nDEBUG=true"}
                    value={envVars}
                    onChangeText={setEnvVars}
                    style={{ color: bodyColor, fontFamily: "monospace", textAlignVertical: "top" }}
                    placeholderTextColor={mutedColor}
                    multiline
                    numberOfLines={3}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Input>
                <Text className="text-xs mt-1" style={{ color: mutedColor }}>
                  One per line: KEY=value
                </Text>
              </Box>

              {/* Working Directory */}
              <Box className="mb-4">
                <Text className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mutedColor }}>
                  Working Directory
                </Text>
                <Input
                  variant="outline"
                  size="md"
                  style={{ backgroundColor: inputBg, borderColor: panelBorder }}
                >
                  <InputField
                    placeholder="/path/to/directory"
                    value={cwd}
                    onChangeText={setCwd}
                    style={{ color: bodyColor, fontFamily: "monospace" }}
                    placeholderTextColor={mutedColor}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Input>
              </Box>
            </>
          ) : (
            <>
              {/* URL */}
              <Box className="mb-4">
                <Text className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mutedColor }}>
                  URL *
                </Text>
                <Input
                  variant="outline"
                  size="md"
                  style={{ backgroundColor: inputBg, borderColor: panelBorder }}
                >
                  <InputField
                    placeholder="https://mcp.example.com/api"
                    value={url}
                    onChangeText={setUrl}
                    style={{ color: bodyColor, fontFamily: "monospace" }}
                    placeholderTextColor={mutedColor}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </Input>
              </Box>

              {/* Headers */}
              <Box className="mb-4">
                <Text className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mutedColor }}>
                  Headers
                </Text>
                <Input
                  variant="outline"
                  size="md"
                  style={{ backgroundColor: inputBg, borderColor: panelBorder, minHeight: 80 }}
                >
                  <InputField
                    placeholder={"Authorization: Bearer xxx\nX-Custom: value"}
                    value={headers}
                    onChangeText={setHeaders}
                    style={{ color: bodyColor, fontFamily: "monospace", textAlignVertical: "top" }}
                    placeholderTextColor={mutedColor}
                    multiline
                    numberOfLines={3}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Input>
                <Text className="text-xs mt-1" style={{ color: mutedColor }}>
                  One per line: Header-Name: value
                </Text>
              </Box>
            </>
          )}

          {/* Save Button */}
          <Button
            size="lg"
            onPress={handleSave}
            disabled={saving}
            style={{ marginTop: 8 }}
          >
            {saving ? (
              <Spinner size="small" color="#FFFFFF" />
            ) : (
              <ButtonText>{editingServer ? "Save Changes" : "Add Server"}</ButtonText>
            )}
          </Button>
        </ScrollView>
      </Box>
    </Box>
  );
}
