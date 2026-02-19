// Interactive TUI release version updater for the Tauri phone app and Wear OS companion app
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const REPO_ROOT_MARKER = "pnpm-workspace.yaml";

const PATHS = {
  tauriConf: "apps/threshold/src-tauri/tauri.conf.json",
  webPackage: "apps/threshold/package.json",
  wearGradle: "apps/threshold-wear/build.gradle.kts",
};

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const TAG_RE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// Keep tag discovery code available, but hide it in the status board until
// this repository adopts release tags in a consistent way.
const SHOW_PUBLISHED_TAG_IN_STATUS = false;

function hexColour(hex) {
  const normalised = hex.replace("#", "");
  if (!/^[0-9A-Fa-f]{6}$/.test(normalised)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  const red = Number.parseInt(normalised.slice(0, 2), 16);
  const green = Number.parseInt(normalised.slice(2, 4), 16);
  const blue = Number.parseInt(normalised.slice(4, 6), 16);
  return `\x1b[38;2;${red};${green};${blue}m`;
}

const COLOUR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  // SMDU default theme palette (ScottMorris/smdu).
  red: hexColour("#ff6b6b"),
  green: hexColour("#2ec66a"),
  yellow: hexColour("#ffd166"),
  blue: hexColour("#5aa2ff"),
  magenta: hexColour("#9aa4b2"),
  cyan: hexColour("#7dd3fc"),
  grey: hexColour("#7c8796"),
  line: hexColour("#2e3540"),
};

const TERMINAL = {
  enteredAltScreen: false,
  lastLines: null,
  lastFooterLines: null,
};

class UserExit extends Error {
  constructor(message = "User requested exit") {
    super(message);
    this.name = "UserExit";
  }
}

function paint(text, colour) {
  return `${colour}${text}${COLOUR.reset}`;
}

function clearScreen() {
  // Clear visible screen and move cursor home without resetting terminal state.
  output.write("\x1b[2J\x1b[H");
}

function getTerminalWidth() {
  if (!isInteractiveTty()) {
    return 100;
  }
  const width = output.columns ?? 100;
  return Math.max(80, width);
}

function isInteractiveTty() {
  return Boolean(input.isTTY && output.isTTY);
}

function enterAltScreen() {
  if (!isInteractiveTty() || TERMINAL.enteredAltScreen) {
    return;
  }
  output.write("\x1b[?1049h"); // Alternate screen buffer.
  output.write("\x1b[?25l"); // Hide cursor.
  output.write("\x1b[?1000h"); // Mouse click tracking.
  output.write("\x1b[?1006h"); // SGR mouse mode (wheel/click coordinates).
  TERMINAL.enteredAltScreen = true;
}

function leaveAltScreen() {
  if (!TERMINAL.enteredAltScreen) {
    return;
  }
  output.write("\x1b[?1006l"); // Disable SGR mouse mode.
  output.write("\x1b[?1000l"); // Disable mouse click tracking.
  output.write("\x1b[?25h"); // Show cursor.
  output.write("\x1b[?1049l"); // Restore main screen buffer.
  TERMINAL.enteredAltScreen = false;
}

function divider(width = getTerminalWidth()) {
  return paint("-".repeat(width), COLOUR.line);
}

function drawScreen(lines, footerLines = []) {
  TERMINAL.lastLines = [...lines];
  TERMINAL.lastFooterLines = [...footerLines];
  clearScreen();

  const rows = isInteractiveTty() ? (output.rows ?? 24) : null;
  if (rows == null) {
    for (const line of lines) {
      console.log(line);
    }
    if (footerLines.length > 0) {
      for (const line of footerLines) {
        console.log(line);
      }
    }
    return;
  }

  const promptReserve = 1;
  const bodyRows = Math.max(0, rows - footerLines.length - promptReserve);
  const visibleBody = lines.slice(0, bodyRows);

  for (const line of visibleBody) {
    console.log(line);
  }
  for (let i = visibleBody.length; i < bodyRows; i += 1) {
    console.log("");
  }
  for (const line of footerLines) {
    console.log(line);
  }
}

function redrawLastScreen() {
  if (!Array.isArray(TERMINAL.lastLines)) {
    return;
  }
  drawScreen(TERMINAL.lastLines, Array.isArray(TERMINAL.lastFooterLines) ? TERMINAL.lastFooterLines : []);
}

function padRight(text, width) {
  if (text.length >= width) {
    return text;
  }
  return text + " ".repeat(width - text.length);
}

function truncate(text, width) {
  if (width <= 0) {
    return "";
  }
  if (text.length <= width) {
    return text;
  }
  if (width <= 1) {
    return "…";
  }
  return `${text.slice(0, width - 1)}…`;
}

function keyValueLine(label, value, width) {
  const labelWidth = Math.min(22, Math.max(12, Math.floor(width * 0.42)));
  const valueWidth = Math.max(8, width - labelWidth - 1);
  const line = `${padRight(label, labelWidth)} ${truncate(value, valueWidth)}`;
  return truncate(line, width);
}

