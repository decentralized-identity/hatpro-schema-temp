# SCHEMAHINTS v0.1 — Specification (No YAML)

SCHEMAHINTS is a compact, line-oriented DSL embedded **inside PlantUML `note` blocks**. It carries schema intent that a generator turns into **JSON Schema Draft 2020-12**. This document defines the syntax and mapping; all examples use SCHEMAHINTS (no YAML).

---

## 1. Placement

Attach a `note` to a UML **class** (and optionally to **properties** for overrides).

- Class-level block informs object schema (`title`, `required`, `additionalProperties`, field blocks, xor rules, etc.).
- Property-level block *may* override a single field.

```
note right of ClassName
SCHEMAHINTS v0.1
...directives...
end note
```

---

## 2. Header

The first non-empty line of a block **must** be:

```
SCHEMAHINTS v0.1
```

If the version mismatches, the generator should warn or fail.

---

## 3. Class-level directives

- `title: <SchemaTitle>` — Optional; defaults to class name.
- `additionalProperties: true|false` — Defaults to **false** (strict by default).
- `required:[name,other,...]` — Comma-separated list; must match declared fields.
- `xor:(a|b)` — Exactly one of `a` or `b` must be present.

Example:
```
SCHEMAHINTS v0.1
title: TravelerName
additionalProperties:false
required:[firstGivenName,surnames]
xor:(score|flag)            # optional; may appear at class-level or in a specialized class
```

---

## 4. Field blocks

Each field is introduced with `field <name>:` followed by indented directives.

```
field <name>:
  type: string|int|number|boolean|datetime|object|array
  enum:(A|B|C)                 # optional
  range:[min,max]              # numeric bounds for int/number
  desc:"Free text"             # human-readable description
  default:<value>              # literal: number|true|false|string
  ref:<ClassName>              # reference to local schema class → $ref
  refId:<absolute-id>          # reference to external schema → $ref
  itemsRef:<ClassName>         # for arrays → items: { $ref: ... }
  itemsRefId:<absolute-id>     # for arrays → items: { $ref: ... }
```

**Notes**
- `type: datetime` → `{ "type": "string", "format": "date-time" }`
- If `ref*` or `itemsRef*` is present, the generator **ignores `type:`** for that field (the reference implies structure).
- `desc:` and `default:` are always optional.

---

## 5. Types and optionality

- Primitive types: `string`, `int`, `number`, `boolean`, `datetime`.
- Structural types: `object`, `array`.
- UML `Type?` (e.g., `String?`) marks the property **optional**. The generator **must not** add it to `required:[...]` unless explicitly listed.
- If a field is listed in `required:[...]`, it is required regardless of UML `?`.

---

## 6. References (`$ref`) — REQUIRED UPDATE

To model a property as a **reference to another JSON Schema**:

- `ref:<ClassName>` → emit `$ref` to the resolved `$id` of `<ClassName>` **within the same model set**.
- `refId:<absolute-id>` → emit `$ref` to an **external** schema.
- For arrays of references:
  - `itemsRef:<ClassName>` → array items `$ref` to local class.
  - `itemsRefId:<absolute-id>` → array items `$ref` to external schema.

**Precedence (high → low)**  
`refId` > `ref` > (implicit UML non-primitive type) > `type`

- If any `ref*` / `itemsRef*` is present, **ignore `type:`** for that field.
- If **no** `ref*`/`itemsRef*` is present and the UML property type is a **known class name**, the generator **may** infer `$ref` automatically (convenience). Explicit `ref:` is preferred.

---

## 7. Validation constructs

- `enum:(A|B|C)` → `enum: ["A","B","C"]`
- `range:[min,max]` on `int`/`number` → `minimum`, `maximum`
- `xor:(a|b)` → emit `oneOf` with mutual exclusion:
  ```
  oneOf: [
    { required: ["a"], not: { required: ["b"] } },
    { required: ["b"], not: { required: ["a"] } }
  ]
  ```

---

## 8. Mapping to JSON Schema (summary)

- Class → `{ $schema, $id, title, type:"object", properties, required?, additionalProperties }`
- `$id` → derived from `title` + generator `--baseId`, or a tool-default if none is provided
- Field → `properties.<name>` from block:
  - `type` → JSON Schema type (with `format` for `datetime`)
  - `enum`, `minimum`, `maximum`, `default`, `description`
  - `ref*` → `$ref`
  - `itemsRef*` → `{ "type":"array", "items": { "$ref": ... } }`
- `required:[...]` → class `required` array
- `xor:(a|b)` → `oneOf` as shown above

---

## 9. Complete examples (SCHEMAHINTS only)

### 9.1 Local reference to another class

PlantUML:
```
class TravelerName <<schema>> {
  + firstGivenName : String
  + secondGivenName : String?
  + surnames : Surnames
}
```

SCHEMAHINTS:
```
SCHEMAHINTS v0.1
title: TravelerName
additionalProperties:false
required:[firstGivenName,surnames]

field firstGivenName:
  type:string
  desc:"Primary given name"

field secondGivenName:
  type:string
  desc:"Additional/middle name"

field surnames:
  ref:Surnames
  desc:"Structured surnames"
```

And the referenced class:

```
class Surnames <<schema>> {
  + firstSurname : String
  + secondSurname : String?
}

note right of Surnames
SCHEMAHINTS v0.1
title: Surnames
additionalProperties:false
required:[firstSurname]

field firstSurname:
  type:string

field secondSurname:
  type:string
end note
```

### 9.2 Array of referenced items

UML:
```
+ previousNames : TravelerName[]
```

SCHEMAHINTS:
```
SCHEMAHINTS v0.1
title: IdentityHistory
additionalProperties:false

field previousNames:
  itemsRef:TravelerName
  desc:"Prior officially recorded names"
```

### 9.3 External reference

```
SCHEMAHINTS v0.1
title: LegalIdentity
additionalProperties:false

field legalName:
  refId:https://schemas.example.org/identity/LegalName
```

### 9.4 XOR example

```
SCHEMAHINTS v0.1
title: SeatPreference
additionalProperties:false
required:[code]
xor:(score|flag)

field code:
  type:string

field score:
  type:int
  range:[-99,99]

field flag:
  type:string
  enum:(REQUIRED|PROHIBITED|AVOID|NONE)
```

---

## 10. Errors and diagnostics (recommendations)

- Unknown field directives → warning; generator should continue where safe.
- `ref:*` target not found → error (unless `refId` was used).
- Field in `required:[...]` not declared via UML or `field` → error.
- Conflicting directives (e.g., `ref:` + `type:`) → ignore `type:`, warn.

---

## 11. Versioning

- This document specifies **SCHEMAHINTS v0.1**.  
- Backward-compatible additions (like `ref*`) are allowed in v0.1.x with clear precedence rules.  
- Breaking changes should rev to **v0.2** and update both spec and generator.
