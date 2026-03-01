/**
 * Workspace tree icons from file-name-mapping-rules.
 * Uses material-icon-theme (folders) and vscode-icons (files) via better-icons.
 * Regenerate: node scripts/fetch-workspace-icons.mjs
 */
import { getFileIconSvg, getFolderIconSvg } from "@/utils/workspaceIcons";
import React from "react";
import Svg, { Circle, G, Path, SvgXml } from "react-native-svg";

const size = 20;
const viewBox = "0 0 24 24";
const strokeProps = {
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 2,
};

function strokeAndFill(color: string) {
  return { stroke: color, fill: color };
}

export function FolderIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <Path
        {...strokeAndFill(color)}
        {...strokeProps}
        d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
      />
    </Svg>
  );
}

export function FolderOpenIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <Path
        {...strokeAndFill(color)}
        {...strokeProps}
        d="m6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
      />
    </Svg>
  );
}

export function FileIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <G {...strokeAndFill(color)} {...strokeProps}>
        <Path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
        <Path d="M14 2v5a1 1 0 0 0 1 1h5" />
      </G>
    </Svg>
  );
}

export function FileCodeIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <G {...strokeAndFill(color)} {...strokeProps}>
        <Path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
        <Path d="M14 2v5a1 1 0 0 0 1 1h5m-10 4.5L8 15l2 2.5m4-5l2 2.5l-2 2.5" />
      </G>
    </Svg>
  );
}

export function FileTextIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <G {...strokeAndFill(color)} {...strokeProps}>
        <Path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
        <Path d="M14 2v5a1 1 0 0 0 1 1h5M10 9H8m8 4H8m8 4H8" />
      </G>
    </Svg>
  );
}

export function FileBracesIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <G {...strokeAndFill(color)} {...strokeProps}>
        <Path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
        <Path d="M14 2v5a1 1 0 0 0 1 1h5m-10 4a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1a1 1 0 0 1 1 1v1a1 1 0 0 0 1 1m4 0a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1a1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1" />
      </G>
    </Svg>
  );
}

export function FileImageIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <G {...strokeAndFill(color)} {...strokeProps}>
        <Path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
        <Path d="M14 2v5a1 1 0 0 0 1 1h5" />
        <Circle cx="10" cy="12" r="2" />
        <Path d="m20 17l-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22" />
      </G>
    </Svg>
  );
}

/** Key icon for .env files */
export function FileKeyIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <G {...strokeAndFill(color)} {...strokeProps}>
        <Path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
        <Path d="m21 2-9.6 9.6" />
        <Circle cx="7.5" cy="15.5" r="5.5" />
      </G>
    </Svg>
  );
}

/** Git branch icon for .gitignore and git config files */
export function FileGitIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <G {...strokeAndFill(color)} {...strokeProps}>
        <Path d="M6 3v12" />
        <Path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <Path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <Path d="M15 6a9 9 0 0 0-9 9" />
      </G>
    </Svg>
  );
}

/** Terminal/shell icon for .sh and .bash files */
export function FileTerminalIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <G {...strokeAndFill(color)} {...strokeProps}>
        <Path d="m4 17 6-6-6-6" />
        <Path d="M12 19h8" />
      </G>
    </Svg>
  );
}

/** File icon type by extension (and optionally name). */
export type FileIconType =
  | "file"
  | "file-code"
  | "file-text"
  | "file-braces"
  | "file-image"
  | "file-key"
  | "file-git"
  | "file-terminal";

const EXT_TO_ICON: Record<string, FileIconType> = {
  // Code
  ts: "file-code",
  tsx: "file-code",
  js: "file-code",
  jsx: "file-code",
  mjs: "file-code",
  cjs: "file-code",
  py: "file-code",
  rb: "file-code",
  go: "file-code",
  rs: "file-code",
  java: "file-code",
  kt: "file-code",
  swift: "file-code",
  c: "file-code",
  cpp: "file-code",
  h: "file-code",
  hpp: "file-code",
  cs: "file-code",
  php: "file-code",
  vue: "file-code",
  svelte: "file-code",
  // Data / config
  json: "file-braces",
  yml: "file-braces",
  yaml: "file-braces",
  toml: "file-braces",
  xml: "file-braces",
  // Docs / text
  md: "file-text",
  mdx: "file-text",
  txt: "file-text",
  rst: "file-text",
  // Images
  png: "file-image",
  jpg: "file-image",
  jpeg: "file-image",
  gif: "file-image",
  webp: "file-image",
  svg: "file-image",
  ico: "file-image",
  bmp: "file-image",
  // Special files
  sh: "file-terminal",
  bash: "file-terminal",
  zsh: "file-terminal",
};

const NAME_TO_ICON: Record<string, FileIconType> = {
  ".env": "file-key",
  ".env.local": "file-key",
  ".env.example": "file-key",
  ".gitignore": "file-git",
  ".gitattributes": "file-git",
  ".gitmodules": "file-git",
};

export function getFileIconType(name: string): FileIconType {
  const lower = name.toLowerCase();
  if (NAME_TO_ICON[lower] != null) return NAME_TO_ICON[lower];
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
  return EXT_TO_ICON[ext] ?? "file";
}

const FILE_ICON_COMPONENTS: Record<FileIconType, React.ComponentType<{ color?: string }>> = {
  file: FileIcon,
  "file-code": FileCodeIcon,
  "file-text": FileTextIcon,
  "file-braces": FileBracesIcon,
  "file-image": FileImageIcon,
  "file-key": FileKeyIcon,
  "file-git": FileGitIcon,
  "file-terminal": FileTerminalIcon,
};

/** Mapped folder icon by name (uses mapping rules); falls back to Lucide if no mapping. */
export function FolderIconByType({
  name,
  expanded,
  color = "currentColor",
}: {
  name: string;
  expanded: boolean;
  color?: string;
}) {
  const svg = getFolderIconSvg(name, expanded);
  if (svg) {
    return <SvgXml xml={svg} width={size} height={size} />;
  }
  return expanded ? (
    <FolderOpenIcon color={color} />
  ) : (
    <FolderIcon color={color} />
  );
}

/** Mapped file icon by name (uses mapping rules); falls back to Lucide if no mapping. */
export function FileIconByType({
  name,
  color = "currentColor",
}: {
  name: string;
  color?: string;
}) {
  const svg = getFileIconSvg(name);
  if (svg) {
    return <SvgXml xml={svg} width={size} height={size} />;
  }
  const type = getFileIconType(name);
  const Icon = FILE_ICON_COMPONENTS[type];
  return <Icon color={color} />;
}
