# Using Threshold Pattern Docs with AI Coding Agents

**Purpose:** Guide for leveraging the Threshold plugin documentation with AI coding agents (Claude, GPT-4, Cursor, Copilot, etc.)

---

## Overview

The Threshold plugin pattern documentation is specifically designed to work well with AI coding agents. The documents are:
- ✅ Comprehensive and self-contained
- ✅ Include code templates and examples
- ✅ Provide verification steps
- ✅ Written in clear, structured markdown
- ✅ Cover common pitfalls and edge cases

---

## Recommended Storage Location

Store the pattern documents in your repository where AI agents can reference them:

```
threshold/
├── docs/
│   ├── architecture/
│   │   ├── event-architecture.md
│   │   ├── architecture.md
│   │   ├── data-architecture.md
│   │   ├── flow-diagrams.md
│   │   ├── getting-started.md
│   │   └── implementation-roadmap.md
│   ├── plugins/
│   │   ├── alarm-manager.md
│   │   ├── time-prefs.md
│   │   ├── wear-sync.md
│   │   ├── plugin-manifest-pattern.md
│   │   ├── plugin-manifest-quickstart.md
│   │   └── plugin-manifest-pr-checklist.md
│   ├── android/
│   │   ├── intents.md
│   │   └── transitions.md
│   ├── desktop/
│   │   └── deeplinks.md
│   ├── ui/
│   │   ├── ui-task.md
│   │   └── swipe-to-delete-row.md
│   ├── infrastructure/
│   │   └── ghcr-setup.md
│   ├── wear-implementation/
│   │   └── ui-mockups.md
│   └── ai-agent-usage-guide.md
└── plugins/
    ├── alarm-manager/
    ├── time-prefs/
    └── wear-sync/
```

**Why this works:**
- Agents can access local files via file paths
- Documentation is version-controlled with code
- Updates to patterns propagate to all future agent tasks
- Team members can also read the docs

---

## Usage Patterns

### Pattern 1: Create New Plugin with Android Support

**Scenario:** You're creating a new plugin called `notification-manager`.

**Agent Prompt:**
```markdown
I need to create a new Tauri plugin called `notification-manager` with Android support.

Please follow the Threshold Android Manifest Injection Pattern documented in:
- `/docs/plugins/plugin-manifest-quickstart.md` (for quick reference)
- `/docs/plugins/plugin-manifest-pattern.md` (for comprehensive details)

Requirements:
1. Plugin needs these Android permissions:
   - POST_NOTIFICATIONS
   - VIBRATE
   - WAKE_LOCK

2. Implement manifest injection in build.rs following the pattern

3. Plugin commands are:
   - notify
   - cancel
   - list_active

Please implement the complete plugin structure with proper manifest injection.
```

**What the Agent Will Do:**
1. Read both pattern documents
2. Extract templates and conventions
3. Generate `build.rs` with correct injection
4. Create proper `Cargo.toml` with build feature
5. Set up library manifest correctly
6. Follow naming conventions (block identifiers, etc.)

---

### Pattern 2: Update Existing Plugin

**Scenario:** Migrating an existing plugin to the pattern.

**Agent Prompt:**
```markdown
Please update the alarm-manager plugin to follow the Android Manifest Injection Pattern.

Use the specific implementation prompt at:
`/docs/prompts/LLM_AGENT_PROMPT_ALARM_MANAGER_UPDATE.md`

This prompt contains:
- Step-by-step instructions
- Current state analysis
- Expected changes
- Verification procedures

Follow all phases and provide verification results when complete.
```

**What the Agent Will Do:**
1. Read the task-specific prompt
2. Reference the main pattern docs as needed
3. Analyze current implementation
4. Make required changes
5. Run verification steps
6. Report results

---

### Pattern 3: Review Plugin PR

**Scenario:** An AI agent reviews a PR that adds Android support.

**Agent Prompt:**
```markdown
Please review this PR that adds Android manifest injection to the barcode-scanner plugin.

Use the review checklist at:
`/docs/plugins/plugin-manifest-pr-checklist.md`

Files changed in this PR:
- plugins/barcode-scanner/build.rs
- plugins/barcode-scanner/Cargo.toml
- plugins/barcode-scanner/android/src/main/AndroidManifest.xml

Provide:
1. Checklist completion results
2. Any issues found
3. Approval or requested changes
```

**What the Agent Will Do:**
1. Read the PR checklist
2. Examine each changed file
3. Verify against checklist items
4. Identify issues or approve
5. Generate review comment

---

### Pattern 4: Troubleshoot Implementation

**Scenario:** The pattern isn't working as expected.

**Agent Prompt:**
```markdown
I'm implementing Android manifest injection in my plugin but getting this error:
```
[error message here]
```

Please help troubleshoot using:
`/docs/plugins/plugin-manifest-pattern.md`

Specifically, check the troubleshooting section and compare my implementation to the examples.

My current build.rs:
```rust
[paste your build.rs]
```
```

