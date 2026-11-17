const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('visible inbox reader extracts viewport row metadata without querying message bodies', () => {
  const queried = [];
  const textNode = (text, attrs = {}) => ({ innerText:text, textContent:text, getAttribute:key=>attrs[key] || null, getClientRects:()=>[{}] });
  const link = { getAttribute:key=>key==='href'?'#inbox/thread-123':null };
  const sender = textNode('Morgan Lee', { email:'morgan@example.com', name:'Morgan Lee' });
  const subject = textNode('Interview next week');
  const snippet = textNode('Could you confirm a time for Tuesday?');
  const date = textNode('10:42 AM', { title:'2026-11-17T10:42:00' });
  const row = {
    getBoundingClientRect:()=>({top:20,bottom:90,left:10,right:900,width:890,height:70}),
    getClientRects:()=>[{}], classList:{contains:()=>false}, getAttribute:()=>null,
    querySelector(selector){queried.push(selector);if(selector.includes('a[href'))return link;if(selector.includes('[email]'))return sender;if(selector.includes('.bog'))return subject;if(selector.includes('.y2'))return snippet;if(selector.includes('.xW'))return date;return null;},
    querySelectorAll(selector){return selector==='a[href]'?[link]:[];}
  };
  const main={innerText:'',querySelectorAll(selector){queried.push(selector);return selector.startsWith('tr.zA')?[row]:[];},querySelector(){return null;}};
  const window={};
  const context={window,document:{querySelector:()=>main},location:{href:'https://mail.google.com/mail/u/0/#inbox',hash:'#inbox'},innerHeight:800,innerWidth:1200,URL,Date,console};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../content.js'),'utf8'),context);
  const result=window.inboxToActionReader.readVisibleInboxRows();
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].sender,'Morgan Lee');
  assert.equal(result.rows[0].senderEmail,'morgan@example.com');
  assert.equal(result.rows[0].subject,'Interview next week');
  assert.equal(result.rows[0].snippet,'Could you confirm a time for Tuesday?');
  assert.equal(result.rows[0].threadId,'thread-123');
  assert.equal(result.rows[0].conversationUrl,'https://mail.google.com/mail/u/0/#inbox/thread-123');
  assert.equal(queried.some(selector=>selector.includes('.a3s')||selector.includes('message-body')),false);
});

test('visible inbox reader ignores rows outside the viewport', () => {
  const link={getAttribute:key=>key==='href'?'#inbox/thread-456':null};
  const row={getBoundingClientRect:()=>({top:900,bottom:980,left:0,right:800,width:800,height:80}),getClientRects:()=>[{}],querySelector:()=>link,querySelectorAll:selector=>selector==='a[href]'?[link]:[],classList:{contains:()=>false},getAttribute:()=>null};
  const main={innerText:'',querySelectorAll:()=>[row]};
  const window={};const context={window,document:{querySelector:()=>main},location:{href:'https://mail.google.com/mail/u/0/#inbox',hash:'#inbox'},innerHeight:800,innerWidth:1200,URL,Date,console};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../content.js'),'utf8'),context);
  assert.equal(window.inboxToActionReader.readVisibleInboxRows().rows.length,0);
});

test('Gmail view detector follows SPA-style list and conversation routes', () => {
  const window={};
  const main={querySelectorAll:()=>[]};
  const context={window,document:{querySelector:()=>main},location:{href:'https://mail.google.com/mail/u/0/#inbox',hash:'#inbox'},innerHeight:800,innerWidth:1200,URL,Date,console};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../content.js'),'utf8'),context);
  const detect=window.inboxToActionReader.detectGmailView;
  for (const hash of ['#inbox','#all','#category/primary','#label/clients','#search/refund','#inbox/category/primary','#inbox/category/promotions','#inbox/category/social']) {
    context.location.hash=hash;
    assert.equal(detect().mode,'inbox',`${hash} should be Inbox Mode`);
  }
  for (const hash of ['#inbox/thread-1','#all/thread-2','#category/primary/thread-3','#label/clients/thread-4','#search/refund/thread-5','#inbox/category/primary/thread-6','#inbox/category/promotions/thread-7','#inbox/category/social/thread-8']) {
    context.location.hash=hash;
    assert.equal(detect().mode,'email',`${hash} should be Email Mode`);
  }
});

test('visible inbox reader accepts visible thread-id rows even when Gmail supplies no conversation link', () => {
  const textNode=(text,attrs={})=>({innerText:text,textContent:text,getAttribute:key=>attrs[key]||null,getClientRects:()=>[{}]});
  const sender=textNode('Riley Chen',{email:'riley@example.com',name:'Riley Chen'}),subject=textNode('Refund confirmation'),snippet=textNode('The refund will be issued Friday.');
  const row={getBoundingClientRect:()=>({top:20,bottom:90,left:10,right:800,width:790,height:70}),getClientRects:()=>[{}],classList:{contains:key=>key==='zE'},getAttribute:key=>key==='data-thread-id'?'thread-no-link':null,
    querySelectorAll:selector=>selector==='a[href]'?[]:[],querySelector(selector){if(selector.includes('[email]'))return sender;if(selector.includes('.bog'))return subject;if(selector.includes('.y2'))return snippet;return null;}};
  const main={innerText:'',querySelectorAll:()=>[row]};
  const window={};const context={window,document:{querySelector:()=>main},location:{href:'https://mail.google.com/mail/u/0/#inbox',hash:'#inbox'},innerHeight:800,innerWidth:1200,URL,Date,console};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../content.js'),'utf8'),context);
  const result=window.inboxToActionReader.readVisibleInboxRows();
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].unread,true);
  assert.equal(result.rows[0].threadId,'thread-no-link');
  assert.equal(result.rows[0].conversationUrl,'https://mail.google.com/mail/u/0/#inbox/thread-no-link');
});