function renderTwoColumnPanels(leftTitle, leftRows, rightTitle, rightRows, totalWidth) {
  const gap = 3;
  const colWidth = Math.max(30, Math.floor((totalWidth - gap) / 2));
  const maxRows = Math.max(leftRows.length, rightRows.length);
  const lines = [];

  const leftTitleLine = paint(padRight(leftTitle, colWidth), `${COLOUR.bold}${COLOUR.blue}`);
  const rightTitleLine = paint(rightTitle, `${COLOUR.bold}${COLOUR.blue}`);
  lines.push(`${leftTitleLine}${" ".repeat(gap)}${rightTitleLine}`);

  for (let i = 0; i < maxRows; i += 1) {
    const left = leftRows[i] ?? "";
    const right = rightRows[i] ?? "";
    lines.push(`${padRight(truncate(left, colWidth), colWidth)}${" ".repeat(gap)}${truncate(right, colWidth)}`);
  }

  return lines;
}

function ensureRepoRoot() {
  if (!fs.existsSync(path.resolve(REPO_ROOT_MARKER))) {
    throw new Error("Run this script from the repository root");
  }
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, "\t")}\n`, "utf8");
}

function readWearGradle(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseWearVersionName(gradleText) {
  const match = gradleText.match(/versionName\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`Could not find versionName in ${PATHS.wearGradle}`);
  }
  return match[1];
}

function parseWearVersionCode(gradleText) {
  const match = gradleText.match(/versionCode\s*=\s*(\d+)/);
  if (!match) {
    throw new Error(`Could not find versionCode in ${PATHS.wearGradle}`);
  }
  return Number.parseInt(match[1], 10);
}

function parseSemver(version) {
  const match = version.match(SEMVER_RE);
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ?? "",
  };
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Stable releases rank higher than prereleases.
  if (a.prerelease === "" && b.prerelease !== "") return 1;
  if (a.prerelease !== "" && b.prerelease === "") return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

function getLastPublishedTagFromOrigin() {
  const result = spawnSync(
    "git",
    ["ls-remote", "--tags", "--refs", "origin"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return null;
  }

  const tags = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const ref = line.split(/\s+/)[1] ?? "";
      const name = ref.replace("refs/tags/", "");
      return name;
    })
    .filter((name) => TAG_RE.test(name))
    .map((name) => {
      const parsed = parseSemver(name.slice(1));
      return parsed ? { name, parsed } : null;
    })
    .filter(Boolean);

  if (tags.length === 0) {
    return null;
  }

  tags.sort((lhs, rhs) => compareSemver(lhs.parsed, rhs.parsed));
  return tags[tags.length - 1].name;
}

function bumpSemver(version, mode) {
  const parsed = parseSemver(version);
  if (!parsed) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  if (mode === "patch") {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
  if (mode === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  if (mode === "major") {
    return `${parsed.major + 1}.0.0`;
  }

  throw new Error(`Unsupported bump mode: ${mode}`);
}

function deriveTauriVersionCode(version) {
  const parsed = parseSemver(version);
  if (!parsed) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  // Tauri / Play formula: major*1000000 + minor*1000 + patch
  return parsed.major * 1_000_000 + parsed.minor * 1_000 + parsed.patch;
}

function deriveWearVersionCode(version) {
  // Keep Wear version codes in a separate range to avoid Play collisions.
  // watchVC = phoneVC + 1,000,000,000
  return deriveTauriVersionCode(version) + 1_000_000_000;
}

async function ask(rl, question, defaultValue = "") {
  const suffix = defaultValue === "" ? "" : ` [${defaultValue}]`;
  const answer = (await rl.question(`${paint("?", COLOUR.cyan)} ${question}${suffix}: `)).trim();
  return answer === "" ? defaultValue : answer;
}

async function askYesNo(rl, question, defaultYes = true) {
  const defaultText = defaultYes ? "Y/n" : "y/N";
  if (isInteractiveTty()) {
    while (true) {
      output.write(`${paint("?", COLOUR.cyan)} ${question} (${defaultText}): `);
      const key = await readSingleKey();
      const parsed = parseMenuKey(key, defaultYes ? "y" : "n");
      if (parsed.accepted === "y") {
        echoAcceptedKey(key, "y");
        return true;
      }
      if (parsed.accepted === "n") {
        echoAcceptedKey(key, "n");
        return false;
      }
      if (parsed.ctrlC) {
        throw new UserExit();
      }
      if (parsed.ignored) {
        continue;
      }
      echoAcceptedKey("", "");
      console.log(paint("Please enter y or n.", COLOUR.yellow));
    }
  }

  while (true) {
    const answer = (await rl.question(`${paint("?", COLOUR.cyan)} ${question} (${defaultText}): `))
      .trim()
      .toLowerCase();
    if (answer === "") {
      return defaultYes;
    }
    if (["y", "yes"].includes(answer)) {
      return true;
    }
    if (["n", "no"].includes(answer)) {
      return false;
    }
    console.log(paint("Please enter y or n.", COLOUR.yellow));
  }
}

async function askWithChoices(rl, question, defaultValue, choices, helpText = "") {
  const exact = new Map();
  const folded = new Map();
  for (const choice of choices) {
    exact.set(choice, choice);
    const key = choice.toLowerCase();
    if (!folded.has(key)) {
      folded.set(key, choice);
    } else if (folded.get(key) !== choice) {
      folded.set(key, null);
    }
  }

  const canUseSingleKey = isInteractiveTty() && choices.every((choice) => choice.length === 1);
  while (true) {
    if (helpText) {
      console.log(paint(helpText, COLOUR.grey));
    }
    if (canUseSingleKey) {
      output.write(`${paint("?", COLOUR.cyan)} ${question} [${defaultValue}]: `);
      const key = await readSingleKey();
      const parsed = parseMenuKey(key, defaultValue);
      if (parsed.ctrlC) {
        throw new UserExit();
      }
      if (parsed.goBack) {
        const backChoice = resolveChoice("b", exact, folded);
        if (backChoice != null) {
          echoAcceptedKey(key, backChoice);
          return backChoice;
        }
        continue;
      }
      if (parsed.ignored) {
        continue;
      }
      const resolved = resolveChoice(parsed.accepted, exact, folded);
      if (resolved != null) {
        echoAcceptedKey(key, resolved);
        return resolved;
      }
      echoAcceptedKey("", "");
      console.log(paint(`Choose one of: ${choices.join(", ")}`, COLOUR.yellow));
      continue;
    }

    const answer = (await rl.question(`${paint("?", COLOUR.cyan)} ${question} [${defaultValue}]: `))
      .trim();
    const candidate = answer === "" ? defaultValue : answer;
    const resolved = resolveChoice(candidate, exact, folded);
    if (resolved != null) {
      return resolved;
    }
    console.log(paint(`Choose one of: ${choices.join(", ")}`, COLOUR.yellow));
  }
}

async function askWithChoicesEnhanced(
  rl,
  question,
  defaultValue,
  choices,
  helpText = "",
  cycleChoices = [],
) {
  const exact = new Map();
  const folded = new Map();
  for (const choice of choices) {
    exact.set(choice, choice);
    const key = choice.toLowerCase();
    if (!folded.has(key)) {
      folded.set(key, choice);
    } else if (folded.get(key) !== choice) {
      folded.set(key, null);
    }
  }

  const canUseSingleKey = isInteractiveTty() && choices.every((choice) => choice.length === 1);
  const cycleEnabled =
    canUseSingleKey &&
    Array.isArray(cycleChoices) &&
    cycleChoices.length > 1 &&
    cycleChoices.every((item) => typeof item?.key === "string" && choices.includes(item.key));

  let selectedIndex = 0;
  if (cycleEnabled) {
    const exactIndex = cycleChoices.findIndex((item) => item.key === defaultValue);
    if (exactIndex >= 0) {
      selectedIndex = exactIndex;
    } else {
      const foldedIndex = cycleChoices.findIndex(
        (item) => item.key.toLowerCase() === defaultValue.toLowerCase(),
      );
      if (foldedIndex >= 0) {
        selectedIndex = foldedIndex;
      }
    }
  }

  while (true) {
    if (helpText) {
      console.log(paint(helpText, COLOUR.grey));
    }
    if (canUseSingleKey) {
      const activeDefault = cycleEnabled ? cycleChoices[selectedIndex].key : defaultValue;
      if (cycleEnabled) {
        writeCyclingPrompt(question, cycleChoices, selectedIndex);
      } else {
        output.write(`${paint("?", COLOUR.cyan)} ${question} [${activeDefault}]: `);
      }

      const key = await readSingleKey();
      const parsed = parseMenuKey(key, activeDefault);
      if (parsed.ctrlC) {
        throw new UserExit();
      }
      if (parsed.goBack) {
        const backChoice = resolveChoice("b", exact, folded);
        if (backChoice != null) {
          echoAcceptedKey(key, backChoice);
          return backChoice;
        }
        continue;
      }
      if (parsed.ignored) {
        continue;
      }
      if (cycleEnabled && (parsed.arrow === "left" || parsed.arrow === "right")) {
        if (parsed.arrow === "left") {
          selectedIndex = (selectedIndex - 1 + cycleChoices.length) % cycleChoices.length;
        } else {
          selectedIndex = (selectedIndex + 1) % cycleChoices.length;
        }
        continue;
      }

      const resolved = resolveChoice(parsed.accepted, exact, folded);
      if (resolved != null) {
        echoAcceptedKey(key, resolved);
        return resolved;
      }
      echoAcceptedKey("", "");
      console.log(paint(`Choose one of: ${choices.join(", ")}`, COLOUR.yellow));
      continue;
    }

    const answer = (await rl.question(`${paint("?", COLOUR.cyan)} ${question} [${defaultValue}]: `))
      .trim();
    const candidate = answer === "" ? defaultValue : answer;
    const resolved = resolveChoice(candidate, exact, folded);
    if (resolved != null) {
      return resolved;
    }
    console.log(paint(`Choose one of: ${choices.join(", ")}`, COLOUR.yellow));
  }
}

function resolveChoice(candidate, exact, folded) {
  if (candidate == null) {
    return null;
  }
  if (exact.has(candidate)) {
    return exact.get(candidate);
  }
  const foldedMatch = folded.get(candidate.toLowerCase());
  return foldedMatch ?? null;
}

function readSingleKey() {
  return new Promise((resolve) => {
    if (!isInteractiveTty() || typeof input.setRawMode !== "function") {
      resolve("");
      return;
    }

    const wasRaw = Boolean(input.isRaw);
    const onData = (buffer) => {
      cleanup();
      resolve(buffer.toString("utf8"));
    };
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(wasRaw);
    };

    input.setRawMode(true);
    input.resume();
    input.once("data", onData);
  });
}

function parseMenuKey(key, defaultValue) {
  const mouseEvent = parseMouseEvent(key);
  if (mouseEvent?.type === "wheel-up") {
    return { accepted: null, ctrlC: false, arrow: "left", ignored: false, goBack: false };
  }
  if (mouseEvent?.type === "wheel-down") {
    return { accepted: null, ctrlC: false, arrow: "right", ignored: false, goBack: false };
  }
  if (mouseEvent?.type === "left-click") {
    return { accepted: defaultValue, ctrlC: false, arrow: null, ignored: false, goBack: false };
  }
  if (mouseEvent?.type === "middle-click") {
    return { accepted: defaultValue, ctrlC: false, arrow: null, ignored: false, goBack: false };
  }
  if (mouseEvent?.type === "right-click" || mouseEvent?.type === "back-click") {
    return { accepted: null, ctrlC: false, arrow: null, ignored: false, goBack: true };
  }

  if (key === "\u0003") {
    return { accepted: null, ctrlC: true, arrow: null, ignored: false, goBack: false };
  }
  if (key === "\u001b[D") {
    return { accepted: null, ctrlC: false, arrow: "left", ignored: false, goBack: false };
  }
  if (key === "\u001b[C") {
    return { accepted: null, ctrlC: false, arrow: "right", ignored: false, goBack: false };
  }
  if (key === "\r" || key === "\n" || key === "") {
    return { accepted: defaultValue, ctrlC: false, arrow: null, ignored: false, goBack: false };
  }
  if (key.startsWith("\u001b")) {
    // Ignore other escape sequences (mouse wheel, focus events, non-mapped keys).
    return { accepted: null, ctrlC: false, arrow: null, ignored: true, goBack: false };
  }
  return { accepted: key, ctrlC: false, arrow: null, ignored: false, goBack: false };
}

function parseMouseEvent(key) {
  // SGR mouse sequences look like: ESC [ < Cb ; Cx ; Cy (M|m)
  // Example wheel up: ESC[<64;84;20M
  const match = key.match(/^\u001b\[<(\d+);(\d+);(\d+)([mM])$/);
  if (!match) {
    return null;
  }

  const buttonCode = Number.parseInt(match[1], 10);
  const state = match[4];

  if (state === "M" && buttonCode === 64) {
    return { type: "wheel-up" };
  }
  if (state === "M" && buttonCode === 65) {
    return { type: "wheel-down" };
  }
  if (state === "M" && (buttonCode & 0b11) === 0 && buttonCode < 64) {
    return { type: "left-click" };
  }
  if (state === "M" && (buttonCode & 0b11) === 1 && buttonCode < 64) {
    return { type: "middle-click" };
  }
  if (state === "M" && (buttonCode & 0b11) === 2 && buttonCode < 64) {
    return { type: "right-click" };
  }
  if (state === "M" && (buttonCode === 8 || buttonCode === 9)) {
    return { type: "back-click" };
  }
  return { type: "other" };
}

function echoAcceptedKey(key, displayValue) {
  if (key === "\r" || key === "\n" || key === "") {
    console.log(paint(displayValue, COLOUR.grey));
    return;
  }
  if (key.startsWith("\u001b")) {
    console.log("");
    return;
  }
  console.log(paint(displayValue, COLOUR.grey));
}

function writeCyclingPrompt(question, cycleChoices, selectedIndex) {
  const options = cycleChoices
    .map((item, index) => (index === selectedIndex ? paint(`[${item.label}]`, COLOUR.cyan) : item.label))
    .join("  ");
  output.write(
    `\r\x1b[2K${paint("?", COLOUR.cyan)} ${question}: ${options}  ${paint("(←/→ to cycle, Enter to accept)", COLOUR.grey)}`,
  );
}

async function showHelpScreen(rl) {
  clearScreen();
  console.log(paint("Threshold Release TUI — Help", `${COLOUR.bold}${COLOUR.magenta}`));
  console.log(divider());
  console.log(paint("Global", `${COLOUR.bold}${COLOUR.blue}`));
  console.log("- h: open this help screen");
  console.log("- q: quit");
  console.log("- Enter: accept default value for prompts");
  console.log(divider());
  console.log(paint("Version Step", `${COLOUR.bold}${COLOUR.blue}`));
  console.log("- 1/p: patch bump");
  console.log("- 2/m: minor bump");
  console.log("- 3/M: major bump");
  console.log("- 4/c: custom semantic version");
  console.log(divider());
  console.log(paint("Tag Conflict Step", `${COLOUR.bold}${COLOUR.blue}`));
  console.log("- 1/d: choose a different tag");
  console.log("- 2/u: update local tag to current HEAD");
  console.log(divider());
  console.log(paint("Review Step", `${COLOUR.bold}${COLOUR.blue}`));
  console.log("- a: apply all changes");
  console.log("- b: go back and restart wizard");
  console.log(divider());
  await ask(rl, "Press Enter to return");
}

function tagExistsLocally(tagName) {
  const result = spawnSync("git", ["tag", "--list", tagName], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() === tagName;
}

function tagExistsOnOrigin(tagName) {
  const result = spawnSync("git", ["ls-remote", "--tags", "origin", `refs/tags/${tagName}`], {
    encoding: "utf8",
  });
  return result.status === 0 && result.stdout.trim() !== "";
}

function listLocalReleaseTags(limit = 12) {
  const result = spawnSync(
    "git",
    [
      "for-each-ref",
      "refs/tags",
      "--sort=-creatordate",
      `--count=${limit}`,
      "--format=%(refname:short)|%(creatordate:short)",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const [name, createdAt] = line.split("|");
      return {
        name,
        createdAt: createdAt ?? "unknown",
      };
    })
    .filter((tag) => TAG_RE.test(tag.name));
}

function findLocalTagDate(tagName) {
  const result = spawnSync(
    "git",
    ["for-each-ref", `refs/tags/${tagName}`, "--format=%(creatordate:short)"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return null;
  }
  const value = result.stdout.trim();
  return value === "" ? null : value;
}

function updateLocalTagToHead(tagName) {
  const result = spawnSync("git", ["tag", "-f", tagName], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Failed to update local tag ${tagName}: ${result.stderr.trim()}`);
  }
}