**What the Agent Will Do:**
1. Read troubleshooting section
2. Compare your code to templates
3. Identify the issue
4. Provide corrected code
5. Explain what was wrong

---

## Best Practices for Agent Prompts

### 1. Always Reference Documentation Paths

**❌ Bad:**
```
Implement Android manifest injection for my plugin.
```

**✅ Good:**
```
Implement Android manifest injection following the pattern in `/docs/plugins/plugin-manifest-quickstart.md`.
```

**Why:** Explicit paths ensure the agent reads your specific documentation, not its general knowledge.

---

### 2. Be Specific About Requirements

**❌ Bad:**
```
Add permissions to my plugin.
```

**✅ Good:**
```
Add these Android permissions using the manifest injection pattern:
- CAMERA
- VIBRATE

Follow the template in section 4 of plugin-manifest-quickstart.md.
```

**Why:** Specific requirements + doc reference = better results.

---

### 3. Request Verification

**❌ Bad:**
```
Update the plugin to use manifest injection.
```

**✅ Good:**
```
Update the plugin to use manifest injection and verify using the steps in Phase 5 of the implementation guide.

Provide:
1. Build output
2. Generated manifest snippet
3. Confirmation that runtime behaviour works
```

**Why:** Verification ensures the agent tests its work.

---

### 4. Reference Specific Sections

**❌ Bad:**
```
Fix my build.rs using the pattern doc.
```

**✅ Good:**
```
Fix my build.rs by comparing it to the "Template Code" section in plugin-manifest-pattern.md (line ~450).

Focus on:
- COMMANDS array definition
- Injection function signature
- Block identifier format
```

**Why:** Specific sections guide the agent to the most relevant information.

---

## Multi-Document Reference Strategy

For complex tasks, give agents a reading order:

```markdown
Please implement Android manifest injection for the location-tracker plugin.

Read documents in this order:
1. `/docs/plugins/plugin-manifest-quickstart.md` - get quick template
2. `/docs/plugins/plugin-manifest-pattern.md` section 7 - review "Feature-Gated Permissions" pattern (location is sensitive)

Requirements:
- Base permissions: ACCESS_FINE_LOCATION
- Feature-gated: ACCESS_BACKGROUND_LOCATION (opt-in only)

Follow the feature-gated pattern from section 7.
```

---

## Verification Integration

Always include verification in your prompts:

```markdown
After implementing manifest injection:

1. Run verification commands from the implementation prompt
2. Provide output of:
   ```bash
   cat apps/threshold/src-tauri/gen/android/app/src/main/AndroidManifest.xml | grep -A 20 "tauri-plugin-your-plugin"
   ```
3. Confirm no build errors
4. Confirm runtime behaviour is correct

Do not consider the task complete until all verification passes.
```

---

## Agent-Specific Tips

### Claude (Anthropic)
- ✅ Excels at reading long documents
- ✅ Good at following structured checklists
- ✅ Can process multiple doc references simultaneously
- **Tip:** Give it the full pattern doc, it will handle it well

### GPT-4 (OpenAI)
- ✅ Good with templates and examples
- ⚠️ May need more explicit step-by-step instructions
- **Tip:** Reference specific code examples rather than sections

### Cursor / Copilot
- ✅ Best with inline code suggestions
- ⚠️ May not read full documents automatically
- **Tip:** Paste relevant template sections into the prompt

### Open-Source Models
- ⚠️ May struggle with very long documents
- **Tip:** Use QUICKSTART.md instead of full pattern doc
- **Tip:** Provide explicit code templates

---

## Template Prompts for Common Tasks

### Create Plugin from Scratch
```markdown
Create a new Tauri plugin called `{plugin-name}` with Android support.

Follow: `/docs/plugins/plugin-manifest-quickstart.md`

Android permissions needed:
- {PERMISSION_1}
- {PERMISSION_2}

Tauri commands:
- {command_1}
- {command_2}

Include:
1. Proper manifest injection in build.rs
2. Correct Cargo.toml with build feature
3. Library manifest with components only

Verify using steps from the quickstart doc.
```

---

### Add Android Support to Existing Plugin
```markdown
Add Android support to the existing `{plugin-name}` plugin.

Current state:
- Has desktop implementation
- No Android code yet
- Commands: {list commands}

Required Android permissions:
- {PERMISSION_1}
- {PERMISSION_2}

Follow the pattern in `/docs/plugins/plugin-manifest-pattern.md` sections 4-6.

Create:
1. build.rs with manifest injection
2. android/ directory with proper structure
3. Native Kotlin/Java code (basic structure)

Provide verification that manifest injection works.
```

---