test('open email reader falls back to Gmail plain-text message body and returns conversation context', async () => {
  const node=(text,attrs={})=>({innerText:text,textContent:text,getAttribute:key=>attrs[key]||null,getClientRects:()=>[{}],closest:()=>null});
  const subject=node('Interview details'),body=node('Please confirm your availability by Friday.\n\nOn Monday, Taylor wrote:\n> Previous quoted message.');
  const sender=node('Taylor',{name:'Taylor Morgan',email:'taylor@example.com'}),recipient=node('Me',{email:'me@example.com'});
  const main={querySelector(selector){if(selector==='h2.hP'||selector.includes('role="heading"'))return subject;if(selector.includes('.gD'))return sender;return null;},querySelectorAll(selector){if(selector==='.a3s')return[];if(selector==='.ii.gt')return[body];if(selector==='[email]')return[sender,recipient];return[];},getAttribute:()=>null};
  const window={};const context={window,document:{querySelector:()=>main},location:{href:'https://mail.google.com/mail/u/0/#inbox/thread-plain',hash:'#inbox/thread-plain'},innerHeight:800,innerWidth:1200,URL,Date,console};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../content.js'),'utf8'),context);
  const result=await window.inboxToActionReader.readCurrentEmail();
  assert.equal(result.error,undefined);assert.equal(result.subject,'Interview details');
  assert.match(result.text,/confirm your availability by Friday/);assert.doesNotMatch(result.text,/Previous quoted message/);
  assert.equal(result.senderEmail,'taylor@example.com');assert.deepEqual(Array.from(result.recipients),['me@example.com']);
  assert.match(result.conversationContext,/Taylor Morgan: Please confirm/);assert.doesNotMatch(result.conversationContext,/Previous quoted message/);
});

test('open email reader refuses to summarize an older expanded message when the latest message is collapsed', async () => {
  const textNode=(text,attrs={})=>({innerText:text,textContent:text,getAttribute:key=>attrs[key]||null,getClientRects:()=>[{}],closest:()=>null});
  const subject=textNode('Conversation subject'),olderBody=textNode('Old message body that must not be analyzed.'),olderContainer={contains:node=>node===olderBody,querySelector:()=>null,querySelectorAll:()=>[],getClientRects:()=>[{}]},latestContainer={contains:()=>false,getClientRects:()=>[{}]};
  olderBody.closest=()=>olderContainer;
  const main={querySelector(selector){return selector==='h2.hP'?subject:null;},querySelectorAll(selector){if(selector==='.a3s')return[olderBody];if(selector==='.adn')return[olderContainer,latestContainer];return[];}};
  let tick=0;const window={};const context={window,document:{querySelector:()=>main},location:{href:'https://mail.google.com/mail/u/0/#inbox/thread-collapse',hash:'#inbox/thread-collapse'},innerHeight:800,innerWidth:1200,URL,Date:{now:()=>tick+=3000},console};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../content.js'),'utf8'),context);
  const result=await window.inboxToActionReader.readCurrentEmail();
  assert.match(result.error,/latest message may be collapsed/);assert.equal(result.text,undefined);
});

test('visible semantic Gmail rows are extracted without a link or thread ID and include diagnostics', () => {
  const textNode=text=>({innerText:text,textContent:text,getAttribute:()=>null,getClientRects:()=>[{}]});
  const sender=textNode('Jordan Lee'),subject=textNode('Quarterly report'),snippet=textNode('Please share the report by Friday.');
  const row={getBoundingClientRect:()=>({top:30,bottom:95,left:10,right:700,width:690,height:65}),getClientRects:()=>[{}],getAttribute:()=>null,classList:{contains:()=>false},
    querySelector(selector){if(selector.includes('.yW'))return sender;if(selector.includes('.bog')||selector.includes('.y6'))return subject;if(selector.includes('.y2'))return snippet;return null;},querySelectorAll:()=>[]};
  const main={innerText:'',contains:()=>true,querySelectorAll(selector){return selector.startsWith('tr.zA')?[row]:[];}};
  const window={};const context={window,document:{querySelector:()=>main,documentElement:{clientHeight:800,clientWidth:1200}},location:{href:'https://mail.google.com/mail/u/0/#inbox',hash:'#inbox'},innerHeight:800,innerWidth:1200,URL,Date,console};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../content.js'),'utf8'),context);
  const result=window.inboxToActionReader.readVisibleInboxRows();
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].subject,'Quarterly report');
  assert.equal(result.rows[0].threadId,'');assert.equal(result.rows[0].conversationUrl,'');assert.equal(result.rows[0].identifierMissing,true);
  assert.equal(result.diagnostics.missingLinks,1);assert.equal(result.diagnostics.missingThreadIds,1);
  assert.equal(result.diagnostics.rejectedMissingLinks,0);assert.equal(result.diagnostics.rejectedMissingThreadIds,0);
  assert.equal(result.diagnostics.extracted,1);assert.ok(result.diagnostics.selectorStrategy.includes('gmail-row-markers'));
});