function updateWearGradle(gradleText, versionName, versionCode) {
  let outputText = gradleText;

  outputText = outputText.replace(
    /versionName\s*=\s*"[^"]+"/,
    `versionName = "${versionName}"`,
  );
  outputText = outputText.replace(
    /versionCode\s*=\s*\d+/,
    `versionCode = ${versionCode}`,
  );

  return outputText;
}

function renderStatusBoard(currentState, draftState = {}, message = "", footerLines = [], extraLines = []) {
  const width = getTerminalWidth();
  const gap = 3;
  const panelWidth = width >= 110 ? Math.max(30, Math.floor((width - gap) / 2)) : width;
  const lines = [];
  const anchoredBottomLines = [];

  lines.push(paint("Threshold Release TUI", `${COLOUR.bold}${COLOUR.magenta}`));
  lines.push(divider(width));
  if (message) {
    lines.push(paint(message, COLOUR.cyan));
    lines.push(divider(width));
  }

  const currentRows = [
    keyValueLine("Phone version", currentState.tauriVersionName, panelWidth),
    keyValueLine("Phone code derived", String(currentState.tauriDerivedVersionCode), panelWidth),
    keyValueLine("Phone code override", String(currentState.tauriVersionCode ?? "unset"), panelWidth),
    keyValueLine("Web package version", currentState.webVersion, panelWidth),
    keyValueLine("Wear version", currentState.wearVersionName, panelWidth),
    keyValueLine("Wear code", String(currentState.wearVersionCode), panelWidth),
  ];
  if (SHOW_PUBLISHED_TAG_IN_STATUS) {
    currentRows.push(
      keyValueLine(
        "Last published tag",
        currentState.lastPublishedTag == null
          ? "none"
          : `${currentState.lastPublishedTag}${currentState.lastPublishedTagDate ? ` (${currentState.lastPublishedTagDate})` : ""}`,
        panelWidth,
      ),
    );
  }

  const draftRows = [
    keyValueLine("Phone version", String(draftState.versionName ?? "-"), panelWidth),
    keyValueLine(
      "Phone code derived",
      String(draftState.tauriDerivedVersionCode != null ? draftState.tauriDerivedVersionCode : "-"),
      panelWidth,
    ),
    keyValueLine(
      "Phone code override",
      currentState.tauriVersionCode == null
        ? "leave unset"
        : String(draftState.tauriDerivedVersionCode != null ? draftState.tauriDerivedVersionCode : "-"),
      panelWidth,
    ),
    keyValueLine(
      "Web package version",
      draftState.updateWebVersion == null
        ? "(decide)"
        : draftState.updateWebVersion
          ? String(draftState.versionName ?? "-")
          : "unchanged",
      panelWidth,
    ),
    keyValueLine("Wear version", String(draftState.versionName ?? "-"), panelWidth),
    keyValueLine("Wear code", String(draftState.wearVersionCode != null ? draftState.wearVersionCode : "-"), panelWidth),
    keyValueLine("Tag", String(draftState.tagName ?? "-"), panelWidth),
    keyValueLine("Update web version", draftState.updateWebVersion == null ? "-" : draftState.updateWebVersion ? "yes" : "no", panelWidth),
  ];

  if (width >= 110) {
    lines.push(...renderTwoColumnPanels("Current", currentRows, "Draft", draftRows, width));
  } else {
    lines.push(paint("Current", `${COLOUR.bold}${COLOUR.blue}`));
    for (const row of currentRows) {
      lines.push(row);
    }
    lines.push(divider(width));
    lines.push(paint("Draft", `${COLOUR.bold}${COLOUR.blue}`));
    for (const row of draftRows) {
      lines.push(row);
    }
  }

  if (currentState.tauriVersionName !== currentState.webVersion) {
    anchoredBottomLines.push(paint("Warning: Tauri and web package versions are out of sync.", COLOUR.yellow));
  }

  if (extraLines.length > 0) {
    lines.push(divider(width));
    lines.push(...extraLines);
  }

  const footer = [];
  if (anchoredBottomLines.length > 0 || footerLines.length > 0) {
    footer.push(divider(width));
  }
  if (anchoredBottomLines.length > 0) {
    footer.push(...anchoredBottomLines);
  }
  if (anchoredBottomLines.length > 0 && footerLines.length > 0) {
    footer.push(divider(width));
  }
  if (footerLines.length > 0) {
    footer.push(...footerLines);
  }
  drawScreen(lines, footer);
}

