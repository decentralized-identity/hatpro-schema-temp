---
schemahints_version: 1.3
status: current
last_updated: 2025-10-31
---
# SCHEMAHINTS & ENUMHINTS — Authoring Manual (v1.2)

---
schemahints_version: 1.0
status: current
last_updated: 2025-10-27
---

# SCHEMAHINTS & ENUMHINTS — Complete Authoring Manual

> This manual consolidates the prior SCHEMAHINTS docs and the ENUMHINTS supplement into a single, developer‑friendly reference with examples you can paste directly into `.puml` notes. It assumes JSON Schema draft‑2020‑12 and a generator that expands path‑like `$ref`s using a `baseId`.

## Table of Contents
1. Overview
2. Quick Start (copy‑paste examples)
3. Where files go & URLs (`$id` / `$ref` base)
4. SCHEMAHINTS grammar (formal)
5. Field basics (types, desc, default, const, formats, ranges, lengths)
6. References to classes (path‑like `$ref` dialect)
7. Arrays & inline objects
8. **Enums (full guide with ALL directives)**
   - 8.1 Inline enums (local)
   - 8.2 Referencing external enums (`enumFrom`)
   - 8.3 Defining external enums (`enumDefine`)
     - `path`, `title`, `type`, `enum`
     - `description`, `$comment`
     - `generate` (emission control)
     - `x-enumNames`, `x-enumDescriptions`
     - `x-order`
     - `x-deprecated`
     - `x-aliases`
     - Arrays of enums
9. Output mapping & `$id` rules (per‑class schemas and enum JSON)
10. Generation & validation commands
11. Migration notes (v0.1 → v1.2)
12. Quick reference appendix

---

## 1) Overview
SCHEMAHINTS are YAML‑like blocks inside PlantUML `note` sections that drive JSON Schema generation. The generator reads **only** the hints (not PlantUML attributes). Enums can be local (inline) or shared via external JSON.

---

## 2) Quick Start
```plantuml
class TravelProfile {}

note right of TravelProfile
SCHEMAHINTS
  title: TravelProfile
  required:[identity, status]

  field identity:
    $ref: /core/Identity

  field status:
    type: string
    enum: [draft, active, archived]

  field languages:
    type: array
    items:
      enumFrom: /core/common/ISO639_1
end note
```

---

## 3) Where files go & URLs
- Per‑class schemas → `packages/<segment>/json/schemas/<subpath?>/<Class>.schema.json`
- External enum JSON → `packages/<segment>/json/enums/<subpath?>/<EnumName>.json`
- Canonical base (example) → `https://schemas.example.org/hatpro/<segment>/<subpath?>/...`
- Pass `--baseId https://schemas.example.org/hatpro/` to set the base.

---

## 4) SCHEMAHINTS grammar (formal)
```yaml
SCHEMAHINTS
  title: <ClassTitle>               # default = class name
  required: [<field> ...]

  # repeatable field blocks
  field <name>:
    # exactly one of
    type: <primitive | className | path>
    $ref: <path | bareName>

    # optional
    desc: <string>                  # → description
    enum: [<v1>, <v2>, ...]         # inline enum (local)
    default: <value>                # default
    const: <value>                  # fixed value
    format: <string>                # date, date-time, email, uri, ...
    range: [<min>, <max>]           # number/integer → minimum/maximum
    minLength: <int>                # strings
    maxLength: <int>

  # optional class-level logical constraints
  xor: [[a, b], [c, d, e]]
  oneOf: [<schemaRef> ...]
  allOf: [<schemaRef> ...]
  anyOf: [<schemaRef> ...]
```

---

## 5) Field basics
```plantuml
note right of TechString
SCHEMAHINTS
  title: TechString
  field value:
    type: string
  field lang:
    type: string
    const: en             # quoted or unquoted; generator normalizes
  field script:
    type: string
    const: UTF-8
  required:[value, lang, script]
end note
```
Numeric/string constraints:
```yaml
field age:
  type: integer
  range: [0, 150]
field code:
  type: string
  minLength: 2
  maxLength: 10
```

---

## 6) References to classes (path‑like `$ref` dialect)
Allowed forms:
- Absolute (repo‑root): `/$segment/$subpath?/Class`
- Package‑relative: `./Class`, `../subpath/Class`
- Bare (same folder): `Class`
- Alias sugar: `@segment/subpath/Class`

Examples:
```yaml
field identity:      $ref: ./Identity
field displayName:   $ref: /core/commonLib/PresentationString
field local:         $ref: TravelerName
```
The generator also treats non‑primitive `type: Identity` like `$ref: Identity`.

---

## 7) Arrays & inline objects
Arrays of classes:
```yaml
field members:
  type: array
  items:
    $ref: ./TravelerName
```
Inline objects (advanced):
```yaml
field meta:
  type: object
  properties:
    createdAt: { type: string, format: date-time }
    source:    { type: string }
```

---

## 8) Enums (full guide with ALL directives)

### 8.1 Inline enums (local)
Use for small, single‑use lists.
```yaml
field script:
  type: string
  enum: [Latn, Cyrl, Hani, Kana]
```

### 8.2 Referencing external enums (`enumFrom`)
Use when an enum JSON already exists (hand‑authored or previously generated).
```yaml
field language:
  enumFrom: /core/common/ISO639_1   # also allowed: @core/common/ISO639_1, ./ISO639_1, ../common/ISO639_1
```
Resolution:
- The field becomes `{ "$ref": "<baseId>core/common/ISO639_1.json" }`.
- Works equally inside `items:` for arrays.

**Array of enums**
```yaml
field languages:
  type: array
  items:
    enumFrom: /core/common/ISO639_1
```

