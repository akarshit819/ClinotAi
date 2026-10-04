# License decision (required before reuse or public launch)

Current state: **no license granted** — `package.json` is `private: true`, no `LICENSE` file exists, and the
README states all rights reserved. Nothing below takes effect until a choice is made and a `LICENSE` file is
added. This is not legal advice.

## Option A — MIT

- Permissive: anyone can use, copy, modify, and sell the code with attribution.
- Best if the goal is maximum portfolio visibility, community contributions, and recruiter goodwill.
- Trade-off: competitors (including other dental SaaS) may reuse the code freely.

## Option B — Apache-2.0

- Permissive like MIT, plus an explicit patent grant and clearer contribution terms.
- Best if the project may receive outside contributors or the author wants patent-level clarity.
- Trade-off: same commercial-reuse exposure as MIT; slightly longer license text to maintain.

## Option C — All Rights Reserved / proprietary (no open-source license)

- Nobody may reuse, redistribute, or build on the code; viewing is all GitHub visitors get.
- Best if Clinot is intended as a commercial product and the repository is a showroom, not a commons.
- Trade-off: no community contributions; some engineers/recruiters value open-source collaboration history.

## Recommendation

For an AI SaaS product project whose primary value is the live product and the engineering record — not
library reuse — **start with Option C** (current state, nothing to do) while the product direction is
undecided, and switch to **MIT** only when deliberately inviting community use. If contributions arrive
before that decision, **Apache-2.0** is the safer permissive pick.

## Enactment checklist (when authorized)

1. Add the chosen `LICENSE` file at the repository root.
2. Set `package.json` `license` field accordingly (and reconsider `private: true`).
3. Add a license badge to the README hero.
4. Note the change under `CHANGELOG.md` → Unreleased.
