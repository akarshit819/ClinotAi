# License decision — FINAL: public repository + proprietary code

**Decision (2026-10-04): the repository stays PUBLIC for visibility, and the code is PROPRIETARY
(All Rights Reserved) under the root [LICENSE](../LICENSE).** No permissive open-source license
(MIT, Apache-2.0, BSD, GPL, AGPL, MPL) was selected, and none applies.

## Why the repository is public

Portfolio, credibility, documentation, and professional visibility: visitors can read the code,
architecture, and engineering record. Public visibility grants no reuse rights — it only allows viewing.

## Why no permissive open-source license

A permissive license would grant anyone the right to reuse, redistribute, sell, rebrand, or build
competing commercial products from this code. That is explicitly not intended. `package.json` remains
`private: true`, and no open-source license classifier should be selected on GitHub (leaving it unset
is correct — do not pick MIT/Apache/GPL just to display a badge).

## What users may do

- View and read the repository contents on GitHub.
- Reference it (e.g. link to it) for evaluation or discussion.

## What users may not do without explicit written permission

- Copy, modify, redistribute, sublicense, publish, or sell the code.
- Create derivative or competing commercial products, or rebrand Clinot as their own.
- Reuse the Clinot name, logo, or branding (no trademark rights granted).

## Notes

- Third-party dependencies keep their own licenses; this decision claims no ownership over them.
- Public accessibility does not technically prevent cloning — the license defines permitted use, not
  technical access. No claim is made that GitHub prevents downloading.
- If the product direction ever favors community use, revisit this decision explicitly (MIT for maximum
  reach, Apache-2.0 for patent clarity) — do not drift into it by accident.
