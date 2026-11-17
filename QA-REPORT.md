# QA report - Inbox-to-Action AI 1.4.0

Status terms: VERIFIED-RUN means executed in this workspace; VERIFIED-CODE means inspected in source but not executed in a live browser; UNVERIFIED means requires Chrome/Gmail or a backend not available here; BROKEN means a known failed check.

## VERIFIED-RUN

- Manifest parsed as JSON and declares Manifest V3.
- node --check passed for every project JavaScript file and test JavaScript file.
- node --test tests/*.test.js passed: 7 tests and 42 classification fixtures, zero failures.
- Fixture checks cover urgent messages, ordinary information, newsletter/ad/false urgency, OTP, completed payment/refund, payment/refund requests, interview/meeting/deadline, reply requests, sender/user commitments and negative promises, generic questions, forwarded/quoted samples, ambiguity, French text, promotion, VIP/muted senders, and nine job/career classifications.
- Synthetic DOM tests verify row metadata extraction, viewport exclusion, original Gmail URL construction, and that inbox-row reading does not query message-body selectors.
- Static validation found unique IDs in both HTML documents and all static JS ID references are present (optional quick-action references are guarded).

## VERIFIED-CODE

- Visible Inbox is a separate click-triggered path. It queries rendered Gmail row candidates intersecting the viewport and reads sender, subject, snippet, date, labels, attachment marker, unread state, thread identifier, and same-origin conversation URL. It does not query email body elements.
- No MutationObserver, periodic polling, inbox fetch, automatic message opening, or remote AI request is used in this flow. Manual Refresh re-reads visible rows.
- Row classification and confidence/explanation are computed locally in background.js. External AI consent does not affect inbox-row analysis. Career categories cover job opportunities, recruiter/HR, applications, interviews, assessments, shortlist, rejection, selection, and offers. Career details are extracted only when explicitly labeled in the analyzed text.
- Career Tracker records are explicitly saved by the user, stored locally, editable/deletable, filterable by status, linked to a source Gmail conversation when available, and protected against same-thread duplicates. This is code-reviewed, not live-click tested.
- The user must confirm before a row creates a task. Inbox HTML rendering escapes extracted text; conversation navigation accepts only https://mail.google.com.
- VIP/muted preferences, feedback, and last analysis are in Chrome local storage. Feedback adjusts a simple confidence score; it is not model training.
- Deep email analysis, task CRUD, local reminders view, Smart Reply, and optional backend flows remain wired. The Reminders page displays due-date categories; it does not schedule Chrome alarms/notifications.
- External backend payloads are blocked when password/OTP/security/bank identifiers are detected and redact email addresses and phone numbers. The server must treat email content as untrusted prompt input.

## UNVERIFIED - manual Chrome/Gmail checks required

- Gmail row selectors across account switching, inbox categories, layouts, theme/density, scrolling, and current Gmail releases. The likely source of the reported error was the previous reader requiring one main container, three row selectors, and specific hash link fragments; no live Gmail session was available to confirm which condition failed at runtime.
- Verify Analyze Visible Inbox returns only rows actually visible in the viewport and does not read hidden rows; compare counts in representative inboxes.
- Test unread/date/label/attachment metadata, unread-first preference, category filters, explanations, feedback, VIP/mute, clear analysis history, manual refresh, task confirmation, and source conversation navigation.
- Track a job email, verify the prefilled company/role fields only use explicit labels, save/edit/filter/delete the application, and verify reopening the same conversation does not create a duplicate.
- Test popup and full dashboard rendering, keyboard focus, and screen-reader status feedback.
- Test deep-message extraction, threaded Reply editor insertion, clipboard, and Gmail draft persistence.
- Test backend permissions, auth expiry, CORS, sensitive-content blocking, and server output with a secured backend. No backend endpoint/token was supplied.

## Manual test steps

1. Load this folder from chrome://extensions with Developer mode.
2. Open Gmail Inbox, wait for rows, click the extension, then click Analyze Visible Inbox. Confirm visible row count and no message opens.
3. Scroll down to another group of rows and click Refresh Analysis. Verify results reflect only rows currently on screen.
4. Filter categories. Use helpful/not-helpful feedback; update VIP/muted preferences in Settings and reclassify.
5. Click Open conversation for a row and confirm it opens only after the click. Click Create task, cancel once, then confirm once and verify the task appears locally.
6. Disable inbox analysis in Settings and confirm the button refuses to analyze. Re-enable and use Clear analysis data; verify tasks remain.
7. Track a job email, verify the prefilled fields, save/edit/filter/delete it, and confirm the same conversation is not added twice.
8. Separately open a message and test Analyze current email. Confirm deep reading remains user-triggered and message body content is not used by inbox-row analysis.

No live Chrome/Gmail execution is claimed in this report.
## Not implemented / continuation checklist

- Resume PDF extraction and profile management are not implemented.
- Deep commitment lifecycle across multiple messages: confirmation statuses, timeline/activity history, fulfillment/cancellation detection, and cross-thread linking.
- Task storage schema versioning/migrations, serialized multi-write protection, CSV/JSON export, and more granular To Do/In Progress/Waiting/Cancelled states.
- Scheduled Chrome alarms/notifications and daily briefing; the current Reminders page only organizes due dates in the UI.
- A production AI backend, authentication/token issuance, server deletion endpoint, model integration, and service-side no-retention enforcement.
- Automated integration tests for Gmail selectors, Chrome tab APIs, popup interactions, backend permission denial, and service-worker restart.