function renderRecentTags(tags) {
  console.log(paint("Recent release tags", `${COLOUR.bold}${COLOUR.blue}`));
  if (tags.length === 0) {
    console.log(paint("No local release tags found.", COLOUR.grey));
    return;
  }

  for (const tag of tags) {
    const version = tag.name.startsWith("v") ? tag.name.slice(1) : tag.name;
    console.log(`- ${paint(tag.name, COLOUR.green)}  ${paint(`(version ${version})`, COLOUR.grey)}  ${paint(tag.createdAt, COLOUR.grey)}`);
  }
}

async function chooseVersionName(rl, currentState, draftState) {
  while (true) {
    renderStatusBoard(
      currentState,
      draftState,
      "",
      [
        paint("Step: Choose version bump", COLOUR.cyan),
        "Options: [1/p] patch  [2/m] minor  [3/M] major  [4/c] custom  [h/?] help  [q] quit",
        paint("Shortcuts: ←/→=cycle bump, Enter=accept, p/m/M/c direct pick, h/?=help, q=quit", COLOUR.grey),
      ],
    );
    const choice = await askWithChoicesEnhanced(
      rl,
      "Select option",
      "1",
      ["1", "2", "3", "4", "p", "m", "M", "c", "h", "?", "q"],
      "",
      [
        { key: "1", label: "Patch" },
        { key: "2", label: "Minor" },
        { key: "3", label: "Major" },
        { key: "4", label: "Custom" },
      ],
    );

    if (choice === "q") {
      throw new UserExit();
    }
    if (choice === "h" || choice === "?") {
      await showHelpScreen(rl);
      continue;
    }
    if (choice === "1" || choice === "p") {
      return bumpSemver(currentState.tauriVersionName, "patch");
    }
    if (choice === "2" || choice === "m") {
      return bumpSemver(currentState.tauriVersionName, "minor");
    }
    if (choice === "3" || choice === "M") {
      return bumpSemver(currentState.tauriVersionName, "major");
    }
    if (choice === "4" || choice === "c") {
      const candidate = await ask(rl, "Enter custom semantic version", currentState.tauriVersionName);
      if (!SEMVER_RE.test(candidate)) {
        console.log(paint("Version must be semantic (e.g. 0.2.0 or 0.2.0-rc.1).", COLOUR.yellow));
        continue;
      }
      return candidate;
    }
  }
}

