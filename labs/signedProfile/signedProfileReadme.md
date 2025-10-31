SignedProfile Readme
====================
This set of files was an early attempt at modelling a travel profile within a signed envelope following the structural/logical model of a W3C Verifiable Credential.

TravelProfile.puml
 - top class
 - includes identifiers
    - UUIEDv7 - which is UID that the airline industry uses today targetted for non-SSI systems
    - W3C DID - for SSI systems
 - includes structure for proofs, public keys of the signing by the Controller DID for the TravelProfile DID (e.g., the Traveler or AI agent actin on behalf of the traveler)

 ProfileIdentifier/puml
  - early protoype of the identifiers (UUIDv7 and DID)

Some use cases
 - MicroSharing_Sequence.puml 
    - Traveler Profile Selective Disclosure sequence
  - NDC_interop_Context.puml
    - IATA New Distribution Control 
    - interop of NDC messages