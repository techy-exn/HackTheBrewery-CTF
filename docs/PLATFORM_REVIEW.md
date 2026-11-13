# Platform review — 10 November 2026

Reviewed the local Node server, participant experience, admin studio, persistence, scoring, media, launcher, and workshop-copy workflow. The current application uses Node built-in modules and SQLite; no additional packages were introduced.

## Implemented fixes

| Area | Problem addressed | Result |
| --- | --- | --- |
| Scoring | Concurrent correct submissions could award the same challenge twice. | Submission checks and awards run together in a database transaction. |
| Instructor review | Repeated manual responses and approvals could multiply awards. | Pending responses are reused, repeated approvals are idempotent, and older duplicate pending responses close without another award. Existing scores were not recalculated. |
| Personal progress | The home score depended on the top-25 public leaderboard. | The server supplies the participant's own score and completed count independently of leaderboard visibility or rank. |
| Account setup | Simultaneous first-time setup requests could both create an administrator. | Setup eligibility is checked again within the creation transaction. |
| Challenge access | Signing in from a challenge left the old signed-out view open. | The same challenge refreshes after sign-in while retaining its context. |
| Reference navigation | Credentials opened behind the challenge dialog. | The reference becomes visible, with a return button restoring the flag draft, open hints, and scroll. |
| Admin drafts | A new placeholder could be published by saving another admin tab. | New challenge and page drafts stay separate from saved content and begin unpublished. |
| Failed saves | Failed saves/deletions could leave the in-memory content appearing changed. | Canonical content changes only after the server accepts the save. |
| Hint editing | Removed hints could break the student view or misstate paid deductions. | Missing hint histories produce a clear instructor notice; displayed available points use recorded costs. |
| Prerequisites | Deleting a required challenge or importing a cycle could lock students permanently. | Missing, self-referencing, and cyclic dependencies are rejected before content replacement. |
| Media | Names with spaces or parentheses could break Markdown links and artwork settings. | The media library and artwork settings use consistent, safely encoded local URLs. |
| Content rendering | Unknown HTML wrappers could leave unsafe descendant attributes in rendered content. | Descendants are sanitized before the wrapper is removed. |
| Dialog layout | Wrapped headers could produce nested scrolling. | The challenge uses a fixed header and one scrolling body. |
| Windows startup | Any listener on port 3000 was treated as this workshop; the browser opened before readiness. | The launcher honors PORT/HOST, verifies runtime support and project identity, and waits for readiness. |

## Verification

`tools/verify-platform.mjs` creates a disposable workshop beneath `.data/` and exercises the actual local API. It passed checks for concurrent setup, concurrent solves, manual approvals including a legacy duplicate, personal progress with scoreboard disabled, edited hint history, media filenames, invalid prerequisite imports, and launcher identification/port validation.

Browser checks in that disposable copy confirmed sign-in from an open challenge, draft retention after an incorrect flag, sequential hint opening and point labels, the Credentials return path, draft isolation while saving settings, content sanitization, and the dialog layout. The test copy omits workshop images; live image references were validated in the preceding content review. The API also confirmed that the unsaved admin draft was absent from persisted content.

The active workshop's content, participant accounts, and earned scores were preserved. Source syntax checks passed. This review covers the platform; it does not rerun the CloudShare attack and defense exercises.

## Next improvements, in priority order

1. **A workshop pack that includes images.** The current JSON export needs a separate image-folder copy. One portable file would make GUI-based reuse substantially easier.
2. **Stable topology associations and GUI topology editing.** Current phase matching depends on challenge titles. Renaming a challenge can detach its diagram, and another workshop retains the brewery's machines/routes. Store associations against stable challenge IDs, then expose machines, zones, links, and phases in Admin.
3. **Stable hint identities and safe live editing.** The current missing-hint guard does not identify every same-length reorder. Stable hint IDs would keep purchased access attached to the correct hint as content changes.
4. **Draft recovery and conflicting-edit protection.** New drafts survive admin-tab changes in memory, but browser refresh and unsaved edits to existing items still need recovery/warnings. Two admin tabs can also overwrite each other's whole-workshop snapshots; revision checks should reject stale saves.
5. **Live participant updates after instructor review.** An instructor approval should update the student's status, score, and topology without a manual reload, while preserving open forms.
6. **A clean Node distribution and complete branding controls.** A dedicated runtime folder would avoid confusion with legacy CTFd deployment files. Sidebar initials, secondary labels, and topology styling should be configurable for other workshops.

## Editing guidance

Use the Admin studio for normal workshop content, questions, hints, and appearance. Keep a content export before major changes. To start a different workshop with fresh participants, follow the README's fresh-copy procedure rather than importing into the old event database.
