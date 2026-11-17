'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../profile.js');
const { DEFAULT_PROFILE, generateReplies, professionalContextForAI, buildAIReplyPayload, validateAIDraft } = globalThis.InboxActionProfile;

const cases = [
  ['Interview invitation', 'Interview invitation', 'We would like to invite you to interview for our Data Analyst opening next week. Please let us know your availability.', 'available time slots'],
  ['Recruiter resume request', 'Data Analyst role', 'Could you please share your resume for the Data Analyst position?', 'résumé'],
  ['HR availability request', 'Interview scheduling', 'Please provide your availability for a first-round interview.', 'available time slots'],
  ['Interview rescheduling', 'Reschedule interview', 'We need to reschedule your interview. Please send a few times that work for you.', 'alternative interview times'],
  ['Salary discussion', 'Compensation discussion', 'What are your salary expectations for this position?', 'budgeted range'],
  ['Job application follow-up', 'Application status', 'I am following up to ask if there is any update on my application for the Data Analyst role.', 'remain very interested'],
  ['Simple confirmation', 'Confirm receipt', 'Please confirm receipt of this email.', 'Confirmed, thank you'],
  ['Technical opportunity', 'Python Developer opportunity', 'We are hiring a Python Developer. Are you interested in learning more about this role?', 'Python']
];

