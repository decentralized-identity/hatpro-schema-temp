# SCHEMAHINTS v0.1 — Cheat Sheet (for PlantUML notes)

**Purpose:** Put concise, machine-readable hints in PlantUML notes so the generator can emit **Draft 2020-12 JSON Schema** without cluttering diagrams.

Place a `SCHEMAHINTS v0.1` block **inside a PlantUML note** attached to a class (and optionally to specific properties if you want overrides).

---

## Block header

    SCHEMAHINTS v0.1

## Class-level keys
- `title: <SchemaTitle>` — optional; defaults to class name  
- `additionalProperties: true|false` — default **false** (strict by default)  
- `required:[a,b,c]` — list of required fields  
- `xor:(a|b)` — **exactly one** of `a` or `b` must be present (mutual exclusion)

## Field blocks

    field <name>:
      type: string|int|number|boolean|datetime|object|array
      enum:(A|B|C)            # optional
      range:[min,max]         # numeric bounds for int/number
      desc:"Free text"        # human description
      default:<value>         # literal: number|true|false|string
      ref:<ClassName>         # $ref to local class
      refId:<absolute-id>     # $ref to external schema
      itemsRef:<ClassName>    # array items → $ref
      itemsRefId:<absolute-id>

Notes:
- Omit keys you don’t need.  
- `type: datetime` maps to `{ "type":"string", "format":"date-time" }`.  
- For **optional** fields, either omit from `required:[...]` or mark the UML type as `String?` etc.
- If any of `ref*`/`itemsRef*` is present, the generator ignores `type:` for that field.

---

## PlantUML usage patterns

### A) Class-level SCHEMAHINTS

    class TravelerName <<schema>> {
      + firstGivenName : String
      + secondGivenName : String?
      + surnames : Surnames
    }

    note right of TravelerName
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
    end note

### B) XOR rule example (mutual exclusion)

Exactly one of `score` or `flag` is allowed. A common pattern for preferences:

    class SeatPreference <<schema>> {
      + code : String          ' e.g., "aisle", "window"
      + score : Integer?       ' range -99..99
      + flag : PreferenceFlag? ' REQUIRED|PROHIBITED|AVOID|NONE
    }

    note right of SeatPreference
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
      desc:"Strength metric (-99..99)"

    field flag:
      type:string
      enum:(REQUIRED|PROHIBITED|AVOID|NONE)
      desc:"High-level preference flag"
    end note

### C) Property-specific override (optional)

Attach a separate note to a property if you need a special rule:

    note right of TravelerName::firstGivenName
    SCHEMAHINTS v0.1
    field firstGivenName:
      type:string
      desc:"Pattern-restricted string"
    end note

---

## Mapping highlights
- UML `Type?` → optional (not placed in `required:[...]`)  
- `range:[a,b]` → `minimum`/`maximum` for numeric types  
- `enum:(A|B)` → JSON Schema `enum: ["A","B"]`  
- `datetime` → string + `format: date-time`  
- `xor:(a|b)` → emitted as `oneOf` with mutual exclusion

---

## Suggested folder placement
- **Spec (authoritative):** `docs/specs/SCHEMAHINTS/SCHEMAHINTS_v0.1.md`  
- **This cheat sheet (quick ref):** `modeling/puml/SCHEMAHINTS_CHEATSHEET.md`

---

## Generator tip
If you host schemas via GitHub Pages, run the generator with a base URL so `$id` values are stable:

    --baseId https://<you>.github.io/<repo>/schemas

That produces `$id` like `.../schemas/TravelerName`, and you should `$ref` by `$id` for portability.
