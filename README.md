# Inbox-to-Action AI

Manifest V3 Gmail productivity extension with a compact popup and larger dashboard. Inbox-row analysis is manual and local: the user clicks **Analyze Visible Inbox**, and the extension examines only currently viewport-visible Gmail rows. It reads sender, subject, snippet, date, labels, attachment indicator, unread state, and conversation URL. It does not open messages or read their row message bodies. Deep conversation analysis remains a separate explicit action.

## Implemented features

- Visible inbox dashboard with unread-first priority, progress, counts, category filters, last analysis time, manual refresh, local explanations/confidence, open-conversation action, and per-row feedback. Career categories include opportunities, recruiter communications, application updates, interviews, assessments, offers, selection, rejection, and shortlist outcomes.
- Local rules identify urgent, important, reply-required, pending-action, waiting, informational, and promotional rows. Resolved payments/refunds, OTP notifications, promotional urgency, negative commitments, VIP senders, and muted senders receive conservative handling.
- Optional local VIP and muted sender lists; mute takes precedence. Feedback stores simple per-sender/category confidence adjustments. This is not machine learning.
- Row actions can create a local task only after a confirmation prompt, or prefill the Career Tracker for user review and save. The tracker supports company, role, dates, status updates, notes, source-email links, editing, deletion, and same-conversation duplicate prevention. Existing task and reminder views are retained. Smart Reply includes five requested writing modes and local profile-aware replies based on the opened email text. Job replies match mentioned requirements to profile skills and relevant projects, include supported measurable achievements, and disclose missing experience areas such as VAT/accounting without claiming them. Job opportunity and recruiter drafts target 100-160 words when the email supports that detail. Profile data is stored under `personalProfile` in `chrome.storage.local`. A minimized professional profile is included in reply requests only after separate AI profile-context consent; direct contact identifiers are never sent. The Reminders page organizes due dates; it does not schedule Chrome notifications.
- Visible row metadata and snippets from the last analysis are stored in chrome.storage.local so results render without rereading Gmail. Clear analysis data does not clear tasks.
- Model-generated replies require a configured schema-v2 backend, exact-origin Chrome permission, a short-lived app token, and email-content consent. Sending minimized professional profile context requires a separate opt-in. This repository contains the extension client and backend contract, but no deployed AI server or provider configuration. Sensitive-code/password/bank indicators block external requests; email addresses and phone numbers are redacted. Provider API keys stay server-side.

## Install and use

1. Open chrome://extensions and enable Developer mode.
2. Choose Load unpacked and select this folder.
3. Open Gmail. Click the extension and choose Analyze Visible Inbox. The extension will not read rows until that click.
4. To analyze more rows, scroll in Gmail so the desired rows are visible, then click Refresh Analysis. No observer or automatic scan runs.
5. Select a category filter, open a source conversation by clicking its button, or create a local task using its explicit confirmation button.
6. For full-message analysis, open a specific conversation and use Analyze current email separately.

After changes, click Reload on the extension in chrome://extensions and reopen it. Chrome/Gmail DOM extraction must be tested manually against your Gmail account and layout.

## Privacy and permissions

- activeTab and scripting permit user-invoked access and injected reading code. The extension does not request permanent Gmail host access.
- storage stores tasks, preferences, and the last visible-row analysis locally; session data holds temporary email context and backend token.
- clipboardWrite supports user-clicked Copy Reply.
- Optional https://*/* is not granted by default; Settings requests the exact configured backend origin. It is not used for default visible-inbox classification.
- No Gmail password, automatic inbox polling, automatic open, automatic send, or default external AI processing.
- External AI, when configured and consented, receives data only after an explicit deep-analysis/reply action. Request payloads redact email addresses and phone numbers; password/OTP/bank/security-code indicators block the request. See backend-contract.md for server-side requirements.

## Tests

Run `node --test tests/*.test.js` for local classification fixtures, synthetic Gmail DOM reader checks, and the requested email scenarios plus role-fit, word-count, honesty, and personalization checks. Run node --check on popup.js, profile.js, background.js, and content.js for syntax checks. Profile reply scenarios are in `tests/profile-replies.test.js`. Fixture tests cover local row classification, confidence/explanations, VIP/muted rules, deterministic results, and key false-positive cases. They do not execute against the actual Gmail DOM or live Chrome interactions. See QA-REPORT.md for verification status and manual test steps.

## Project files

- manifest.json - MV3 metadata and minimum permissions.
- popup.html / popup.css - premium compact popup UI.
- dashboard.html - full dashboard UI.
- popup.js - dashboard, inbox analysis flow, tasks, profile editor, reply flow, preferences, and Chrome API orchestration.
- profile.js - local profile-aware reply generation, consent-gated AI payload construction, and draft fact checks.
- background.js - local action extraction and visible-row classification.
- content.js - explicit Gmail open-conversation reader, visible-row metadata reader, and reply editor helper.
- tests/fixtures/visible-emails.js, tests/visible-inbox.test.js, and tests/content-reader.test.js - classification fixtures, synthetic DOM checks, and Node tests.
- backend-contract.md and QA-REPORT.md - backend requirements and verification record.
## Known gaps

The extension does not yet track commitment lifecycle across threads, perform storage schema migrations or exports, schedule background notifications, or include a production AI server. See QA-REPORT.md for the continuation checklist. Gmail row and reply-editor DOM integration remain unverified until tested in Chrome.


Career classification and job-detail extraction use local pattern rules, not an AI model. Job fields are extracted only from explicitly labeled visible text; missing details stay blank. The Career Tracker is stored locally and does not infer that an application was submitted. PDF resume parsing/profile management is not implemented. The optional backend is not configured in this project.