#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { doctorCommand } from "./commands/doctor";
import { initCommand } from "./commands/init";
import { updateCommand } from "./commands/update";
import { MIN_NODE } from "./compat";
import { BIN_NAME, PKG_NAME, PKG_VERSION } from "./meta";

const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
  console.error(`${PKG_NAME} needs Node ${MIN_NODE.join(".")} or newer (found ${process.versions.node}).`);
  process.exit(1);
}

const main = defineCommand({
  meta: {
    name: BIN_NAME,
    version: PKG_VERSION,
    description: "Profile-based Oxlint setup: presets, sonarjs, vendored anti-slop, Prettier, baseline",
  },
  subCommands: {
    init: initCommand,
    update: updateCommand,
    doctor: doctorCommand,
  },
});

void runMain(main);
