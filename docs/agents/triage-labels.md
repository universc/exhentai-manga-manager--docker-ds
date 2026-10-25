# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

This repo keeps the default vocabulary unchanged — no overrides.

## Creating the labels on this repo

`wontfix` already exists (GitHub's default set). The other four triage labels and all five `wayfinder:*` labels do not, and must be created once:

```bash
gh label create needs-triage     --color fbca04 --description "Maintainer needs to evaluate this issue (unexamined, awaiting diagnosis)"
gh label create needs-info       --color 5319e7 --description "Waiting on reporter for more information"
gh label create ready-for-agent  --color 0e8a16 --description "Fully specified, ready for an AFK agent to implement"
gh label create ready-for-human  --color b60205 --description "Requires human implementation"
gh label create wayfinder:map        --color 8b5cf6 --description "The map issue (wayfinder) — owns Notes/Decisions so far/Fog"
gh label create wayfinder:research   --color 0ea5e9 --description "Research ticket (wayfinder)"
gh label create wayfinder:prototype  --color f59e0b --description "Prototype ticket (wayfinder)"
gh label create wayfinder:grilling   --color 9D7CD8 --description "Open decision/discussion ticket (wayfinder grilling type)"
gh label create wayfinder:task       --color 10b981 --description "Task ticket (wayfinder)"
```

Re-running any of these after it exists fails harmlessly (`already exists`); add `--force` to overwrite the colour/description instead.
