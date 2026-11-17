// Local, conservative extraction. It receives only the email explicitly read
// by content.js after a user presses Analyze or Read open email.
const ACTION_TYPES = new Set(['commitment','refund','payment','interview','deadline','response','document','meeting','followup']);
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'CLASSIFY_VISIBLE_INBOX') {
    try { const emails = Array.isArray(message.emails) ? message.emails.slice(0, 100) : []; sendResponse({ ok: true, classifications: emails.map(email => classifyVisibleEmail(email, message.preferences || {})) }); }
    catch (error) { sendResponse({ ok: false, error: error.message || 'Could not classify visible inbox.' }); }
    return false;
  }
  if (message?.type === 'CLASSIFY_VISIBLE_EMAIL') {
    try { sendResponse({ ok: true, classification: classifyVisibleEmail(message.email || {}, message.preferences || {}) }); }
    catch (error) { sendResponse({ ok: false, error: error.message || 'Could not classify visible email.' }); }
    return false;
  }
  if (message?.type !== 'ANALYZE_EMAIL') return false;
  try {
    const email = message.email || {};
    const text = String(email.text || '').replace(/\s+/g, ' ').trim();
    if (!text) { sendResponse({ ok: false, error: 'The open message did not contain readable text.' }); return false; }
    const actions = extractActions(email);
    const promotional = /\b(unsubscribe|limited time offer|discount code|sale ends|weekly newsletter|sponsored)\b/i.test(text);
    const career = classifyVisibleEmail({ sender: email.sender, senderEmail: email.senderEmail, subject: email.subject, snippet: text });
    const classification = {
      promotional,
      urgent: actions.some(action => action.priority === 'high') || /\b(urgent|immediately|asap|critical)\b/i.test(text),
      important: actions.some(action => ['payment','refund','interview','deadline','meeting'].includes(action.type)) || /\b(important|priority|action required)\b/i.test(text),
      requiresReply: actions.some(action => action.direction === 'you'),
      pendingAction: actions.some(action => action.direction === 'you'),
      waitingForSomeone: actions.some(action => action.direction === 'sender'),
      informational: actions.length === 0 && !promotional,
      career: career.category,
      careerConfidence: career.confidence,
      careerWhy: career.why,
      jobDetails: extractJobDetails(text)
    };
    sendResponse({ ok: true, actions, classification });
  } catch (error) { sendResponse({ ok: false, error: error.message || 'Could not analyze message.' }); }
  return false;
});

