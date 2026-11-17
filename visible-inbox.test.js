const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fixtures = require('./fixtures/visible-emails');

function classify(email, preferences = {}) {
  let listener;
  const context = { chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  let response;
  listener({ type: 'CLASSIFY_VISIBLE_EMAIL', email, preferences }, {}, value => { response = value; });
  assert.equal(response?.ok, true);
  return response.classification;
}

test('visible inbox fixtures classify locally and include reasons and confidence', () => {
  assert.ok(fixtures.length >= 30, `expected at least 30 fixtures, got ${fixtures.length}`);
  for (const fixture of fixtures) {
    const actual = classify({ senderEmail: fixture.sender || 'sender@example.com', subject: fixture.subject, snippet: fixture.snippet }, fixture.preferences);
    assert.equal(actual.category, fixture.category, `${fixture.name}: ${actual.why}`);
    assert.ok(actual.why.length > 10, `${fixture.name}: missing explanation`);
    assert.ok(actual.confidence >= 0.3 && actual.confidence <= 0.98, `${fixture.name}: invalid confidence`);
  }
});

test('classification is deterministic and does not read beyond supplied row metadata', () => {
  const row = { senderEmail:'alex@example.com', subject:'Please confirm', snippet:'Could you confirm the meeting time?' };
  assert.equal(JSON.stringify(classify(row)), JSON.stringify(classify(row)));
  assert.equal(classify({ subject:'', snippet:'' }).category, 'informational');
});

test('mute and VIP preferences apply locally; mute takes precedence', () => {
  const email = { senderEmail:'alex@example.com', subject:'Hello', snippet:'Sharing a photo.' };
  assert.equal(classify(email, { vipSenders:['alex@example.com'] }).category, 'important');
  assert.equal(classify(email, { vipSenders:['alex@example.com'], mutedSenders:['alex@example.com'] }).category, 'informational');
});

test('service worker classifies a visible-row batch and caps work to 100 rows', () => {
  let listener;
  const context = { chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  let response;
  listener({ type:'CLASSIFY_VISIBLE_INBOX', emails:Array.from({length:120}, (_,i)=>({subject:`Note ${i}`,snippet:'For your information.'})) }, {}, value => { response=value; });
  assert.equal(response?.ok, true);
  assert.equal(response.classifications.length, 100);
});

test('service worker returns one persisted-ready result for each of nine supplied visible rows', () => {
  let listener;
  const context={chrome:{runtime:{onMessage:{addListener(fn){listener=fn;}}}}};vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'),'utf8'),context);
  const emails=[
    {subject:'Senior Analyst role',snippet:'Job opportunity at Northwind Labs.'},
    {subject:'Interview invitation',snippet:'Interview scheduled Tuesday. Please confirm.'},
    {subject:'HR update',snippet:'A message from the recruiter in Human Resources.'},
    ...Array.from({length:6},(_,index)=>({subject:`Visible message ${index+4}`,snippet:'For your information.'}))
  ];
  let response;listener({type:'CLASSIFY_VISIBLE_INBOX',emails},{},value=>{response=value;});
  assert.equal(response?.ok,true);assert.equal(response.classifications.length,emails.length);
  assert.equal(response.classifications[0].category,'job-opportunities');
  assert.equal(response.classifications[1].category,'interview-invitations');
  assert.equal(response.classifications[2].category,'hr-recruiter');
  assert.ok(response.classifications.every(value=>typeof value.category==='string'&&typeof value.recommendation==='string'));
});

test('deep email analysis exposes career category and only explicitly labeled job details', () => {
  let listener;
  const context = { chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  let response;
  listener({ type:'ANALYZE_EMAIL', email:{ subject:'Interview invitation', sender:'Recruiter', text:'Company: Northwind Labs. Job title: Senior Analyst. Interview date: Tuesday, December 8. Please confirm by Friday.' } }, {}, value => { response=value; });
  assert.equal(response?.ok, true);
  assert.equal(response.classification.career, 'interview-invitations');
  assert.equal(response.classification.jobDetails.company, 'Northwind Labs');
  assert.equal(response.classification.jobDetails.jobTitle, 'Senior Analyst');
  assert.equal(response.classification.jobDetails.interviewDate, 'Tuesday, December 8');
  assert.equal(response.classification.jobDetails.salary, '');
});

test('email analysis uses the full supplied message body for summary signals and dates', () => {
  let listener;const context={chrome:{runtime:{onMessage:{addListener(fn){listener=fn;}}}}};vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'),'utf8'),context);
  let response;listener({type:'ANALYZE_EMAIL',email:{subject:'A brief subject',snippet:'unrelated preview',sender:'Taylor',recipients:['me@example.com'],text:'Interview invitation: we would like to meet. Please confirm the interview time by Friday, December 11. The meeting is scheduled for 10 AM.'}},{},value=>{response=value;});
  assert.equal(response?.ok,true);assert.ok(response.actions.length>=2);
  assert.equal(response.classification.career,'interview-invitations');
  assert.equal(response.classification.jobDetails.interviewDate,'');
  assert.equal(response.classification.requiresReply,true);
});

test('popup analysis renderer exists and the obsolete undefined showSuggestions call is gone', () => {
  const popup=fs.readFileSync(require.resolve('../popup.js'),'utf8');
  assert.match(popup,/function renderSuggestions\(\)/);
  assert.match(popup,/async function inboxAction\(event\)/);
  assert.match(popup,/addEventListener\('click',inboxAction\)/);
  assert.doesNotMatch(popup,/showSuggestions/);
  assert.match(popup,/renderSuggestions\(\);renderEmailAnalysis\(\)/);
  assert.match(popup,/classified\.classifications\.length!==rows\.length/);
});
