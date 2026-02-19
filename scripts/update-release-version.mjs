// Interactive release version updater for the Tauri phone app and Wear OS companion app
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

async function ask(rl, question, defaultValue = "") {
  const suffix = defaultValue === "" ? "" : ` [${defaultValue}]`;
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer === "" ? defaultValue : answer;
}

async function askYesNo(rl, question, defaultYes = true) {
  const defaultText = defaultYes ? "Y/n" : "y/N";
  while (true) {
    const answer = (await rl.question(`${question} (${defaultText}): `)).trim().toLowerCase();
    if (answer === "") {
      return defaultYes;
    }
    if (["y", "yes"].includes(answer)) {
      return true;
    }
    if (["n", "no"].includes(answer)) {
      return false;
    }
    console.log("Please enter y or n.");
  }
}

async function askVersionCode(rl, label, currentCode) {
  while (true) {
    const proposed = await ask(rl, label, String(currentCode + 1));
    const parsed = Number.parseInt(proposed, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      console.log("Version code must be a positive integer.");
      continue;
    }
    if (parsed < currentCode) {
      console.log(`Version code should not decrease (current: ${currentCode}).`);
      continue;
    }
    return parsed;
  }
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

function printRecentTags() {
  const tags = listLocalReleaseTags();
  if (tags.length === 0) {
    console.log("Recent release tags: none found locally");
    console.log("");
    return;
  }

  console.log("Recent release tags");
  for (const tag of tags) {
    const version = tag.name.startsWith("v") ? tag.name.slice(1) : tag.name;
    console.log(`- ${tag.name} (version ${version}) — ${tag.createdAt}`);
  }
  console.log("");
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

  if (outputText === gradleText) {
    throw new Error("No changes were applied to wear build.gradle.kts");
  }

  return outputText;
}

function printSummary(currentState) {
  console.log("");
  console.log("Current versions");
  console.log(`- Phone app version name (Tauri): ${currentState.tauriVersionName}`);
  console.log(
    `- Phone Android version code (derived): ${currentState.tauriDerivedVersionCode}`,
  );
  console.log(
    `- Phone Android version code (configured override): ${currentState.tauriVersionCode ?? "(not set)"}`,
  );
  console.log(`- Phone web package version: ${currentState.webVersion}`);
  console.log(`- Wear app version name: ${currentState.wearVersionName}`);
  console.log(`- Wear app version code: ${currentState.wearVersionCode}`);
  console.log("");
}

async function chooseVersionName(rl, currentVersion) {
  console.log("Release version options");
  console.log("1) patch");
  console.log("2) minor");
  console.log("3) major");
  console.log("4) custom");

  while (true) {
    const choice = await ask(rl, "Choose release type", "1");
    if (choice === "1") {
      return bumpSemver(currentVersion, "patch");
    }
    if (choice === "2") {
      return bumpSemver(currentVersion, "minor");
    }
    if (choice === "3") {
      return bumpSemver(currentVersion, "major");
    }
    if (choice === "4") {
      const candidate = await ask(rl, "Enter custom semantic version", currentVersion);
      if (!SEMVER_RE.test(candidate)) {
        console.log("Version must follow semantic versioning (e.g. 0.2.0 or 0.2.0-rc.1).");
        continue;
      }
      return candidate;
    }
    console.log("Choose 1, 2, 3, or 4.");
  }
}

async function chooseTag(rl, defaultTag) {
  printRecentTags();

  while (true) {
    const tagName = await ask(rl, "Release tag to validate", defaultTag);
    if (!TAG_RE.test(tagName)) {
      console.log("Tag must look like vX.Y.Z or vX.Y.Z-suffix.");
      continue;
    }

    const localExists = tagExistsLocally(tagName);
    const remoteExists = tagExistsOnOrigin(tagName);
    if (!localExists && !remoteExists) {
      return { tagName, updateExistingLocalTag: false };
    }

    const localDate = localExists ? findLocalTagDate(tagName) : null;
    console.log(
      `Tag ${tagName} already exists${localExists ? " locally" : ""}${localExists && remoteExists ? " and" : ""}${remoteExists ? " on origin" : ""}.`,
    );
    if (localDate) {
      console.log(`- Existing local tag date: ${localDate}`);
    }
    console.log("Tag conflict options");
    console.log("1) enter a different tag");
    console.log("2) update local tag to current HEAD");
    if (remoteExists) {
      console.log("Note: remote tag exists; changing remote tag requires manual force-push.");
    }

    const choice = await ask(rl, "Choose option", "1");
    if (choice === "1") {
      continue;
    }
    if (choice === "2") {
      return { tagName, updateExistingLocalTag: true };
    }
    console.log("Choose 1 or 2.");
  }
}

function buildPreview(currentState, nextState) {
  const preview = [
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
      to: currentState.tauriVersionCode == null ? "(leave unset)" : String(nextState.tauriDerivedVersionCode),
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
  return preview;
}

function applyChanges(currentState, nextState) {
  const tauriConf = readJson(PATHS.tauriConf);
  tauriConf.version = nextState.versionName;
  if (tauriConf.bundle?.android?.versionCode != null) {
    tauriConf.bundle.android.versionCode = nextState.tauriDerivedVersionCode;
  }
  writeJson(PATHS.tauriConf, tauriConf);

  const wearGradle = readWearGradle(PATHS.wearGradle);
  const updatedWearGradle = updateWearGradle(
    wearGradle,
    nextState.versionName,
    nextState.wearVersionCode,
  );
  fs.writeFileSync(PATHS.wearGradle, updatedWearGradle, "utf8");

  if (nextState.updateWebVersion) {
    const webPackage = readJson(PATHS.webPackage);
    webPackage.version = nextState.versionName;
    writeJson(PATHS.webPackage, webPackage);
  }
}

async function maybeUpdateOrCreateTag(rl, tagName, updateExistingLocalTag) {
  const actionLabel = updateExistingLocalTag
    ? `Update local git tag ${tagName} to current HEAD now`
    : `Create local git tag ${tagName} now`;
  const shouldApply = await askYesNo(rl, actionLabel, false);
  if (!shouldApply) {
    return;
  }

  if (updateExistingLocalTag) {
    updateLocalTagToHead(tagName);
    console.log(`Updated local tag ${tagName}.`);
    if (tagExistsOnOrigin(tagName)) {
      console.log(`Remote ${tagName} still points to its previous commit until you force-push the tag.`);
    }
    return;
  }

  const result = spawnSync("git", ["tag", tagName], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Failed to create tag ${tagName}: ${result.stderr.trim()}`);
  }
  console.log(`Created local tag ${tagName}.`);
}

async function main() {
  ensureRepoRoot();

  const tauriConf = readJson(PATHS.tauriConf);
  const webPackage = readJson(PATHS.webPackage);
  const wearGradle = readWearGradle(PATHS.wearGradle);

  const currentState = {
    tauriVersionName: tauriConf.version,
    tauriVersionCode: tauriConf.bundle?.android?.versionCode ?? null,
    tauriDerivedVersionCode: deriveTauriVersionCode(tauriConf.version),
    webVersion: webPackage.version,
    wearVersionName: parseWearVersionName(wearGradle),
    wearVersionCode: parseWearVersionCode(wearGradle),
  };

  if (!SEMVER_RE.test(currentState.tauriVersionName)) {
    throw new Error(`Current Tauri version is not semver: ${currentState.tauriVersionName}`);
  }
  if (!SEMVER_RE.test(currentState.wearVersionName)) {
    throw new Error(`Current Wear version is not semver: ${currentState.wearVersionName}`);
  }

  const rl = createInterface({ input, output });
  try {
    printSummary(currentState);
    if (currentState.tauriVersionName !== currentState.webVersion) {
      console.log(
        "Warning: Tauri version and web package version are currently out of sync. This tool will align them.",
      );
      console.log("");
    }

    const versionName = await chooseVersionName(rl, currentState.tauriVersionName);
    const tagSelection = await chooseTag(rl, `v${versionName}`);
    const { tagName, updateExistingLocalTag } = tagSelection;
    const tauriDerivedVersionCode = deriveTauriVersionCode(versionName);
    console.log(
      `Derived phone Android version code from ${versionName}: ${tauriDerivedVersionCode}`,
    );
    const wearVersionCode = await askVersionCode(
      rl,
      "Wear Android version code",
      Math.max(currentState.wearVersionCode, tauriDerivedVersionCode - 1),
    );
    const nextState = {
      versionName,
      tagName,
      updateExistingLocalTag,
      tauriDerivedVersionCode,
      wearVersionCode,
      updateWebVersion: await askYesNo(
        rl,
        "Also update apps/threshold/package.json version",
        false,
      ),
    };

    console.log("");
    console.log("Planned updates");
    for (const change of buildPreview(currentState, nextState)) {
      if (change.skipped) {
        console.log(`- ${change.file} :: ${change.field}: skipped`);
        continue;
      }
      console.log(`- ${change.file} :: ${change.field}: ${change.from} -> ${change.to}`);
    }
    console.log(
      `- Tag target: ${nextState.tagName}${nextState.updateExistingLocalTag ? " (will update local tag if confirmed)" : ""}`,
    );
    console.log("");

    const apply = await askYesNo(rl, "Apply these changes", true);
    if (!apply) {
      console.log("No files changed.");
      return;
    }

    applyChanges(currentState, nextState);
    console.log("Version updates applied.");

    await maybeUpdateOrCreateTag(
      rl,
      nextState.tagName,
      nextState.updateExistingLocalTag,
    );

    console.log("");
    console.log("Next steps");
    console.log("- Review changes with: git diff");
    console.log("- Run checks/builds before committing.");
    console.log("- Push tags manually if needed.");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
