# International Text - Languages, Locales and Encoding

While HATPro is intended for the future of Hospitality and Travel, it will need to provide support for legacy standards to allow existing systems to leverage HATPro in the short term.

# Quick Summary
- **Languages, Locales and Scripts** (including language dialect differences) are supported by using IETF-BCP-47 encoding/enums
- **Encoding** - (digital storage format) - HATPro Travel Profiles only support UTF-8, recognizing that text input or presented to a Traveler should be translated on input and on output/presentation from a HATPro Profile when working with non-UTF-8 systems.

# Recommended Legacy Encodings for Hospitality & Travel Industry (Ingest Only)

UTF-8 should be the default for all systems, but hospitality and travel software must often **ingest legacy data**. The following encodings are the most common worldwide and should be supported for **decoding only**, with all data normalized to Unicode (UTF-8 NFC) after ingestion.

---

## Western & Central Europe
- **windows-1252** (CP1252, Windows Western)
- **ISO-8859-1** and **ISO-8859-15** (Latin-1/Latin-9; adds €)
- **windows-1250** / **ISO-8859-2** (Central European)
- **windows-1257** / **ISO-8859-13** (Baltic)

## Greek / Turkish
- **windows-1253** / **ISO-8859-7** (Greek)
- **windows-1254** / **ISO-8859-9** (Turkish)

## Cyrillic
- **windows-1251**
- **KOI8-R**, **KOI8-U**
- **ISO-8859-5**

## Hebrew / Arabic
- **windows-1255** / **ISO-8859-8** (Hebrew)
- **windows-1256** / **ISO-8859-6** (Arabic)

## Thai
- **TIS-620** (national standard)
- **windows-874** (Thai on Windows)

## East Asia
- **Simplified Chinese:** **GBK** (CP936), **GB2312** (older), **GB18030** (modern national standard), **HZ-GB-2312** (email legacy)
- **Traditional Chinese:** **Big5** (CP950)
- **Japanese:** **Shift_JIS** / **Windows-31J (CP932)**, **EUC-JP**, **ISO-2022-JP**
- **Korean:** **EUC-KR** / **CP949**, **ISO-2022-KR**

## “Museum Pieces” Occasionally Seen
- **MacRoman** (classic Mac OS)
- **ISO-8859-3** (Maltese/Turkic)

---

# Citing and Implementing Encodings

| Purpose | Source / Standard |
|----------|------------------|
| **Label list & browser compatibility** | WHATWG Encoding Standard |
| **Canonical encoding names** | IANA Character Sets registry |
| **Windows code pages** | Microsoft Code Page documentation |
| **Chinese mandatory encoding** | GB 18030–2022 (PRC national standard) |
| **Thai official encoding** | TIS-620 |

---

# Policy Recommendations

1. **Emit UTF‑8 only.** All outbound data and at-rest storage **MUST be UTF‑8** (RFC 3629, RFC 8259, RFC 7493 / I‑JSON).  
2. **Decode legacy, normalize to Unicode.** Accept the encodings above for input; convert immediately to UTF‑8 (NFC normalization).  
3. **Identify encodings by IANA name.** If a source specifies an encoding, it MUST use the IANA “preferred MIME name.” Implementations MAY accept aliases per WHATWG.  
4. **Clarify Latin‑1 behavior.** On the web, `ISO‑8859‑1` is treated as `windows‑1252`; only allow true Latin‑1 where explicitly required.  
5. **China-specific deployments.** For operations in mainland China or exchanges with Chinese GDS/CRS systems, **GB18030** must be accepted for decoding.  

---

# Key References

- **UTF‑8 encoding:** RFC 3629  
- **Unicode / ISO 10646:** Universal Character Set  
- **IANA Character Sets Registry** — canonical MIME names  
- **WHATWG Encoding Standard** — web and legacy mapping rules  
- **RFC 7493 (I‑JSON)** — mandates UTF‑8 for interoperable JSON  
- **GB 18030‑2022** — PRC national encoding requirement for Simplified Chinese