async function chooseTag(rl, currentState, draftState, defaultTag) {
  const tags = listLocalReleaseTags();

  while (true) {
    renderStatusBoard(currentState, draftState, "Validate release tag");
    renderRecentTags(tags);
    console.log(divider());

    const tagName = await ask(rl, "Release tag", defaultTag);
    if (!TAG_RE.test(tagName)) {
      console.log(paint("Tag must look like vX.Y.Z or vX.Y.Z-suffix.", COLOUR.yellow));
      continue;
    }

    const localExists = tagExistsLocally(tagName);
    const remoteExists = tagExistsOnOrigin(tagName);
    if (!localExists && !remoteExists) {
      return { tagName, updateExistingLocalTag: false };
    }

    const localDate = localExists ? findLocalTagDate(tagName) : null;
    const location = `${localExists ? "local" : ""}${localExists && remoteExists ? " + " : ""}${remoteExists ? "origin" : ""}`;
    // If only a local tag exists, default to updating it so Enter can progress.
    const defaultConflictChoice = localExists && !remoteExists ? "2" : "1";
    const extras = [];
    if (localDate) {
      extras.push(`Local tag date: ${paint(localDate, COLOUR.yellow)}`);
    }
    extras.push(`Location: ${paint(location, COLOUR.yellow)}`);
    if (remoteExists) {
      extras.push(paint("Note: updating remote tag requires manual force-push.", COLOUR.yellow));
    }
    renderStatusBoard(
      currentState,
      draftState,
      `Tag conflict for ${tagName}`,
      [
        "Options: [1/d] different tag  [2/u] update local tag  [h/?] help  [q] quit",
        paint("Shortcuts: d=different tag, u=update local tag, h/?=help, q=quit", COLOUR.grey),
      ],
      extras,
    );

    const choice = await askWithChoices(
      rl,
      "Select option",
      defaultConflictChoice,
      ["1", "2", "d", "u", "h", "?", "q"],
      "",
    );
    if (choice === "q") {
      throw new UserExit();
    }
    if (choice === "h" || choice === "?") {
      await showHelpScreen(rl);
      continue;
    }
    if (choice === "1" || choice === "d") {
      continue;
    }
    if (choice === "2" || choice === "u") {
      return { tagName, updateExistingLocalTag: true };
    }
  }
}