for (const [label, subject, text, expected] of cases) {
  test(label, () => {
    const replies = generateReplies({ sender: 'Alex Morgan', subject, text }, 'professional', DEFAULT_PROFILE);
    assert.equal(replies.length, 3);
    assert.match(replies[0].text, /Puppala Manikanta/);
    assert.ok(replies[0].text.toLowerCase().includes(expected.toLowerCase()), replies[0].text);
    assert.doesNotMatch(replies[0].text, /\[(?:your name|company name|add response|insert details|your reply|your availability)/i);
    assert.doesNotMatch(replies[0].text, /two years/i);
  });
}

test('profile is not needed to answer an availability request with invented dates', () => {
  const [reply] = generateReplies({ sender: 'HR', subject: 'Interview', text: 'What times are you available tomorrow?' }, 'short', DEFAULT_PROFILE);
  assert.doesNotMatch(reply.text, /\b(?:at|on)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i);
  assert.match(reply.text, /share the available time slots|available time slots/i);
});

test('irrelevant personal details are omitted from a simple acknowledgment', () => {
  const [reply] = generateReplies({ sender: 'Alex', subject: 'Receipt', text: 'Please confirm receipt.' }, 'short', DEFAULT_PROFILE);
  assert.doesNotMatch(reply.text, /Wipro|Python|8008120597|8\.7\/10/i);
});

test('interview draft preserves a stated schedule without claiming availability', () => {
  const [reply] = generateReplies({ sender: 'Alex', subject: 'Data Analyst interview', text: 'We invite you for a Data Analyst interview next Monday. Please confirm your availability.' }, 'professional', DEFAULT_PROFILE);
  assert.match(reply.text, /next Monday/i);
  assert.match(reply.text, /confirm one that works for me/i);
  assert.doesNotMatch(reply.text, /the this/i);
});

test('job replies use relevant requirements, measurable profile evidence and balanced length', () => {
  const email = { sender: 'Taylor Reed', subject: 'Senior Data Analyst role', text: 'We need SQL, Power BI, Advanced Excel and dashboard reporting. Responsibilities include building dashboards and improving reporting turnaround.' };
  const [reply] = generateReplies(email, 'professional', DEFAULT_PROFILE);
  const words = reply.text.trim().split(/\s+/).length;
  assert.ok(words >= 100 && words <= 160, `Expected 100-160 words, got ${words}`);
  assert.match(reply.text, /Senior Data Analyst/i);
  assert.match(reply.text, /SQL, Power BI, Advanced Excel/i);
  assert.match(reply.text, /80,000\+ Google Ads per month/);
  assert.match(reply.text, /98% accuracy/);
  assert.match(reply.text, /Puppala Manikanta\n/);
});

test('job replies do not invent VAT or accounting experience and explain transferable strengths', () => {
  const [reply] = generateReplies({ sender: 'Taylor', subject: 'Accounts Receivable Associate', text: 'The role requires VAT returns, reconciliation and accounting experience. Please describe your background.' }, 'professional', DEFAULT_PROFILE);
  assert.match(reply.text, /does not include direct VAT or accounting experience/i);
  assert.match(reply.text, /quality review, compliance, and accurate reporting/i);
  assert.doesNotMatch(reply.text, /experienced in VAT|accounting experience at Wipro/i);
});

test('different job requirements produce role-specific skill and project evidence', () => {
  const analyst = generateReplies({ subject: 'BI Analyst', text: 'The BI Analyst needs Power BI and dashboard reporting.' }, 'professional', DEFAULT_PROFILE)[0].text;
  const developer = generateReplies({ subject: 'Python Developer', text: 'The Python Developer needs Python, Flask and SQL.' }, 'professional', DEFAULT_PROFILE)[0].text;
  assert.notEqual(analyst, developer);
  assert.match(analyst, /Power BI/);
  assert.match(developer, /Python/);
  assert.match(developer, /Flask/);
});

test('job application follow-up retains the relevant experience and a next step', () => {
  const [reply] = generateReplies({ subject: 'Application status - Data Analyst', text: 'I am following up to ask if there is any update on my application for the Data Analyst role.' }, 'professional', DEFAULT_PROFILE);
  assert.match(reply.text, /approximately 18 months/);
  assert.match(reply.text, /80,000\+ Google Ads per month/);
  assert.match(reply.text, /next step/i);
});

test('Amazon compliance opportunity uses relevant policy-review evidence and names the role', () => {
  const [reply] = generateReplies({ sender: 'Morgan Lee', subject: 'Amazon Compliance Analyst opportunity', text: 'The analyst reviews advertising policy compliance, audits quality, and maintains accuracy against service levels. Advanced Excel is required.' }, 'professional', DEFAULT_PROFILE);
  assert.match(reply.text, /Amazon Compliance Analyst/i);
  assert.match(reply.text, /policy compliance/i);
  assert.match(reply.text, /80,000\+ Google Ads per month/);
  assert.match(reply.text, /98% accuracy/);
  assert.match(reply.text, /Advanced Excel/);
});

test('application acknowledgment and rejection receive suitable non-generic responses', () => {
  const ack = generateReplies({ subject: 'Application received - Data Analyst', text: 'We received your application for the Data Analyst role and will review it.' }, 'professional', DEFAULT_PROFILE)[0].text;
  const rejection = generateReplies({ subject: 'Application decision - Data Analyst', text: 'We regret to inform you that you were not selected for the Data Analyst role.' }, 'professional', DEFAULT_PROFILE)[0].text;
  assert.match(ack, /confirming receipt of my application/i);
  assert.match(rejection, /appreciate the time and consideration/i);
  assert.doesNotMatch(rejection, /I remain interested in the role/i);
});

test('AI profile context is opt-in and excludes personal contact identifiers', () => {
  const email = { sender: 'Recruiter', subject: 'Data Analyst role', text: 'Please tell me about your SQL experience.' };
  const privatePayload = buildAIReplyPayload(email, 'professional', DEFAULT_PROFILE);
  assert.equal(Object.hasOwn(privatePayload, 'profile'), false);
  const sharedPayload = buildAIReplyPayload(email, 'professional', DEFAULT_PROFILE, { includeProfile: true });
  assert.match(sharedPayload.profile.experience.approximateMonths.toString(), /18/);
  assert.ok(sharedPayload.profile.skills.includes('SQL'));
  assert.equal(Object.hasOwn(sharedPayload.profile, 'name'), false);
  assert.equal(Object.hasOwn(sharedPayload.profile, 'email'), false);
  assert.equal(Object.hasOwn(sharedPayload.profile, 'phone'), false);
  assert.equal(Object.hasOwn(sharedPayload.profile, 'linkedIn'), false);
  assert.match(sharedPayload.generationInstructions.join(' '), /untrusted source material/i);
});

test('AI draft fact checks reject placeholders, unsupported metrics, salary claims and inflated experience', () => {
  const email = { subject: 'Data Analyst opportunity', text: 'Please share your experience with SQL.' };
  assert.equal(validateAIDraft('I have two years of experience.', email, DEFAULT_PROFILE), false);
  assert.equal(validateAIDraft('I expect a salary of ₹12 LPA.', email, DEFAULT_PROFILE), false);
  assert.equal(validateAIDraft('I expect ₹12 LPA.', { subject: 'Compensation question', text: 'What are your salary expectations?' }, DEFAULT_PROFILE), false);
  assert.equal(validateAIDraft('I maintained 95% accuracy.', email, DEFAULT_PROFILE), false);
  assert.equal(validateAIDraft('I have extensive VAT experience.', email, DEFAULT_PROFILE), false);
  assert.equal(validateAIDraft('My profile does not include direct VAT experience; my quality-review background is transferable.', email, DEFAULT_PROFILE), true);
  assert.equal(validateAIDraft('I reviewed 80,000+ ads at approximately 98% accuracy during approximately 18 months at Wipro.', email, DEFAULT_PROFILE), true);
});
