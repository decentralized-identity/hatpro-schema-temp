# HATPro Traveler Profile MVP

This package contains the MVP artifacts for the Traveler Profile identifier and micro-sharing model.

## Contents
- **docs/**: Narrative documents and slides
  - *TravelerProfile_Identifier_and_VC_Variation.docx*: Detailed write-up
  - *TravelerProfile_ExecSummary.docx*: Executive summary (1–2 pages)
  - *TravelerProfile_ExecSummary.pptx*: One-slide summary deck
- **model/puml/**: PlantUML diagrams
  - *TravelProfile.puml*: Top-level passive data model
  - *ProfileIdentifier.puml*: UUIDv7 anchor + DID (holder/controller) + aliases
  - *TravelerProfile_Identifier.puml*: Identifier & evidence hooks reference diagram
  - *MicroSharing_Sequence.puml*: Flow for micro-sharing (traveler or delegated AI agent)
  - *NDC_Interop_Context.puml*: Separation of NDC transaction IDs vs traveler UUIDv7

## Notes
- Primary identifier is **UUIDv7** (immutable). Optional **DID** for holder/controller.
- Profile is **passive**; signatures are external (by DIDs listed as controllers).
- Evidence is **format-agnostic** (VC, JWS, COSE, PKCS#7, HL7 FHIR, etc.).
- Micro-sharing produces **purpose-limited**, signed subsets.

---

### Licensing alignment
This repo mirrors the **DIF did-methods** repo structure: a single **Apache-2.0** `LICENSE.md` at the root, with documentation covered by the same license unless overridden by the WG.

---

## Optional CI Workflows
This repo includes **manual** GitHub Actions under `.github/workflows/`:
- `plantuml_manual.yml`: Render all `model/puml/*.puml` to PNG using the PlantUML Docker image.
- `ajv_manual.yml`: Validate JSON Schemas under `schemas/` (skips if none are present).

They are **manual-only** (`workflow_dispatch`) to avoid noise during early MVP. Trigger them from the GitHub "Actions" tab.
