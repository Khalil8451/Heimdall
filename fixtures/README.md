# Synthetic design fixtures

These are hand-authored acceptance inputs and expected behaviors for future implementation. Current checks verify JSON syntax only. They do not execute a comparator, validate OpenAPI semantics, or prove a product result.

- [Base OpenAPI](openapi/base.json) and [changed OpenAPI](openapi/target.json): required response `user.name` becomes required `user.fullName` on GET /users/{id}.
- [Consumer declarations](evidence/declared.json): billing-ui selects name; profile-summary selects id. This is an illustrative manifest draft, not an implemented HTTP payload.
- [Expected outcomes](expected.json): a semantic oracle for the direct-impact workflow, not captured engine output.
- [Graph cases](graphs/cases.json): chain, diamond, self-cycle and multi-node cycle for later traversal tests.

Future implementation tests must independently validate the schemas, pin engine output and map exact pointers. Expand the corpus with invalid JSON/duplicate keys, remote/file references, recursive/allOf schemas, stale/conflicting evidence, retry scenarios and resource limits. Do not replace expected semantics simply because an engine returns something else. Internal testing plans are maintained separately; these public fixtures remain synthetic.