function classifyVisibleEmail(email, preferences = {}) {
  const subject = String(email.subject || ''), text = `${subject} ${email.snippet || ''}`.slice(0, 4000);
  const sender = String(email.senderEmail || email.sender || '').toLowerCase();
  const muted = (preferences.mutedSenders || []).some(value => sender.includes(String(value).toLowerCase()));
  const vip = (preferences.vipSenders || []).some(value => sender.includes(String(value).toLowerCase()));
  const promotional = /\b(unsubscribe|newsletter|sale|discount|promo code|sponsored|marketing update)\b/i.test(text);
  const automated = /\b(one[- ]time (?:password|code|passcode)|verification code|security code|do not reply|no[- ]reply)\b/i.test(text);
  const alreadyResolved = /\b(payment (?:was )?received|paid in full|refund (?:was )?(?:issued|processed|completed)|has been refunded|already reimbursed|transaction complete)\b/i.test(text);
  const commitment = !/\b(?:not|never|no way|joking|kidding|sarcasm)\b/i.test(text) && /\b(i(?:'|’)ll|i will|we(?:'|’)ll|we will|promise to|committed to)\b.{0,80}\b(send|share|provide|deliver|pay|refund|follow up|confirm|get back|call|schedule)\b/i.test(text);
  const userCommitment = /\b(?:you promised|you agreed|you committed|you said you would)\b.{0,80}\b(send|share|provide|deliver|pay|refund|follow up|confirm|get back|call|schedule)\b/i.test(text);
  const waiting = /\b(waiting for|still waiting|awaiting|has not (?:sent|paid|replied)|haven't received|hasn't arrived)\b/i.test(text);
  const refundPayment = !alreadyResolved && /\b(refund|reimburse|payment|invoice|amount due|unpaid)\b/i.test(text);
  const interviewMeeting = /\b(interview|meeting|appointment|screening call|recruiter call)\b/i.test(text);
  const deadline = /\b(deadline|due by|due date|submit by|no later than|by (?:today|tomorrow|monday|tuesday|wednesday|thursday|friday))\b/i.test(text);
  const document = !/\b(?:will not|won't|never|not going to)\b/i.test(text) && /\b(send|share|attach|provide|submit)\b.{0,40}\b(file|document|report|contract|proposal|attachment|spreadsheet)\b/i.test(text);
  const askedReply = /\b(please (?:reply|respond|confirm|let me know)|could you (?:reply|respond|confirm|let me know)|can you (?:reply|respond|confirm|let me know)|your response|reply by|respond by|confirm by|waiting for your reply)\b/i.test(text);
  const rejected = /\b(application (?:was )?rejected|unfortunately.{0,50}(?:not selected|unable to move forward|will not move forward)|unsuccessful application|we have decided not to proceed)\b/i.test(text);
  const offer = /\b(offer letter|job offer|employment offer|pleased to offer you|offer of employment)\b/i.test(text);
  const selected = /\b(you have been selected|selected for (?:the )?(?:role|position|next round|final round)|selection confirmed)\b/i.test(text);
  const shortlisted = /\b(shortlisted|short-listed|shortlist)\b/i.test(text);
  const assessment = /\b(assessment invitation|assessment test|coding test|take-home test|technical test|online assessment)\b/i.test(text);
  const interviewInvite = /\b(interview invitation|invite you to interview|interview is (?:scheduled|confirmed)|interview details|schedule.{0,30}interview)\b/i.test(text);
  const applicationUpdate = /\b(application received|application status|application update|under review|thank you for applying|received your application)\b/i.test(text);
  const recruiter = /\b(recruiter|human resources|\bHR\b|hiring manager)\b/i.test(text);
  const jobOpportunity = /\b(job opportunity|career opportunity|job opening|opening for|position available|role at|vacancy)\b/i.test(text);
  const followup = /\b(follow[- ]?up|following up|check(?:ing)? in on (?:my )?application|update on (?:my )?application)\b/i.test(text);
  const jobContext = rejected || offer || selected || shortlisted || assessment || interviewInvite || applicationUpdate || recruiter || jobOpportunity;
  const direct = askedReply || document || deadline || interviewMeeting || refundPayment || userCommitment || followup;
  const jobDetails = extractJobDetails(text);
  let category = 'informational', why = 'No clear action signal in the visible sender, subject, or snippet.';
  if (!muted && !promotional && !automated) {
    if (/\b(urgent|asap|immediately|critical|action required)\b/i.test(text) && direct) { category = 'urgent'; why = 'Action language and an explicit urgency cue appear in the visible email preview.'; }
    else if (rejected) { category = 'rejected'; why = 'The email preview reports an unsuccessful application or hiring decision.'; }
    else if (offer) { category = 'offer-letters'; why = 'The email preview mentions an employment offer or offer letter.'; }
    else if (selected) { category = 'selected'; why = 'The email preview says you were selected for a role or next stage.'; }
    else if (shortlisted) { category = 'shortlisted'; why = 'The email preview says you were shortlisted.'; }
    else if (assessment) { category = 'assessment-test'; why = 'The email preview mentions an assessment or hiring test.'; }
    else if (interviewInvite || (interviewMeeting && jobContext)) { category = 'interview-invitations'; why = 'The email preview contains interview scheduling information.'; }
    else if (applicationUpdate) { category = 'application-updates'; why = 'The email preview contains an application status update.'; }
    else if (recruiter && jobContext) { category = 'hr-recruiter'; why = 'The email preview appears to be recruiter or HR communication.'; }
    else if (jobOpportunity) { category = 'job-opportunities'; why = 'The email preview describes a job or career opportunity.'; }
    else if (askedReply) { category = 'reply-required'; why = 'The visible preview asks for a response or confirmation.'; }
    else if (userCommitment) { category = 'pending-action'; why = 'The visible preview refers to a commitment you made.'; }
    else if (followup) { category = 'followup-required'; why = 'The visible preview indicates that a follow-up is due.'; }
    else if (commitment || waiting) { category = 'waiting'; why = commitment ? 'The visible preview contains a sender commitment.' : 'The visible preview says an action or response is still pending.'; }
    else if (deadline || refundPayment || interviewMeeting || document) { category = 'important'; why = deadline ? 'A deadline is mentioned in the visible preview.' : refundPayment ? 'A payment or refund is mentioned in the visible preview.' : interviewMeeting ? 'A meeting is mentioned in the visible preview.' : 'A requested document is mentioned in the visible preview.'; }
    else if (direct) { category = 'pending-action'; why = 'The visible preview contains a concrete next action.'; }
  }
  if (muted) { category = 'informational'; why = 'Sender is muted in your local preferences.'; }
  else if (promotional) { category = 'promotional'; why = 'The visible preview contains newsletter or promotional signals.'; }
  else if (automated || alreadyResolved) { category = 'informational'; why = automated ? 'The visible preview resembles an automated security or no-reply message.' : 'The visible preview suggests this payment or refund is already complete.'; }
  if (vip && !muted && category === 'informational' && !promotional && !automated) { category = 'important'; why = 'VIP sender preference raised this email for review.'; }
  const feedback = preferences.feedback?.[`${sender}|${category}`];
  const confidence = (direct || commitment || waiting ? 0.82 : promotional || automated ? 0.92 : 0.56) + (vip ? 0.08 : 0) + (feedback === 'up' ? 0.05 : feedback === 'down' ? -0.15 : 0);
  const priority = category === 'urgent' ? 'high' : ['important','reply-required','pending-action','waiting','followup-required','interview-invitations','assessment-test','offer-letters'].includes(category) ? 'normal' : 'low';
  return { category, priority, confidence: Math.max(0.3, Math.min(0.98, confidence + (jobContext ? 0.04 : 0))), why, recommendation: recommendationFor(category), vip, unread: !!email.unread, commitment: !!(commitment || userCommitment), jobDetails };
}

function extractJobDetails(text) {
  const first = expression => { const match = String(text || '').match(expression); return match ? match[1].trim().slice(0, 180) : ''; };
  return {
    company: first(/\bcompany\s*:\s*([^.;\n]+)/i),
    jobTitle: first(/\b(?:job title|role|position)\s*:\s*([^.;\n]+)/i),
    location: first(/\b(?:job )?location\s*:\s*([^.;\n]+)/i),
    salary: first(/\b(?:salary|compensation|ctc)\s*:\s*([^.;\n]+)/i),
    experience: first(/\bexperience(?: required)?\s*:\s*([^.;\n]+)/i),
    skills: first(/\b(?:required )?skills\s*:\s*([^.;\n]+)/i),
    recruiter: first(/\brecruiter\s*:\s*([^.;\n]+)/i),
    interviewDate: first(/\binterview(?: date)?\s*:\s*([^.;\n]+)/i),
    interviewTime: first(/\binterview time\s*:\s*([^.;\n]+)/i),
    interviewMode: first(/\binterview mode\s*:\s*([^.;\n]+)/i),
    interviewLocation: first(/\binterview location\s*:\s*([^.;\n]+)/i),
    meetingLink: first(/\bmeeting link\s*:\s*(https?:\/\/[^\s]+)/i),
    assessmentDeadline: first(/\bassessment deadline\s*:\s*([^.;\n]+)/i),
    documents: first(/\bdocuments required\s*:\s*([^.;\n]+)/i),
    joiningDate: first(/\bjoining date\s*:\s*([^.;\n]+)/i)
  };
}
function recommendationFor(category) {
  return ({'job-opportunities':'Review the role requirements and decide whether to apply.','interview-invitations':'Confirm the schedule and prepare for the interview.','hr-recruiter':'Review the recruiter message and respond if a question is waiting.','application-updates':'Review the status and note any requested next step.',shortlisted:'Prepare for the next selection stage.',rejected:'Review the decision; no follow-up task is created automatically.',selected:'Review the next-step instructions and verify dates.', 'offer-letters':'Review offer terms carefully before replying.','assessment-test':'Check the assessment instructions and deadline.','reply-required':'Draft and review a response.','followup-required':'Review the last contact and prepare a follow-up.','important':'Review the deadline or financial detail.','pending-action':'Review the action you previously committed to.','waiting':'Track the sender commitment and follow up if overdue.',promotional:'No action recommended.',informational:'No action recommended.'})[category] || 'Review the visible email details.';
}

function extractActions(email) {
  const text = String(email.text || '').replace(/\s+/g, ' ').trim();
  const actions = [];
  const sentences = (text.match(/[^.!?]+[.!?]?/g) || [text]).map(sentence => sentence.trim()).filter(Boolean);
  const push = (type, sentence, direction = 'you', nextAction = '') => {
    if (!sentence || actions.some(action => normalize(action.description) === normalize(sentence))) return;
    const dueDate = extractDate(sentence);
    actions.push({
      requiresAction: true, type, direction,
      title: makeTitle(type, sentence), description: sentence.slice(0, 650),
      why: reasonFor(type, sentence, direction), nextAction: nextAction || actionFor(type, direction),
      dueDate, priority: priorityFor(sentence, dueDate), status: direction === 'sender' ? 'waiting' : 'pending',
      sender: email.sender || '', senderEmail: email.senderEmail || '', recipients: email.recipients || [],
      emailSubject: email.subject || '', threadId: email.threadId || '', messageId: email.messageId || '',
      conversationUrl: safeGmailUrl(email.conversationUrl), source: sentence.slice(0, 500)
    });
  };
  const hasActionableAsk = sentence => /\b(please|could you|can you|would you|please make sure|action required|your response|reply by|respond by|confirm by|send (?:me|us|the)|share (?:the|your|a)|submit|complete|sign and return|let me know|kindly)\b/i.test(sentence);

  for (const sentence of sentences) {
    if (/\b(refund|reimburse(?:ment)?|money back)\b/i.test(sentence) && /\b(pending|awaiting|will (?:be )?(?:issue|process|send)|please (?:issue|process|send)|not received|still waiting|hasn't arrived|has not arrived)\b/i.test(sentence))
      push('refund', sentence, /\b(please issue|please process|please send)\b/i.test(sentence) ? 'you' : 'sender');

    if (/\b(payment|invoice|amount due|transfer|deposit|balance)\b/i.test(sentence) && /\b(due|unpaid|outstanding|pending|pay by|pay today|please pay|will pay|transfer by)\b/i.test(sentence))
      push('payment', sentence, /\b(i will pay|we will pay|we'll pay|i'll pay|will transfer|will send the payment)\b/i.test(sentence) ? 'sender' : 'you');

    if (/\b(interview|screening call|recruiter call)\b/i.test(sentence) && /\b(scheduled|confirmed|invite|invited|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at \d|tomorrow|next week)\b/i.test(sentence))
      push('interview', sentence, 'you', 'Review the interview details and prepare.');

    if (/\b(meeting|appointment|call)\b/i.test(sentence) && /\b(scheduled|confirmed|invite|invited|calendar|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at \d|tomorrow|next week)\b/i.test(sentence))
      push('meeting', sentence, 'you', 'Confirm the time and prepare for the meeting.');

    if (/\b(deadline|due date|due by|submit by|no later than|must be submitted|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\w+ \d{1,2}))\b/i.test(sentence) && !(/\b(i|we)\s*(?:will|'ll|shall)\s+(?:send|share|provide|deliver)\b/i.test(sentence)) && !(/\b(document|file|report|contract|proposal|attachment|spreadsheet|presentation)\b/i.test(sentence) && hasActionableAsk(sentence) && !(/\b(i|we)\s*(?:will|'ll|shall)\s+(?:send|share|provide|deliver)\b/i.test(sentence))))
      push('deadline', sentence, 'you');

    if (/\b(document|file|report|contract|proposal|attachment|spreadsheet|presentation)\b/i.test(sentence) && hasActionableAsk(sentence) && !(/\b(i|we)\s*(?:will|'ll|shall)\s+(?:send|share|provide|deliver)\b/i.test(sentence)))
      push('document', sentence, 'you', 'Prepare and send the requested document or file.');

    if (/\b(i|we)\s*(?:will|'ll|shall)\s+(?:send|share|provide|deliver|get back|follow up|pay|refund|contact|confirm|call|schedule|return)\b|\bpromise to\b|\bcommitted to\b/i.test(sentence))
      push('commitment', sentence, 'sender', 'Track the sender’s promised follow-up.');

    if (hasActionableAsk(sentence) && /\b(reply|respond|confirm|answer|let me know|get back to me)\b/i.test(sentence))
      push('response', sentence, 'you', 'Reply or confirm the requested information.');
  }

  // A question by itself is not enough. Only clear direct asks create a task.
  const duplicateKeys = new Set();
  return actions.filter(action => {
    if (!ACTION_TYPES.has(action.type)) return false;
    const key = `${action.messageId || action.threadId || email.subject || ''}|${action.type}|${normalize(action.description)}`;
    if (duplicateKeys.has(key)) return false;
    duplicateKeys.add(key);
    return true;
  });
}
function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function safeGmailUrl(value) { try { const url = new URL(value); return url.origin === 'https://mail.google.com' ? url.href : ''; } catch { return ''; } }
function actionFor(type, direction) {
  if (direction === 'sender') return 'Wait for the sender and follow up if it does not arrive.';
  return ({ refund:'Check the refund status and follow up if it is still pending.', payment:'Review the amount and make or confirm the payment.', interview:'Review the interview details and prepare.', deadline:'Complete the requested work before the due date.', document:'Prepare and send the requested file.', meeting:'Confirm the calendar details and prepare.', response:'Write and send a reply.' })[type] || 'Review the message and decide on the next step.';
}
function reasonFor(type, sentence, direction) { return direction === 'sender' ? 'The sender describes a future commitment.' : `The message contains an actionable ${type} request or date.`; }
function makeTitle(type, sentence) {
  const clean = sentence.replace(/\s+/g, ' ').trim();
  const label = ({commitment:'Track commitment',refund:'Follow up on refund',payment:'Resolve payment',interview:'Prepare for interview',deadline:'Meet deadline',response:'Reply to sender',document:'Send requested document',meeting:'Prepare for meeting'})[type] || 'Follow up';
  return clean.length < 95 ? `${label}: ${clean}` : `${label}: ${clean.slice(0, 88).trim()}…`;
}
function priorityFor(sentence, date) {
  if (/\b(urgent|asap|immediately|overdue|final notice|today)\b/i.test(sentence)) return 'high';
  if (date) { const days = (new Date(`${date}T23:59:59`) - Date.now()) / 86400000; if (days < 3) return 'high'; }
  return /\b(important|time sensitive|action required)\b/i.test(sentence) ? 'high' : 'normal';
}
function extractDate(text) {
  const month='January|February|March|April|May|June|July|August|September|October|November|December';
  const full=String(text).match(new RegExp(`\\b(?:(${month})\\s+\\d{1,2}(?:,?\\s+\\d{4})?|\\d{1,2}\\s+(?:${month})(?:\\s+\\d{4})?)\\b`,'i'));
  if(full){const parsed=new Date(full[0]);if(!Number.isNaN(parsed.getTime()))return isoDate(parsed);}
  const rel=String(text).match(/\b(today|tomorrow|next week|next (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i);
  if(!rel)return'';const date=new Date();
  if(/^tomorrow$/i.test(rel[1]))date.setDate(date.getDate()+1);else if(/^next week$/i.test(rel[1]))date.setDate(date.getDate()+7);else if(!/^today$/i.test(rel[1])){const days={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6},target=days[rel[2].toLowerCase()];date.setDate(date.getDate()+((target-date.getDay()+7)%7||7));}
  return isoDate(date);
}
function isoDate(date){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}