function buildPreview(currentState, nextState) {
  return [
    {
      file: PATHS.tauriConf,
      field: "version",
      from: currentState.tauriVersionName,
      to: nextState.versionName,
    },
    {
      file: "(derived)",
      field: "tauri android versionCode",
      from: String(currentState.tauriDerivedVersionCode),
      to: String(nextState.tauriDerivedVersionCode),
    },
    {
      file: PATHS.tauriConf,
      field: "bundle.android.versionCode (override)",
      from: currentState.tauriVersionCode ?? "(not set)",
      to:
        currentState.tauriVersionCode == null
          ? "(leave unset)"
          : String(nextState.tauriDerivedVersionCode),
    },
    {
      file: PATHS.wearGradle,
      field: "versionName",
      from: currentState.wearVersionName,
      to: nextState.versionName,
    },
    {
      file: PATHS.wearGradle,
      field: "versionCode",
      from: String(currentState.wearVersionCode),
      to: String(nextState.wearVersionCode),
    },
    {
      file: PATHS.webPackage,
      field: "version",
      from: currentState.webVersion,
      to: nextState.versionName,
      skipped: !nextState.updateWebVersion,
    },
  ];
}

function applyChanges(nextState) {
  const changedFiles = [];

  const tauriConf = readJson(PATHS.tauriConf);
  const tauriBefore = JSON.stringify(tauriConf);
  tauriConf.version = nextState.versionName;
  if (tauriConf.bundle?.android?.versionCode != null) {
    tauriConf.bundle.android.versionCode = nextState.tauriDerivedVersionCode;
  }
  const tauriAfter = JSON.stringify(tauriConf);
  if (tauriBefore !== tauriAfter) {
    writeJson(PATHS.tauriConf, tauriConf);
    changedFiles.push(PATHS.tauriConf);
  }

  const wearGradle = readWearGradle(PATHS.wearGradle);
  const updatedWearGradle = updateWearGradle(
    wearGradle,
    nextState.versionName,
    nextState.wearVersionCode,
  );
  if (updatedWearGradle !== wearGradle) {
    fs.writeFileSync(PATHS.wearGradle, updatedWearGradle, "utf8");
    changedFiles.push(PATHS.wearGradle);
  }

  if (nextState.updateWebVersion) {
    const webPackage = readJson(PATHS.webPackage);
    const webBefore = JSON.stringify(webPackage);
    webPackage.version = nextState.versionName;
    const webAfter = JSON.stringify(webPackage);
    if (webBefore !== webAfter) {
      writeJson(PATHS.webPackage, webPackage);
      changedFiles.push(PATHS.webPackage);
    }
  }

  return changedFiles;
}

