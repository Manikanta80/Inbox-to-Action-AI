// One-shot Gmail reader. It is injected only after an explicit user click.
(() => {
  if (window.inboxToActionReader?.version === 7) return;
  const clean = value => (value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const visible = element => !!element && element.getClientRects().length > 0;
  const messageText = node => String(node?.innerText || node?.textContent || '').replace(/\r/g, '')
    .split(/(?:^|\n)(?:On .{3,180} wrote:|[- ]{2,}Original Message[- ]{2,}|From:\s[^\n]+\nSent:\s[^\n]+)/i)[0]
    .split('\n').filter(line => !/^\s*>/.test(line)).join(' ').replace(/\s+/g, ' ').trim();
  const listRouteDepth = parts => parts[0]?.toLowerCase() === 'inbox' && parts[1]?.toLowerCase() === 'category' ? 3
    : ['category', 'label', 'search'].includes(parts[0]?.toLowerCase()) ? 2 : 1;
  function detectGmailView() {
    const hash = (location.hash || '').replace(/^#/, '').split('?')[0];
    const parts = hash.split('/').filter(Boolean);
    const listRoutes = new Set(['inbox', 'all', 'category', 'important', 'starred', 'snoozed', 'sent', 'drafts', 'label', 'search', 'trash', 'spam']);
    if (parts.length && listRoutes.has(parts[0].toLowerCase())) {
      // Gmail list routes have one segment (or two for category/label/search);
      // an additional segment identifies the open conversation.
      const listDepth = listRouteDepth(parts);
      if (parts.length > listDepth) return { mode: 'email', reason: 'conversation-route', route: `#${parts.slice(0, listDepth).join('/')}` };
      return { mode: 'inbox', reason: 'list-route', route: `#${parts.join('/')}` };
    }
    const main = document.querySelector('[role="main"]') || document.querySelector('main') || document.querySelector('[role="application"]');
    if (main) {
      const openMessage = [...main.querySelectorAll('.a3s, h2.hP, [role="heading"][aria-level="2"]')].some(visible);
      if (openMessage) return { mode: 'email', reason: 'message-dom', route: location.hash || '' };
      const candidates = main.querySelectorAll('tr.zA, tr[role="row"], [role="row"], [data-legacy-thread-id], [data-thread-id]');
      if ([...candidates].some(row => visible(row))) return { mode: 'inbox', reason: 'row-dom', route: location.hash || '' };
    }
    return { mode: 'unknown', reason: 'gmail-view-not-detected', route: location.hash || '' };
  }
  async function readCurrentEmail() {
    if (detectGmailView().mode !== 'email') return { error: 'Open a Gmail conversation first. Analyze This Email is available only while a conversation is open.' };
    const main = document.querySelector('[role="main"]') || document.querySelector('main');
    if (!main) return { error: 'Gmail message area was not found. Open an email and try again.' };
    const getSubjectNode = () => main.querySelector('h2.hP') || main.querySelector('[role="heading"][aria-level="2"]') || main.querySelector('h2');
    let subjectNode = getSubjectNode(), subject = clean(subjectNode?.innerText || subjectNode?.textContent);
    const getBodies = () => {
      let found = [...main.querySelectorAll('.a3s')].filter(node => visible(node) && clean(node.innerText || node.textContent));
      if (!found.length) found = [...main.querySelectorAll('.ii.gt')].filter(node => visible(node) && clean(node.innerText || node.textContent));
      return found;
    };
    const getLatestMessage = () => {
      const bodies = getBodies();
      const containers = [...main.querySelectorAll('.adn')].filter(visible);
      const latestContainer = containers.at(-1) || null;
      const latestBody = latestContainer ? bodies.filter(body => latestContainer.contains?.(body)).at(-1) : bodies.at(-1);
      return { bodies, latestContainer, latestBody };
    };
    // Gmail renders the route before its message body. Wait briefly after the
    // explicit Analyze click; never click/expand a message or use a snippet.
    let selected = getLatestMessage();
    const bodyWaitUntil = Date.now() + 2400;
    while ((!selected.latestBody || !subject) && Date.now() < bodyWaitUntil) {
      await new Promise(resolve => setTimeout(resolve, 120));
      selected = getLatestMessage();
      subjectNode = getSubjectNode(); subject = clean(subjectNode?.innerText || subjectNode?.textContent);
    }
    const { bodies, latestBody } = selected;
    if (!latestBody) return { error: 'Gmail detected the conversation, but no visible full message body is available. The latest message may be collapsed; expand it in Gmail and retry. Subject/snippet text is not used as a substitute.' };
    if (!subject) return { error: 'The visible message body was found, but Gmail’s subject heading is not available yet. Wait for the conversation to finish loading and retry.' };
    const latestText = messageText(latestBody);
    if (!latestText) return { error: 'The visible message contains only quoted or collapsed text. Expand the latest message body and retry.' };
    const latestContainer = latestBody.closest('.adn') || latestBody.closest('.gs') || selected.latestContainer || main;
    const senderNode = latestContainer.querySelector('.gD[email], [email].gD, [email][name]');
    const sender = clean(senderNode?.getAttribute('name') || senderNode?.textContent);
    const senderEmail = clean(senderNode?.getAttribute('email') || '');
    const recipients = [...latestContainer.querySelectorAll('[email]')]
      .map(node => clean(node.getAttribute('email')))
      .filter(address => address && address !== senderEmail);
    const messageId = clean(latestContainer.getAttribute('data-legacy-message-id') || latestContainer.getAttribute('data-message-id') || latestBody.getAttribute('data-message-id'));
    const threadNode = main.querySelector('[data-legacy-thread-id], [data-thread-id]');
    const hashCandidate = location.hash.split('/').filter(Boolean).at(-1)?.split('?')[0] || '';
    const threadId = clean(threadNode?.getAttribute('data-legacy-thread-id') || threadNode?.getAttribute('data-thread-id') || latestContainer.getAttribute('data-legacy-thread-id') || hashCandidate);
    const threadContext = bodies.slice(-8).map((node, index) => {
      const container = node.closest('.adn') || node.closest('.gs') || main;
      const author = container.querySelector('.gD[email], [email].gD, [email][name]');
      const name = clean(author?.getAttribute('name') || author?.textContent) || `Message ${index + 1}`;
      return `${name}: ${messageText(node).slice(0, 5000)}`;
    }).join('\n\n');
    const url = location.href.startsWith('https://mail.google.com/') ? location.href : '';
    return {
      sender, senderEmail, recipients: [...new Set(recipients)].slice(0, 20), subject,
      text: latestText.slice(0, 12000),
      conversationContext: threadContext.slice(0, 24000), threadId, messageId, conversationUrl: url
    };
  }

  // Reads metadata from rendered inbox rows only. This path never queries or
  // reads message-body nodes and is invoked only by the explicit inbox action.
  function readVisibleInboxRows() {
    const route = location.hash || '';
    const main = document.querySelector('[role="main"]') || document.querySelector('main') || document.querySelector('[role="application"]');
    const diagnostics = { readerVersion: 7, extensionVersion: (() => { try { return chrome.runtime.getManifest().version; } catch { return 'unknown'; } })(), route, mainContainerFound: !!main, rowCandidates: 0, visibleCandidates: 0, rejectedMissingLinks: 0, rejectedMissingThreadIds: 0, missingLinks: 0, missingThreadIds: 0, rejectedMissingVisibleContent: 0, deduplicated: 0, extracted: 0, selectorStrategy: [] };
    const fail = message => ({ error: message, diagnostics });
    if (detectGmailView().mode !== 'inbox') return fail('Open a Gmail inbox or category list first. Inbox analysis does not read an opened message.');
    if (!main) return fail('Gmail’s main message container was not found. Reload Gmail and retry.');

    const routeParts = route.replace(/^#/, '').split('/').filter(Boolean);
    const listDepth = listRouteDepth(routeParts);
    const listRoute = `#${routeParts.slice(0, listDepth).join('/')}`;
    const selectorStrategies = [
      ['gmail-row-markers', 'tr.zA, .zA, [role="row"], [role="listitem"], [data-legacy-thread-id], [data-thread-id]'],
      ['gmail-visible-content', '.yW, .y6, .bog, .y2, [data-message-snippet], [data-hovercard-id]'],
      ['gmail-conversation-links', 'a[href]']
    ];
    const candidates = new Map();
    const addCandidate = (element, strategy) => {
      if (!element || element === main || (main.contains && !main.contains(element))) return;
      if (element.closest?.('nav, [role="navigation"], [role="toolbar"], [role="tablist"], button')) return;
      if (!candidates.has(element)) candidates.set(element, new Set());
      candidates.get(element).add(strategy);
    };
    for (const [strategy, selector] of selectorStrategies.slice(0, 2)) {
      for (const element of main.querySelectorAll(selector)) {
        if (strategy === 'gmail-row-markers') addCandidate(element, strategy);
        else {
          let parent = element;
          for (let depth = 0; depth < 7 && parent && parent !== main; depth++, parent = parent.parentElement) {
            const hasSubject = !!parent.querySelector('.bog, .bqe, .y6, [data-subject]');
            const hasSender = !!parent.querySelector('.yW, [email], [data-hovercard-id]');
            const hasSnippet = !!parent.querySelector('.y2, [data-message-snippet]');
            if (hasSubject && (hasSender || hasSnippet)) { addCandidate(parent, strategy); break; }
          }
        }
      }
    }
    const conversationIdFromUrl = value => {
      try {
        const url = new URL(value || '', location.href);
        if (url.origin !== 'https://mail.google.com') return '';
        const queryThreadId = clean(url.searchParams.get('th') || url.searchParams.get('thread') || '');
        if (queryThreadId) return queryThreadId;
        const parts = url.hash.replace(/^#/, '').split('/').filter(Boolean);
        const depth = listRouteDepth(parts);
        if (parts.length <= depth || !/^(inbox|all|category|important|starred|snoozed|sent|drafts|label|search|trash|spam)$/i.test(parts[0] || '')) return '';
        return decodeURIComponent(parts.at(-1));
      } catch { return ''; }
    };
    for (const link of main.querySelectorAll('a[href]')) {
      const linkThreadId = conversationIdFromUrl(link.getAttribute('href') || link.href);
      if (!linkThreadId) continue;
      let row = link.closest('tr.zA, .zA, [role="row"], [role="listitem"], [data-thread-id], [data-legacy-thread-id]');
      if (!row) {
        let parent = link.parentElement, best = null;
        for (let depth = 0; depth < 6 && parent && parent !== main; depth++, parent = parent.parentElement) {
          const text = clean(parent.innerText || parent.textContent);
          if (text.length >= 4 && text.length <= 1800) best = parent;
          if (parent.querySelector('.yW, [email], [data-hovercard-id]') && parent.querySelector('.y6, .bog, .bqe')) break;
        }
        row = best || link;
      }
      addCandidate(row, 'gmail-conversation-links');
    }
    const allCandidates = [...candidates.keys()];
    diagnostics.rowCandidates = allCandidates.length;
    const viewportHeight = Number(globalThis.innerHeight) || Number(document.documentElement?.clientHeight) || 0;
    const viewportWidth = Number(globalThis.innerWidth) || Number(document.documentElement?.clientWidth) || 0;
    const visibleCandidates = allCandidates.filter(element => {
      const rect = element.getBoundingClientRect();
      return visible(element) && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth;
    });
    diagnostics.visibleCandidates = visibleCandidates.length;
    const isNoise = element => !!element.closest?.('[role="tab"], [role="toolbar"], [role="navigation"], nav, button');
    const rows = [], seenIds = new Set(), seenFallbacks = new Set();
    for (const row of visibleCandidates) {
      if (isNoise(row)) { diagnostics.rejectedMissingVisibleContent++; continue; }
      const rowLinks = [...row.querySelectorAll('a[href]')];
      if (row.matches?.('a[href]')) rowLinks.unshift(row);
      const link = rowLinks.find(anchor => conversationIdFromUrl(anchor.getAttribute('href') || anchor.href)) || null;
      const ownThreadId = row.getAttribute('data-legacy-thread-id') || row.getAttribute('data-thread-id');
      const rowThreadNode = row.querySelector('[data-legacy-thread-id], [data-thread-id]');
      const rowThreadId = clean(ownThreadId || rowThreadNode?.getAttribute('data-legacy-thread-id') || rowThreadNode?.getAttribute('data-thread-id') || '');
      const linkedThreadId = link ? conversationIdFromUrl(link.getAttribute('href') || link.href) : '';
      const threadId = rowThreadId || linkedThreadId;
      if (!link) diagnostics.missingLinks++;
      if (!threadId) diagnostics.missingThreadIds++;
      const senderNode = row.querySelector('[email], .yW span, .yW b, [data-hovercard-id]');
      const senderEmail = clean(senderNode?.getAttribute('email') || senderNode?.getAttribute('data-hovercard-id') || '').slice(0, 254);
      const sender = clean(senderNode?.getAttribute('name') || senderNode?.getAttribute('title') || senderNode?.textContent || '').slice(0, 160);
      const subjectNode = row.querySelector('.bog, .bqe, .y6 span, .y6, [role="gridcell"] .bog, [role="gridcell"] .y6, [data-subject]');
      const snippetNode = row.querySelector('.y2, [data-tooltip*="snippet"], [data-message-snippet]');
      const subject = clean(subjectNode?.getAttribute('data-tooltip') || subjectNode?.getAttribute('data-subject') || subjectNode?.innerText || subjectNode?.textContent || link?.getAttribute('aria-label') || '').slice(0, 300);
      const snippet = clean(snippetNode?.innerText || snippetNode?.textContent || '').slice(0, 500);
      const cellTexts = [...row.querySelectorAll('[role="gridcell"], td')].map(cell => clean(cell.innerText || cell.textContent)).filter(Boolean);
      const fallbackSubject = subject || cellTexts.find(text => text !== sender && text !== senderEmail && text.length > 2 && text.length < 300 && !/^(today|yesterday|\d{1,2}:\d{2})$/i.test(text)) || '';
      const fallbackSnippet = snippet || cellTexts.find(text => text !== sender && text !== senderEmail && text !== fallbackSubject && text.length > 3) || '';
      if (!fallbackSubject && !fallbackSnippet) {
        if (!link) diagnostics.rejectedMissingLinks++;
        if (!threadId) diagnostics.rejectedMissingThreadIds++;
        diagnostics.rejectedMissingVisibleContent++;
        continue;
      }
      let identity = threadId ? `thread:${threadId}` : `row:${[senderEmail || sender, fallbackSubject, fallbackSnippet, cellTexts.at(-1) || ''].join('|').toLowerCase()}`;
      if ((threadId && seenIds.has(identity)) || (!threadId && seenFallbacks.has(identity))) { diagnostics.deduplicated++; continue; }
      if (threadId) seenIds.add(identity); else seenFallbacks.add(identity);
      let conversationUrl = '';
      if (link) { try { const parsed = new URL(link.getAttribute('href') || link.href, location.href); if (parsed.origin === 'https://mail.google.com') conversationUrl = parsed.href; } catch {} }
      else if (threadId) { try { const parsed = new URL(location.href); parsed.hash = `${listRoute}/${encodeURIComponent(threadId)}`; conversationUrl = parsed.href; } catch {} }
      const dateNode = row.querySelector('.xW[title], .xW span[title], time[datetime], [role="gridcell"] [title], [title][aria-label*="AM"], [title][aria-label*="PM"]');
      const labels = [...row.querySelectorAll('.at, [aria-label*="label"], [data-label-name]')].map(node => clean(node.getAttribute('data-label-name') || node.innerText || node.textContent).slice(0, 60)).filter(Boolean).slice(0, 8);
      const rowLabel = clean(row.getAttribute('aria-label') || '').toLowerCase();
      rows.push({ sender, senderEmail, subject: fallbackSubject.replace(/\s+-\s+$/, ''), snippet: fallbackSnippet, date: clean(dateNode?.getAttribute('datetime') || dateNode?.getAttribute('title') || dateNode?.getAttribute('aria-label') || dateNode?.textContent || '').slice(0, 120), labels, attachment: !!row.querySelector('.aQw, [aria-label*="Attachment"], [data-tooltip*="Attachment"], [data-tooltip*="attachment"]'), unread: row.classList?.contains('zE') || /\bunread\b/i.test(rowLabel) || !!row.querySelector('.zF, [data-is-unread="true"], [aria-label*="unread" i]'), threadId, conversationUrl, identifierMissing: !threadId });
      for (const strategy of candidates.get(row) || []) if (!diagnostics.selectorStrategy.includes(strategy)) diagnostics.selectorStrategy.push(strategy);
    }
    diagnostics.extracted = rows.length;
    const pageText = clean(main.innerText || main.textContent);
    if (!rows.length && /no conversations|your inbox is empty|no messages|nothing in your inbox/i.test(pageText)) {
      console.info('[Inbox-to-Action] Empty Gmail list diagnostics', JSON.stringify(diagnostics));
      return { rows: [], route, diagnostics, capturedAt: new Date().toISOString() };
    }
    if (!rows.length && diagnostics.rowCandidates > 0 && diagnostics.visibleCandidates === 0) {
      console.info('[Inbox-to-Action] Gmail row candidates are outside the viewport', JSON.stringify(diagnostics));
      return { rows: [], route, diagnostics, capturedAt: new Date().toISOString() };
    }
    if (!rows.length) {
      console.warn('[Inbox-to-Action] No email rows extracted', JSON.stringify(diagnostics));
      return { error: 'No visible email rows could be extracted. Open Gmail DevTools and inspect the returned diagnostics; no message body was read.', diagnostics };
    }
    console.info('[Inbox-to-Action] Visible row extraction', JSON.stringify(diagnostics));
    return { rows: rows.slice(0, 100), route, diagnostics, capturedAt: new Date().toISOString() };
  }

  async function createReplyDraft(draft) {
    const email = await readCurrentEmail();
    if (email.error) return { ok: false, error: email.error };
    if (draft?.threadId && (!email.threadId || draft.threadId !== email.threadId)) {
      return { ok: false, error: 'The open Gmail conversation changed. Reopen the task’s conversation and try again.' };
    }
    if (draft?.conversationUrl) {
      let expected; try { expected = new URL(draft.conversationUrl); } catch { return { ok: false, error: 'The original Gmail conversation URL is invalid.' }; }
      if (expected.origin !== 'https://mail.google.com' || !expected.hash || !location.hash || expected.hash !== location.hash) return { ok: false, error: 'The currently open Gmail conversation does not match this task. Open its original conversation and try again.' };
    } else if (!draft?.threadId) return { ok: false, error: 'This item has no saved Gmail conversation. Analyze the original email before creating a threaded reply.' };
    const main = document.querySelector('[role="main"]');
    const containers = [...main.querySelectorAll('.adn, .gs')].filter(visible);
    const message = containers.at(-1) || main;
    const replyButtons = [...message.querySelectorAll('button, [role="button"]')].filter(button => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-tooltip') || ''}`;
      return /\breply\b/i.test(label) && visible(button);
    });
    const replyButton = replyButtons.at(-1) || [...main.querySelectorAll('button, [role="button"]')].filter(button => /\breply\b/i.test(`${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-tooltip') || ''}`) && visible(button)).at(-1);
    if (!replyButton) return { ok: false, error: 'Gmail’s Reply control was not found. Open the conversation and use Gmail’s Reply button manually.' };
    replyButton.click();
    const deadline = Date.now() + 5000;
    let editor = null;
    while (Date.now() < deadline) {
      editor = [...document.querySelectorAll('[contenteditable="true"][role="textbox"], [contenteditable="true"][aria-label*="Message Body"], .Am.Al.editable')].filter(visible).at(-1);
      if (editor) break;
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    if (!editor) return { ok: false, error: 'Gmail opened Reply, but its message editor did not appear. You can finish the draft in Gmail.' };
    editor.focus();
    editor.textContent = String(draft?.body || '');
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(draft?.body || '') }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, recipient: email.senderEmail, threadId: email.threadId };
  }
  const api = { version: 7, detectGmailView, readCurrentEmail, readVisibleInboxRows, createReplyDraft };
  if (window.inboxToActionReader && typeof window.inboxToActionReader === 'object') Object.assign(window.inboxToActionReader, api);
  else Object.defineProperty(window, 'inboxToActionReader', { value: api, configurable: true });
})();

