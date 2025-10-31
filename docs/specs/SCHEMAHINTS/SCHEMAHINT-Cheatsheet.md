---
schemahints_version: 1.3
status: current
last_updated: 2025-10-30
---

# SCHEMAHINTS Cheatsheet — v1.3 (current)

**Purpose:** quick, practical reference for authoring SCHEMAHINTS notes in PlantUML that generate **stable** `$id`/`$ref` JSON Schema artifacts. This sheet reflects the **current** approach only (no legacy mechanisms).

---

## 0) Anatomy of a SCHEMAHINTS note
- Use **multi-line** `note ... end note`
- Start body with the literal header `SCHEMAHINTS`
- Indent with **2 spaces**
- Keep blocks compact: **no blank lines** inside a block

```puml
note right of SomeClass
SCHEMAHINTS
  title: "Human-friendly title"
  additionalProperties: false
  required:[fieldA, fieldB]

  field fieldA:
    type: string
    minLength: 1
    desc: a short description

  field fieldB:
    type: integer
    range: 0..999
end note
```

---

## 1) Common tokens
- Top-level (class-level): `title`, `additionalProperties`, `required:[...]`
- `field <name>:` blocks support:
  - `type: string|number|integer|boolean|object|array`
  - `format: email|uri|date|date-time|…`
  - `pattern: ^[A-Z0-9]+$`
  - `minLength`, `maxLength`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`
  - `desc:` human-readable description
  - `default:` default value
  - Arrays: `itemsType: string|integer|...`, `minItems:`, `maxItems:`, `uniqueItems:`
  - Objects: `additionalProperties:` (class-level usually preferred)
- Logical helpers (optional):
  - `xor:(a|b)` — enforce exactly one of the listed fields

**Example (string with pattern & default):**
```puml
field code:
  type: string
  pattern: ^[A-Z]{3}$
  default: ABC
  desc: 3-letter code
```

---

## 2) Enums (canonical approach)
Declare enums **only** with `enumDefine`. This yields a stable `$id` for the enum JSON and a stable `$ref` from schemas.

```puml
field encoding:
  enumDefine:
    enumId: /core/commonLib/TextEncodingEnum
    targetPath: /core/commonLib/TextEncodingEnum
    generate: true
    title: "Character Encodings"
    type: string
    enum:[UTF-8, UTF-16LE, UTF-16BE, ISO-8859-1, Windows-1252]
    x-enumDescriptions:[
      UTF-8 universal encoding,
      UTF-16 little endian,
      UTF-16 big endian,
      Latin-1,
      Windows Latin-1 superset
    ]
```

**Rules**
- `enumId` **required** (starts with `/`); becomes the enum JSON `$id` under your `--baseId`
- `targetPath` recommended: mirrors repo folder structure for the enum file
- `generate: true` to create/update the enum JSON
- Schemas will `$ref` the **enum’s `$id`** (absolute URL), never a file-relative path

**Output mapping**
- Enum JSON file: `packages/<seg>/json/enums/<subdir>/<EnumName>.json`
- Enum `$id`: `{baseId}{enumId}`
- Schema `$ref`: the enum `$id`

---

## 3) Objects & arrays quick patterns

**Object**
```puml
title: "Postal Address"
additionalProperties: false
required:[street, city, countryCode]

field street:
  type: string
  minLength: 1

field city:
  type: string
  minLength: 1

field countryCode:
  type: string
  pattern: ^[A-Z]{2}$  # ISO-3166-1 alpha-2
```

**Array of objects**
```puml
field lines:
  type: array
  itemsType: string
  minItems: 1
  maxItems: 4
```

---

## 4) `$id` / `$ref` rules (stable URIs)
- Every emitted schema gets a **stable** `$id` under `--baseId`
- Enums get a stable `$id` from `enumId`
- All `$ref` in schemas use **absolute** `$id` URIs (no relative paths)

**Example result snippets**
```json
// Enum JSON
{ "$id": "https://schemas.example.org/hatpro/core/commonLib/TextEncodingEnum.json",
  "title": "Character Encodings",
  "type": "string",
  "enum": ["UTF-8", "UTF-16LE", "UTF-16BE", "ISO-8859-1", "Windows-1252"] }

// Schema JSON (excerpt)
{ "properties": {
    "encoding": { "$ref": "https://schemas.example.org/hatpro/core/commonLib/TextEncodingEnum.json" }
  }
}
```

---

## 5) Build & validate

**Recommended order**
```bash
npm run gen:enums     # materialize/refresh enum JSONs
npm run gen:schemas   # produce class schemas that $ref enum $id
```

**AJV checks**
```bash
npm run validate:enums
npm run validate:schemas
```

**Examples (hand-authored assertions)**
```bash
npm run validate:examples                 # all examples
npm run validate:examples -- --only CurrencyAmount
npm run validate:examples -- --version v1
npm run validate:examples -- --segment core
```

**Naming**
- `*.valid.json`  → must validate
- `*.invalid.<reason>.json` → must fail

**Layout**
```
packages/<seg>/json/
  enums/      # GENERATED
  schemas/    # GENERATED
  samples/    # GENERATED data (optional)
  examples/   # DEV-authored (never cleaned)
    v1/ ...   # optional versioned subfolders
```

---

## 6) Cleaning
```bash
npm run clean
# removes: json/enums, json/schemas, json/samples
# keeps:   json/examples
```

---

## 7) Style checklist
- 2-space indents
- No blank lines inside a `field` block
- PascalCase for enum names (e.g., `TextEncodingEnum`)
- Keep top-level `title`, `required:[...]`, and `additionalProperties` in the class note

