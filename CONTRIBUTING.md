# Contributing

Thanks for your interest in contributing! This project operates under the **Decentralized Identity Foundation (DIF)** umbrella.

This guide mirrors common practices used across active DIF work items (e.g., `did-methods`). If your WG adopts different specifics (e.g., CLA vs DCO), update the placeholders below accordingly.

## Ways to contribute
- File issues (bug reports, feature requests, clarifications).
- Propose changes via Pull Requests (PRs).
- Improve documentation, examples, and PlantUML/diagrams.
- Participate in Working Group calls and async discussions.

## Code of Conduct
By participating, you agree to uphold the DIF community norms. See `CODE_OF_CONDUCT.md`.

## License & IPR
- Repository license: **Apache-2.0** (see `LICENSE.md`).
- Unless otherwise stated by the WG, documentation/spec text is also Apache-2.0.
- Contributions are subject to DIF IPR policies.

## Development workflow

1. **Fork** the repo and create a topic branch:
   ```bash
   git checkout -b feat/short-description
   ```

2. **Make changes** with clear commits. If your WG uses DCO, **sign off** each commit:
   ```bash
   git commit -s -m "feat: add ProfileIdentifier with UUIDv7 + holder DID"
   ```
   _Signed-off-by_ lines are added automatically with `-s` (example):  
   `Signed-off-by: Your Name <you@example.com>`

3. **Run checks** (lint, tests, schema validation) as applicable.

4. **Open a Pull Request** from your fork. Fill out the PR template.

5. **Review**: At least one maintainer/chair must approve. Additional reviewers may be requested for cross-WG alignment.

6. **Merge**: Prefer **squash merge** to keep history clean (unless the WG specifies otherwise).

## Commit conventions (recommended)
- Use short, descriptive messages; optionally adopt [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, etc.).
- Reference issues with `Fixes #123` / `Closes #123` when appropriate.

## Pull Request expectations
- Scope small and focused where possible.
- Include updates to **docs** and **diagrams** when the model changes.
- Include **examples** and/or validation snippets for JSON Schema changes.
- Note **breaking changes** and provide migration notes.

## Branches & releases
- `main`: latest accepted work.
- Release tags follow `vMAJOR.MINOR.PATCH`. Early iterations may use `v0.x`.
- Diagrams and schemas should be versioned and stable per release.

## Issue labels (typical)
- `bug`, `enhancement`, `spec`, `docs`, `question`, `good first issue`, `help wanted`.
- Chairs/maintainers may refine labels to match WG practice.

## Security
See `SECURITY.md` for how to report vulnerabilities.

## Contact
- Chairs: @neiljthomson, @douglascrice
- DIF Working Groups: https://identity.foundation/working-groups/
