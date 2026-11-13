---
name: fe
description: Router for the fe-* frontend architecture skills. Usage - /fe
disable-model-invocation: true
---

Pick the skill for the job and tell the user to run it (these skills are user-invoked):

| Goal                                                          | Run                    |
| ------------------------------------------------------------- | ---------------------- |
| Build or change a feature with clear ownership                | `/fe-apply-feature`    |
| Audit structure, get a ranked report (read-only)              | `/fe-check-structure`  |
| Fix a smell: split a module, break a cycle, move shared code  | `/fe-restructure`      |
| Review a diff or PR against the model (read-only)             | `/fe-review`           |
| Choose a framework, rendering mode, library, or package split | `/fe-decide`           |
| Turn boundaries into lint or CI rules, with negative tests    | `/fe-enforce`          |
| Write the project profile the others read                     | `/fe-init-profile`     |

The architecture model itself lives in the model-invoked `fe-architecture` skill. First run in a repo: `/fe-init-profile`, then `/fe-check-structure`.
