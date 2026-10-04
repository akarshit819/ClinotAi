# GitHub repository setup (manual — nothing here was applied automatically)

## Description

> A dental clinic management and AI patient communication platform.

This matches the verified product: clinic workspaces, appointment/patient management, AI-assisted receptionist,
WhatsApp + website messaging, Stripe billing. It claims no customers, scale, or compliance.

## Topics

`nextjs`, `react`, `typescript`, `postgresql`, `prisma`, `ai`, `dental`, `whatsapp`, `stripe`, `saas`

Each maps to a verified dependency or feature. Do not add `hipaa`, `enterprise`, or framework topics for
libraries that are not installed.

## Homepage / demo

- Homepage: repository URL itself until a marketing site is confirmed.
- A deployment previously existed at `https://clinot-ai.onrender.com` (linked from project history; serves
  Clinot content as of 2026-10-04, availability not guaranteed). Only set it as the homepage/demo URL after
  confirming it is the current, maintained deployment — and never repeat that site's marketing claims
  (user counts, compliance badges) here without evidence.

## Social preview

Create per [GITHUB_SOCIAL_PREVIEW_SPEC.md](GITHUB_SOCIAL_PREVIEW_SPEC.md), then Settings → Social preview → upload.

## Releases

No tags exist. Suggested strategy: tag `v0.1.0` at the Phase 2B commit, then SemVer (`CHANGELOG.md` already
tracks Unreleased). Enable "Releases" with generated notes + the changelog excerpt.

## Visibility and license (decision required)

- `package.json` is still `private: true`. Flip only together with adding a `LICENSE` (MIT vs Apache-2.0 vs
  proprietary — undecided). Until then, no license badge and no reuse permissions are stated.
- Do not change visibility from this environment.

## Branch protection (recommended for `main`)

Require pull request + the `verify` CI job (`ci.yml`) before merging; dismiss stale reviews; no force pushes.
