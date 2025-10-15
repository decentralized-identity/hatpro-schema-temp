## chore/seed-layout — 2025-10-14

### Summary
Adds segmented repo structure: /packages, /tools, /scripts, /.github, /docs.
No file moves; only seed files. CI: schema gen + validation (placeholders unless tools are updated).

### Motivation
Updating the repo to do auto generation of JSON-Schema and JSON samples from .PUML files decorated with SCHEMAHINTS which are required by the JSON schema generator, etc.

### Documentation
- [ ] Updated docs in /docs - to create a specs folder and add the SCHEMAHINTS_v0.1.md file
- [ ] Updated PUML diagrams in /model/puml
- [ ] Added/updated examples

### Validation
- [ ] Schemas validate (if applicable)
- [ ] Diagrams render (if applicable)
- [ ] Tests pass (if applicable)

### IPR / Sign-off
- [ ] I have the right to submit this contribution under the project license(s).
- [ ] (If WG requires DCO) My commits are Signed-off-by.
