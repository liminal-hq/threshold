# Blog Folder Guide

This folder contains dated blog post drafts and published artefacts.

## Purpose

- Blog posts here are **historical snapshots**.
- A post reflects what was true when it was written, not necessarily the current implementation.
- Current technical truth belongs in living docs (for example `docs/architecture/` and plugin docs).

## Audience

This guide applies to:

- Humans editing blog content
- AI agents making documentation updates

## Rules for Editing Blog Posts

1. Preserve the historical narrative of dated posts.
2. Do not silently rewrite old technical flow descriptions to match newer code.
3. If accuracy context is needed, add a short dated editor note instead of rewriting the story.
4. Prefer adding a follow-up blog post for major later changes.
5. Keep links to living docs when readers need the latest implementation details.

## Snapshot Disclaimer Template

Use this near the top of time-bound posts:

> **Snapshot note (YYYY-MM-DD):** This post describes the system as it existed on this date. Implementation details may have changed since publication.

## Agent Instructions

When updating docs:

1. Treat `docs/blog/` as snapshot content by default.
2. Update living docs first (`docs/architecture/`, plugin README/docs) when behaviour changes.
3. Only edit a dated blog post when explicitly asked, or when adding a clearly marked snapshot/editor note.
4. If uncertain, ask before changing historical narrative sections.

## File Naming

- Use date-first naming: `YYYY-MM-DD-topic.md`.
- Keep one primary topic per file.

## Language and Style

- Use Canadian English spelling.
- Write clearly for mixed audiences (product, engineering, contributors).
- Prefer concrete dates over relative terms like "today" in historical posts.
