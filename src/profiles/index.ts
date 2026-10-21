import type { PresetId } from "../rules";

export const PROFILE_IDS = ["react-ts", "next", "ts", "node", "vue", "svelte"] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];
export const isProfileId = (value: unknown): value is ProfileId =>
  typeof value === "string" && (PROFILE_IDS as readonly string[]).includes(value);

export interface Profile {
  id: ProfileId;
  label: string;
  hint: string;
  experimental: boolean;
  presets: PresetId[];
  filenameCases: Record<string, boolean>;
  filenameIgnores: string[];
  /** Component files where anti-slop/no-object-parameters is turned off (props objects). */
  uiFiles: string[];
  noTernary: boolean;
}

const TANSTACK_ROUTER_IGNORES = ["^__root", "^\\$", "^_"];

export const PROFILES: Record<ProfileId, Profile> = {
  "react-ts": {
    id: "react-ts",
    label: "React + TypeScript",
    hint: "Vite, TanStack Router and similar",
    experimental: false,
    presets: ["base", "react", "sonar", "anti-slop", "strict"],
    filenameCases: { kebabCase: true, pascalCase: true },
    filenameIgnores: TANSTACK_ROUTER_IGNORES,
    uiFiles: ["**/*.tsx", "**/*.jsx"],
    noTernary: false,
  },
  next: {
    id: "next",
    label: "Next.js",
    hint: "React + Next.js rules and file conventions",
    experimental: false,
    presets: ["base", "react", "next", "sonar", "anti-slop", "strict"],
    filenameCases: { kebabCase: true, pascalCase: true },
    filenameIgnores: ["^_", "^\\["],
    uiFiles: ["**/*.tsx", "**/*.jsx"],
    noTernary: false,
  },
  ts: {
    id: "ts",
    label: "TypeScript library",
    hint: "no framework, strictest style (no ternaries)",
    experimental: false,
    presets: ["base", "sonar", "anti-slop", "strict"],
    filenameCases: { kebabCase: true },
    filenameIgnores: [],
    uiFiles: [],
    noTernary: true,
  },
  node: {
    id: "node",
    label: "Node.js backend",
    hint: "APIs, CLIs, workers",
    experimental: false,
    presets: ["base", "node", "sonar", "anti-slop", "strict"],
    filenameCases: { kebabCase: true },
    filenameIgnores: [],
    uiFiles: [],
    noTernary: false,
  },
  vue: {
    id: "vue",
    label: "Vue + TypeScript",
    hint: "experimental: partial .vue support",
    experimental: true,
    presets: ["base", "sonar", "anti-slop", "strict"],
    filenameCases: { kebabCase: true, pascalCase: true },
    filenameIgnores: [],
    uiFiles: ["**/*.vue"],
    noTernary: false,
  },
  svelte: {
    id: "svelte",
    label: "Svelte + TypeScript",
    hint: "experimental: partial .svelte support",
    experimental: true,
    presets: ["base", "sonar", "anti-slop", "strict"],
    filenameCases: { kebabCase: true, pascalCase: true },
    filenameIgnores: ["^\\+"],
    uiFiles: ["**/*.svelte"],
    noTernary: false,
  },
};

type Deps = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null;

export function detectProfile(pkg: Deps): ProfileId {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const has = (name: string) => name in deps;
  if (has("next")) return "next";
  if (has("react")) return "react-ts";
  if (has("vue")) return "vue";
  if (has("svelte")) return "svelte";
  if (["express", "fastify", "hono", "koa", "@nestjs/core"].some(has)) return "node";
  return "ts";
}
