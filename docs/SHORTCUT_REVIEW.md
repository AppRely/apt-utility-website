# Shortcut review for Mayank

Status: implemented locally; Mayank's review is pending. No message has been sent.

The [current shortcut inventory](USER_GUIDE.md#keyboard-shortcuts) documents playback, navigation, selection, views, operations, bulk actions, and suggestions. The dashboard's **Menu → Shortcuts** also lists these controls.

## Mappings to review

| Key | Current implementation | Reason |
| --- | --- | --- |
| B | Start / cancel Bulk Link | Requested mapping; previously assigned to Break. |
| F | Open Break confirmation | Replaces B, using a previously unused key. |
| V | Start / cancel Bulk Delete | Suggested key; unused, while D keeps single-object Delete. |
| Enter | Apply the active bulk action | Uses the same readiness and busy checks as the button. |

Review question: approve **B = Bulk Link**, **V = Bulk Delete**, and moving **Break to F**, or choose alternate keys for Bulk Delete and Break?

## Behavior to review

- Bulk Link needs at least two loaded objects; Bulk Delete needs at least one. Pending range loads block submission.
- Enter executes the reviewed bulk list directly, like the existing action button. Bulk Delete removes entire trajectories.
- Pressing the mode key again cancels it; switching modes clears the previous list.
- S / E uses the last selected bulk object's range. Number keys or video clicks add objects.
- Typing, open dialogs, modifier chords, held-key repeats, and in-flight mutations do not trigger bulk shortcuts. Focused buttons and links retain their normal Enter behavior.

## Shortcut menu corrections

- Added bulk actions, Enter confirmation, Undo/Redo, and playback-speed controls.
- Added a Suggestions section for Y, E, L, and choosing another suggestion by clicking.
- Removed obsolete L/J five-second seek entries: L is Link and J has no handler.
- Updated A to describe automatic fitting of two selected objects.
- Updated Break from B to F throughout the shortcut menu and user guide.