### Migrate Library Manifest to Injection
```markdown
Migrate `{plugin-name}` from library manifest approach to build-time injection.

Current manifest is at: `plugins/{plugin-name}/android/src/main/AndroidManifest.xml`

Steps:
1. Extract all `<uses-permission>` from library manifest
2. Implement injection in build.rs following `/docs/plugins/plugin-manifest-quickstart.md`
3. Remove permissions from library manifest (keep components)
4. Verify with multiple builds (test idempotency)

Ensure no duplicate permissions in final generated manifest.
```

---

## Integration with CI/CD

You can use AI agents in automated workflows:

```yaml
# .github/workflows/plugin-validation.yml
name: Validate Plugin Pattern

on:
  pull_request:
    paths:
      - 'plugins/*/build.rs'
      - 'plugins/*/Cargo.toml'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # Use AI agent to validate
      - name: AI Pattern Validation
        run: |
          ai-agent run --prompt "
          Review the changed plugin files against the checklist in:
          /docs/plugins/plugin-manifest-pr-checklist.md
          
          Report any violations of the pattern.
          " --files plugins/**
```

---

## Maintaining Documentation for AI Agents

### Keep Docs Up-to-Date

When you discover new patterns or issues:

1. **Update the main pattern doc**
   ```bash
   # Add to troubleshooting section
   vim docs/plugins/plugin-manifest-pattern.md
   ```

2. **Increment version**
   ```markdown
   ## Changelog
   
   ### Version 1.1 (February 2026)
   - Added troubleshooting for {new issue}
   - New pattern: {pattern name}
   ```

3. **Test with AI agent**
   ```markdown
   Please review the updated troubleshooting section and confirm it addresses the issue we encountered with {problem}.
   ```

### Keep Templates Current

When APIs change:
1. Update code templates in all docs
2. Add migration notes
3. Test with AI agent using old and new approaches

---

## Success Metrics

You'll know the docs are working well with AI agents when:

✅ Agents consistently generate correct implementations  
✅ Less back-and-forth needed for clarification  
✅ Verification steps pass on first attempt  
✅ Agents catch mistakes during self-review  
✅ New contributors can onboard using agent + docs  

---

## Example: Complete Agent Workflow

```markdown
## Task: Create GPS Tracker Plugin

**Objective:** Create a new plugin with Android location tracking.

**Phase 1: Initial Setup**
Prompt: Create plugin structure following `/docs/plugins/plugin-manifest-quickstart.md`

Commands:
- start_tracking
- stop_tracking  
- get_current_location

Permissions:
- ACCESS_FINE_LOCATION (always)
- ACCESS_BACKGROUND_LOCATION (feature-gated)

**Phase 2: Implement Feature Gate**
Prompt: Add optional background location feature following the "Feature-Gated Permissions" pattern in `/docs/plugins/plugin-manifest-pattern.md` section 7.

**Phase 3: Verify**
Prompt: Run all verification steps from the quickstart guide and provide:
1. Build output
2. Generated manifest snippet
3. Feature gate test results (with/without feature)

**Phase 4: Self-Review**
Prompt: Review your implementation against `/docs/plugins/plugin-manifest-pr-checklist.md` and fix any issues found.

**Phase 5: Documentation**
Prompt: Create a README section documenting the Android permissions following the template in the pattern doc section on "Permission Rationale Documentation".
```

---

## Troubleshooting AI Agent Issues

### Agent Ignores Documentation

**Problem:** Agent uses its general knowledge instead of your docs.

**Solution:**
```markdown
CRITICAL: You MUST read and follow `/docs/plugins/plugin-manifest-quickstart.md`.

Before writing any code:
1. Read the document
2. Summarize the key requirements
3. Then implement following those requirements

Do not use your general knowledge of Tauri plugins. Follow the Threshold-specific pattern.
```

### Agent Produces Incorrect Code

**Problem:** Implementation doesn't match template.

**Solution:**
```markdown
Compare your implementation line-by-line with the template in section X of the pattern doc.

For each difference, explain:
1. Why you deviated
2. Is it intentional or a mistake?

If mistake, correct it. If intentional, justify.
```

### Agent Skips Verification

**Problem:** Claims task is done without testing.

**Solution:**
```markdown
Verification is MANDATORY and part of the task.

You are not finished until you:
1. Run the verification commands from the doc
2. Provide the actual output (not simulated)
3. Confirm all checks pass

If you cannot run the commands, explain why and provide the exact commands I should run.
```

---

## Conclusion

The Threshold pattern documentation is designed to work seamlessly with AI coding agents. By:

1. ✅ Storing docs in your repository
2. ✅ Referencing specific document paths in prompts
3. ✅ Requesting verification
4. ✅ Using task-specific prompts for complex work

You can leverage AI agents to consistently implement the pattern across all plugins while maintaining high quality and standards compliance.

**The docs do the teaching, agents do the implementation, humans do the review.**

---

**Questions or Issues?**
- Update the docs with new patterns as you discover them
- Share successful agent prompts with the team
- Report documentation gaps or unclear sections