async function maybeUpdateOrCreateTag(rl, currentState, draftState, tagName, updateExistingLocalTag) {
  renderStatusBoard(currentState, draftState, "Tag operation");
  const actionLabel = updateExistingLocalTag
    ? `Update local tag ${tagName} to current HEAD`
    : `Create local tag ${tagName}`;
  const shouldApply = await askYesNo(rl, `${actionLabel} now`, false);
  if (!shouldApply) {
    return;
  }

  if (updateExistingLocalTag) {
    updateLocalTagToHead(tagName);
    console.log(paint(`Updated local tag ${tagName}.`, COLOUR.green));
    if (tagExistsOnOrigin(tagName)) {
      console.log(paint(`Remote ${tagName} still points to previous commit until manual force-push.`, COLOUR.yellow));
    }
    return;
  }

  const result = spawnSync("git", ["tag", tagName], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Failed to create tag ${tagName}: ${result.stderr.trim()}`);
  }
  console.log(paint(`Created local tag ${tagName}.`, COLOUR.green));
}

async function main() {
  ensureRepoRoot();
  enterAltScreen();

  const tauriConf = readJson(PATHS.tauriConf);
  const webPackage = readJson(PATHS.webPackage);
  const wearGradle = readWearGradle(PATHS.wearGradle);

  const lastPublishedTag = getLastPublishedTagFromOrigin();
  const currentState = {
    tauriVersionName: tauriConf.version,
    tauriVersionCode: tauriConf.bundle?.android?.versionCode ?? null,
    tauriDerivedVersionCode: deriveTauriVersionCode(tauriConf.version),
    webVersion: webPackage.version,
    wearVersionName: parseWearVersionName(wearGradle),
    wearVersionCode: parseWearVersionCode(wearGradle),
    lastPublishedTag,
    lastPublishedTagDate: lastPublishedTag ? findLocalTagDate(lastPublishedTag) : null,
  };

  if (!SEMVER_RE.test(currentState.tauriVersionName)) {
    throw new Error(`Current Tauri version is not semver: ${currentState.tauriVersionName}`);
  }
  if (!SEMVER_RE.test(currentState.wearVersionName)) {
    throw new Error(`Current Wear version is not semver: ${currentState.wearVersionName}`);
  }

  const rl = createInterface({ input, output });
  const handleInterrupt = () => {
    rl.close();
    leaveAltScreen();
    process.exit(0);
  };
  const handleResize = () => {
    redrawLastScreen();
  };
  process.on("SIGINT", handleInterrupt);
  process.on("SIGTERM", handleInterrupt);
  process.on("SIGWINCH", handleResize);
  try {
    while (true) {
      const draftState = {};

      draftState.versionName = await chooseVersionName(rl, currentState, draftState);
      draftState.tauriDerivedVersionCode = deriveTauriVersionCode(draftState.versionName);
      draftState.wearVersionCode = deriveWearVersionCode(draftState.versionName);

      const tagSelection = await chooseTag(
        rl,
        currentState,
        draftState,
        `v${draftState.versionName}`,
      );
      draftState.tagName = tagSelection.tagName;
      draftState.updateExistingLocalTag = tagSelection.updateExistingLocalTag;

      renderStatusBoard(
        currentState,
        draftState,
        `Derived codes: phone ${draftState.tauriDerivedVersionCode}, wear ${draftState.wearVersionCode}`,
      );

      renderStatusBoard(currentState, draftState, "Optional web package version sync");
      draftState.updateWebVersion = await askYesNo(
        rl,
        "Also update apps/threshold/package.json version",
        false,
      );

      const nextState = {
        versionName: draftState.versionName,
        tagName: draftState.tagName,
        updateExistingLocalTag: draftState.updateExistingLocalTag,
        tauriDerivedVersionCode: draftState.tauriDerivedVersionCode,
        wearVersionCode: draftState.wearVersionCode,
        updateWebVersion: draftState.updateWebVersion,
      };

      renderStatusBoard(
        currentState,
        draftState,
        "Planned updates",
        [
          "Actions: [a] apply  [b] back/restart  [h/?] help  [q] quit",
        ],
      );
      for (const change of buildPreview(currentState, nextState)) {
        if (change.skipped) {
          console.log(`- ${change.file} :: ${change.field}: ${paint("skipped", COLOUR.grey)}`);
          continue;
        }
        console.log(
          `- ${change.file} :: ${change.field}: ${paint(String(change.from), COLOUR.red)} -> ${paint(String(change.to), COLOUR.green)}`,
        );
      }
      console.log(
        `- Tag target: ${paint(
          `${nextState.tagName}${nextState.updateExistingLocalTag ? " (update local tag)" : ""}`,
          COLOUR.yellow,
        )}`,
      );
      console.log(divider());

      const applyAction = await askWithChoices(
        rl,
        "Apply changes",
        "a",
        ["a", "b", "h", "?", "q"],
        "",
      );
      if (applyAction === "q") {
        throw new UserExit();
      }
      if (applyAction === "h" || applyAction === "?") {
        await showHelpScreen(rl);
        continue;
      }
      if (applyAction === "b") {
        continue;
      }

      const changedFiles = applyChanges(nextState);
      if (changedFiles.length > 0) {
        console.log(paint(`Version updates applied (${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"}).`, COLOUR.green));
      } else {
        console.log(paint("No version file changes were needed; continuing with tag workflow.", COLOUR.yellow));
      }

      await maybeUpdateOrCreateTag(
        rl,
        currentState,
        draftState,
        nextState.tagName,
        nextState.updateExistingLocalTag,
      );

      console.log("");
      console.log(paint("Next steps", `${COLOUR.bold}${COLOUR.blue}`));
      console.log("- Review changes with: git diff");
      console.log("- Run checks/builds before committing.");
      console.log("- Push tags manually if needed.");
      break;
    }
  } finally {
    process.off("SIGINT", handleInterrupt);
    process.off("SIGTERM", handleInterrupt);
    process.off("SIGWINCH", handleResize);
    rl.close();
    leaveAltScreen();
  }
}

main()
  .catch((error) => {
    if (error instanceof UserExit) {
      return;
    }
    // Readline can surface Ctrl+C as AbortError in some terminals/runners.
    if (error?.name === "AbortError" || /ctrl\+c/i.test(String(error?.message ?? ""))) {
      return;
    }
    console.error(paint(`Error: ${error.message}`, COLOUR.red));
    process.exitCode = 1;
  })
  .finally(() => {
    leaveAltScreen();
  });