### 8.3 Defining external enums (`enumDefine`)
Create or update a shared enum JSON and reference it automatically.

**Minimal**
```yaml
field script:
  enumDefine:
    enumId:
    targetPath:
    sourcePath: /core/common/Script     # required, where the JSON enum will live
    enum: [Latn, Cyrl, Hani, Kana]
```

**Full form (ALL directives)**
```yaml
field script:
  enumDefine:
    enumId:
    targetPath:
    sourcePath: /core/common/Script     # required target path
    title: Script                 # optional title for the enum file
    type: string                  # "string" (default) or "integer"
    enum: [Latn, Cyrl, Hani, Kana]
    description: "Scripts"       # optional
    $comment: "Reviewed 2025-10" # optional freeform note
    generate: true                # emit/update the JSON file when generator runs with --emitEnums true

    # UX/labeling (optional; copied into the enum JSON)
    x-enumNames: ["Latin","Cyrillic","Han","Kana"]
    x-enumDescriptions: ["Latin scripts","Cyrillic","Han","Kana"]

    # Ordering hint (optional)
    x-order: [FIRST, BUS, PREM_ECON, ECON]

    # Deprecations (optional)
    x-deprecated:
      - { value: PREM_ECON, until: "2026-06-30", note: "Merged with ECON" }

    # Aliases/synonyms (optional)
    x-aliases:
      - [ECONOMY, ECON]
      - [BUSINESS, BUS]
```
Notes:
- The JSON enum file is written only if **both** conditions are true: the generator is invoked with `--emitEnums true` **and** `generate: true` is present. Schemas will `$ref` the enum either way.
- Emitted file location: `packages/<segment>/json/enums/<subpath?>/<EnumName>.json`
- `$id` convention for enum files: `<baseId><segment>/<subpath?>/<EnumName>.json`

**Example emitted enum JSON (sketch)**
```json
{
  "$id": "https://schemas.example.org/hatpro/core/common/Script.json",
  "title": "Script",
  "type": "string",
  "enum": ["Latn","Cyrl","Hani","Kana"],
  "x-enumNames": ["Latin","Cyrillic","Han","Kana"],
  "x-enumDescriptions": ["Latin scripts","Cyrillic","Han","Kana"],
  "x-order": ["FIRST","BUS","PREM_ECON","ECON"],
  "x-deprecated": [
    { "value": "PREM_ECON", "until": "2026-06-30", "note": "Merged with ECON" }
  ],
  "x-aliases": [["ECONOMY","ECON"],["BUSINESS","BUS"]]
}
```

---

## 9) Output mapping & `$id` rules
- Per‑class example:
  - PUML: `packages/core/puml/commonLib/PresentationString.puml`
  - JSON: `packages/core/json/schemas/commonLib/PresentationString.schema.json`
  - `$id`:  `https://schemas.example.org/hatpro/core/commonLib/PresentationString.schema.json`
- External enum example:
  - JSON: `packages/core/json/enums/common/ISO639_1.json`
  - `$id`:  `https://schemas.example.org/hatpro/core/common/ISO639_1.json`

Bundling tip: if you later build a monolithic schema, rewrite `$ref`s to `#/$defs/...` while preserving package‑like namespaces (e.g., `#/$defs/core/commonLib/PresentationString`).

---

## 10) Generation & validation commands
```bash
npm ci
npm run gen:schemas            # per-class schemas
npm run gen:schemas+enums      # per-class + emit enum JSON (requires --emitEnums true)
npm run validate:ajv           # loads schemas and enums; resolves $ref by $id
npm run bundle:monolith        # optional bundler step to create one-file schema
```

---

## 11) Migration notes (v0.1 → v1.2)
- New path‑like `$ref` dialect: `/pkg/path/Class`, `./Class`, `../path/Class`, `@pkg/path/Class`.
- `$id` now includes package path segments for clarity and collision avoidance.
- Bare names still work for same‑folder refs; prefer explicit paths for cross‑package links.
- CI should fail on unresolved `$ref`s; keep enum names/paths globally unique or namespaced.

---

## 12) Quick reference appendix
| Task | PUML Hint | JSON fragment |
|---|---|---|
| Required field | `required:[name]` | `"required":["name"]` |
| Primitive type | `field age:\n  type: integer` | `"age":{"type":"integer"}` |
| Local ref | `field n:\n  $ref: ./TravelerName` | `"$ref":"<baseId>core/TravelerName.schema.json"` |
| Cross‑pkg ref | `field s:\n  $ref: /core/commonLib/PresentationString` | `"$ref":"<baseId>core/commonLib/PresentationString.schema.json"` |
| Inline enum | `field status:\n  type: string\n  enum: [draft, active]` | `"status":{"type":"string","enum":["draft","active"]}` |
| External enum | `field lang:\n  enumFrom: /core/common/ISO639_1` | `"$ref":"<baseId>core/common/ISO639_1.json"` |
| Define enum | `field script:\n  enumDefine: { enumId: /core/common/Script, enum:[Latn,...], generate:true }` | Enum JSON emitted & field `$ref`s it |
| Range | `field age:\n  type: integer\n  range: [0,130]` | `"minimum":0, "maximum":130` |
| Date | `field dob:\n  type: string\n  format: date` | `"format":"date"` |
| Array of enums | `items: { enumFrom: /core/common/ISO639_1 }` | `items: { "$ref": ".../ISO639_1.json" }` |



---
## v1.2 Updates
- Replaces ambiguous `path:` with `enumId`, `targetPath`, and `sourcePath`.
- `enumFrom` must reference `enumId` (or absolute `$id`).
- `$id` = `<baseId> + enumId + .json`.
- Files written to `packages + targetPath + .json`.
