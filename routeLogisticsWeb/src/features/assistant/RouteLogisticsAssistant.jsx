import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChatBubbleLeftRightIcon, XMarkIcon, ArrowPathIcon, LifebuoyIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import {
  ROUTE_LOGISTICS_KNOWLEDGE_VERSION,
  authorizedActions,
  containsSensitiveQuestion,
  deterministicHelp,
  pageKnowledge,
  suggestedQuestions,
} from './knowledgeRegistry';
import {
  assistantErrorMessage,
  closeAssistantSession,
  escalateAssistantSession,
  loadAssistantHistory,
  sendAssistantMessage,
} from '../../services/assistantApi';

const MAX_LOCAL_MESSAGES = 40;
const STORAGE_PREFIX = 'rl-assistant:';

function storageKey(uid, workspaceReference) {
  return `${STORAGE_PREFIX}${uid}:${workspaceReference}`;
}
function readSavedConversation(key) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || '{}');
    return {
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-MAX_LOCAL_MESSAGES) : [],
      escalated: parsed.escalated === true,
    };
  } catch {
    return { sessionId: '', messages: [], escalated: false };
  }
}

function mergeMessages(current, incoming) {
  const byId = new Map();
  [...current, ...(incoming || [])].forEach(message => {
    if (!message?.text) return;
    const id = message.id || `${message.role}:${message.createdAt || ''}:${message.text}`;
    byId.set(id, { ...message, id });
  });
  return [...byId.values()].slice(-MAX_LOCAL_MESSAGES);
}

function localMessage(role, text, extra = {}) {
  return { id: crypto.randomUUID(), role, text, createdAt: new Date().toISOString(), ...extra };
}

function displayRole(role) {
  if (role === 'visitor') return 'You';
  if (role === 'agent') return 'Workside Support';
  if (role === 'system') return 'System';
  return 'Route Logistics Assistant';
}

function SupportForm({ mode, currentEmail, defaultName, pathname, busy, onCancel, onSubmit }) {
  const isProblem = mode === 'problem';
  const [form, setForm] = useState({
    contactName: defaultName || '', contactEmail: currentEmail || '', summary: '', details: '',
    taskAttempted: '', expectedResult: '', actualResult: '', errorMessage: '',
  });
  const update = event => setForm(value => ({ ...value, [event.target.name]: event.target.value }));
  const valid = form.contactName.trim().length >= 3 && form.summary.trim() && (isProblem ? form.actualResult.trim() : form.details.trim());
  return (
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (valid) onSubmit({ ...form, issueCategory: isProblem ? 'problem_report' : 'support', route: pathname }); }}>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        This sends your description and sanitized page context to Workside Support. Do not include customer details, passwords, payment information, private notes, or photos. A reply is not guaranteed to be immediate.
      </div>
      <label className="block text-sm font-medium text-gray-800">Your name
        <input name="contactName" value={form.contactName} onChange={update} maxLength={120} required className="mt-1 w-full rounded-md border-gray-300 text-sm" autoComplete="name" />
      </label>
      <label className="block text-sm font-medium text-gray-800">Signed-in email
        <input name="contactEmail" value={form.contactEmail} readOnly className="mt-1 w-full rounded-md border-gray-300 bg-gray-100 text-sm" />
      </label>
      <label className="block text-sm font-medium text-gray-800">Summary
        <input name="summary" value={form.summary} onChange={update} maxLength={160} required className="mt-1 w-full rounded-md border-gray-300 text-sm" placeholder={isProblem ? 'What went wrong?' : 'What do you need help with?'} />
      </label>
      {isProblem ? <>
        <label className="block text-sm font-medium text-gray-800">Task attempted
          <textarea name="taskAttempted" value={form.taskAttempted} onChange={update} maxLength={300} rows={2} className="mt-1 w-full rounded-md border-gray-300 text-sm" />
        </label>
        <label className="block text-sm font-medium text-gray-800">Expected result
          <textarea name="expectedResult" value={form.expectedResult} onChange={update} maxLength={500} rows={2} className="mt-1 w-full rounded-md border-gray-300 text-sm" />
        </label>
        <label className="block text-sm font-medium text-gray-800">Actual result
          <textarea name="actualResult" value={form.actualResult} onChange={update} maxLength={500} rows={2} required className="mt-1 w-full rounded-md border-gray-300 text-sm" />
        </label>
        <label className="block text-sm font-medium text-gray-800">Error message (optional)
          <textarea name="errorMessage" value={form.errorMessage} onChange={update} maxLength={300} rows={2} className="mt-1 w-full rounded-md border-gray-300 text-sm" />
        </label>
      </> : <label className="block text-sm font-medium text-gray-800">Description
        <textarea name="details" value={form.details} onChange={update} maxLength={1500} rows={5} required className="mt-1 w-full rounded-md border-gray-300 text-sm" />
      </label>}
      <p className="text-xs text-gray-500">Page: {pathname}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1" disabled={busy}>Back</button>
        <button type="submit" className="btn-primary flex-1" disabled={!valid || busy}>{busy ? 'Sending…' : 'Send to support'}</button>
      </div>
    </form>
  );
}

export default function RouteLogisticsAssistant() {
  const { currentUser, userProfile, company, workspace, role, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceReference = company?.id || workspace?.companyId || 'solo';
  const key = useMemo(() => storageKey(currentUser.uid, workspaceReference), [currentUser.uid, workspaceReference]);
  const initial = useMemo(() => readSavedConversation(key), [key]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('chat');
  const [sessionId, setSessionId] = useState(initial.sessionId);
  const [messages, setMessages] = useState(initial.messages);
  const [escalated, setEscalated] = useState(initial.escalated);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [pendingActions, setPendingActions] = useState([]);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const messageEndRef = useRef(null);
  const previousKeyRef = useRef(key);
  const workspaceReady = ['company', 'solo'].includes(workspace?.status);
  const context = useMemo(() => ({ can, role, pathname: location.pathname, workspaceReady }), [can, role, location.pathname, workspaceReady]);
  const page = useMemo(() => pageKnowledge(location.pathname, context), [location.pathname, context]);
  const questions = useMemo(() => suggestedQuestions(location.pathname, context), [location.pathname, context]);

  useEffect(() => {
    if (previousKeyRef.current !== key) {
      const next = readSavedConversation(key);
      setSessionId(next.sessionId); setMessages(next.messages); setEscalated(next.escalated);
      setError(''); setPendingActions([]); setMode('chat'); setOpen(false);
      previousKeyRef.current = key;
    }
  }, [key]);

  useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify({ sessionId, messages: messages.slice(-MAX_LOCAL_MESSAGES), escalated }));
  }, [key, sessionId, messages, escalated]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = event => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.removeEventListener('keydown', handler);
  }, [open, mode]);

  useEffect(() => { if (open) messageEndRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages, open, mode]);

  useEffect(() => {
    if (!sessionId || messages.length || !workspaceReady) return;
    let active = true;
    loadAssistantHistory(sessionId).then(result => {
      if (!active) return;
      setMessages(result.messages || []);
      setEscalated(result.escalationState === 'requested');
    }).catch(() => {});
    return () => { active = false; };
  }, [sessionId, messages.length, workspaceReady]);

  const navigateTo = action => {
    if (!authorizedActions([action.id], can, workspaceReady).length) {
      setError('Your current role cannot open that page.');
      return;
    }
    navigate(action.route);
    setOpen(false);
  };

  const addDeterministicHelp = useCallback((question, prefix = '') => {
    const result = deterministicHelp(question, context);
    setMessages(value => mergeMessages(value, [localMessage('assistant', `${prefix}${result.text}`, { fallback: true })]));
    setPendingActions(result.actions);
    return result;
  }, [context]);

  const ask = useCallback(async rawQuestion => {
    const question = String(rawQuestion || '').trim();
    if (!question || busy) return;
    if (question.length > 1000) { setError('Questions are limited to 1,000 characters.'); return; }
    if (containsSensitiveQuestion(question)) { setError('Remove email addresses, phone numbers, passwords, credentials, payment details, or access tokens before sending.'); return; }
    setBusy(true); setError(''); setLastQuestion(question); setInput(''); setPendingActions([]);
    setMessages(value => mergeMessages(value, [localMessage('visitor', question)]));
    const local = deterministicHelp(question, context);
    try {
      const result = await sendAssistantMessage({ sessionId, message: question, route: location.pathname });
      if (result.disabled || result.fallback) {
        addDeterministicHelp(question, 'AI guidance is currently disabled. ');
      } else {
        setSessionId(result.sessionId || sessionId);
        setMessages(value => mergeMessages(value, result.messages || []));
        setPendingActions(local.actions);
      }
    } catch (requestError) {
      setError(assistantErrorMessage(requestError));
      addDeterministicHelp(question, 'Using verified in-app help: ');
    } finally { setBusy(false); }
  }, [addDeterministicHelp, busy, context, location.pathname, sessionId]);

  const newConversation = async () => {
    const old = sessionId;
    setSessionId(''); setMessages([]); setEscalated(false); setError(''); setPendingActions([]); setMode('chat');
    sessionStorage.removeItem(key);
    if (old) closeAssistantSession(old).catch(() => {});
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const refreshHistory = async () => {
    if (!sessionId || busy) return;
    setBusy(true); setError('');
    try {
      const result = await loadAssistantHistory(sessionId);
      setMessages(value => mergeMessages(value, result.messages));
    } catch (requestError) { setError(assistantErrorMessage(requestError)); }
    finally { setBusy(false); }
  };

  const submitSupport = async form => {
    setBusy(true); setError('');
    try {
      const result = await escalateAssistantSession({
        ...form, sessionId: sessionId || null, operationId: crypto.randomUUID(),
        appVersion: import.meta.env.VITE_APP_VERSION || `web/${ROUTE_LOGISTICS_KNOWLEDGE_VERSION}`,
      });
      setSessionId(result.sessionId || sessionId); setEscalated(true); setMode('chat');
      setMessages(value => mergeMessages(value, [
        ...(result.messages || []),
        localMessage('system', result.acknowledgment || 'Your request was sent to Workside Support. This widget does not promise an immediate live response.'),
      ]));
    } catch (requestError) { setError(assistantErrorMessage(requestError)); }
    finally { setBusy(false); }
  };

  const helpWithPage = () => {
    setMode('chat');
    const question = `Help with this page: ${page?.displayName || location.pathname}`;
    setMessages(value => mergeMessages(value, [localMessage('visitor', question)]));
    addDeterministicHelp(question);
  };

  return <>
    <button type="button" onClick={() => setOpen(value => !value)} className="fixed bottom-5 right-5 z-[65] flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-sm font-semibold text-white shadow-xl hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2" aria-label={open ? 'Close Route Logistics Assistant' : 'Open Route Logistics Assistant'} aria-expanded={open}>
      <ChatBubbleLeftRightIcon className="h-6 w-6" /><span className="hidden sm:inline">Help</span>
    </button>
    {open && <section ref={panelRef} role="dialog" aria-label="Route Logistics Assistant" className="fixed inset-x-2 bottom-20 top-2 z-[64] flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:inset-auto sm:bottom-20 sm:right-5 sm:top-auto sm:h-[min(720px,calc(100vh-7rem))] sm:w-[430px]">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
        <div><h2 className="font-semibold text-gray-900">Route Logistics Assistant</h2><p className="text-xs text-gray-500">Read-only guidance and verified navigation</p></div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={newConversation} className="rounded-md px-2 py-1 text-xs text-primary-700 hover:bg-primary-50">New</button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 text-gray-500 hover:bg-gray-100" aria-label="Minimize assistant"><XMarkIcon className="h-5 w-5" /></button>
        </div>
      </header>
      <nav className="flex shrink-0 gap-1 border-b border-gray-200 px-3 py-2" aria-label="Assistant options">
        <button type="button" onClick={() => setMode('chat')} className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === 'chat' ? 'bg-primary-100 text-primary-800' : 'text-gray-600 hover:bg-gray-100'}`}>Ask</button>
        <button type="button" onClick={helpWithPage} className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Help with this page</button>
        <button type="button" onClick={() => setMode('support')} className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Support</button>
        <button type="button" onClick={() => setMode('problem')} className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Report problem</button>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {(mode === 'support' || mode === 'problem') ? <SupportForm mode={mode} currentEmail={currentUser.email} defaultName={userProfile?.name || currentUser.displayName} pathname={location.pathname} busy={busy} onCancel={() => setMode('chat')} onSubmit={submitSupport} /> : <>
          {!messages.length && <div className="space-y-3">
            <div className="rounded-xl bg-primary-50 p-4 text-sm text-gray-800"><p className="font-semibold text-primary-800">How can I help?</p><p className="mt-1">Ask how to complete a Route Logistics task. I use your current page and verified role, but I do not inspect form values or private records.</p></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Suggested questions</p><div className="space-y-2">{questions.map(question => <button key={question} type="button" onClick={() => ask(question)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50">{question}</button>)}</div></div>
          </div>}
          <div className="space-y-3" aria-live="polite">{messages.map(message => <article key={message.id} className={`rounded-xl p-3 text-sm ${message.role === 'visitor' ? 'ml-8 bg-primary-600 text-white' : message.role === 'system' ? 'border border-amber-200 bg-amber-50 text-amber-900' : 'mr-8 bg-gray-100 text-gray-800'}`}>
            <p className={`mb-1 text-xs font-semibold ${message.role === 'visitor' ? 'text-primary-100' : 'text-gray-500'}`}>{displayRole(message.role)}</p><p className="whitespace-pre-wrap break-words">{message.text}</p>
          </article>)}</div>
          {pendingActions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{pendingActions.map(action => <button key={action.id} type="button" onClick={() => navigateTo(action)} className="rounded-md bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700">{action.label}</button>)}</div>}
          {busy && <div className="mt-3 flex items-center gap-2 text-sm text-gray-500" role="status"><ArrowPathIcon className="h-4 w-4 animate-spin" />Checking verified guidance…</div>}
          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><div className="flex gap-2"><ExclamationTriangleIcon className="h-5 w-5 shrink-0" /><span>{error}</span></div>{lastQuestion && <button type="button" onClick={() => ask(lastQuestion)} disabled={busy} className="mt-2 font-semibold underline">Retry</button>}</div>}
          {escalated && <div className="mt-3 rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm text-gray-800"><div className="flex items-start gap-2"><LifebuoyIcon className="h-5 w-5 shrink-0 text-primary-700" /><p>Workside Support handoff requested. Use Refresh to check for supported follow-up; an immediate live reply is not promised.</p></div><button type="button" onClick={refreshHistory} disabled={busy} className="mt-2 text-xs font-semibold text-primary-700 underline">Refresh conversation</button></div>}
          <div ref={messageEndRef} />
        </>}
      </div>
      {mode === 'chat' && <form className="shrink-0 border-t border-gray-200 p-3" onSubmit={event => { event.preventDefault(); ask(input); }}>
        <label htmlFor="rl-assistant-input" className="sr-only">Ask Route Logistics Assistant</label>
        <textarea ref={inputRef} id="rl-assistant-input" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(input); } }} maxLength={1000} rows={2} className="w-full resize-none rounded-lg border-gray-300 text-sm" placeholder="Ask how to complete a task…" />
        <div className="mt-2 flex items-center justify-between gap-3"><p className="text-[11px] text-gray-500">Do not include customer or financial data.</p><button type="submit" disabled={!input.trim() || busy} className="btn-primary px-4 py-2 text-sm">Send</button></div>
      </form>}
    </section>}
  </>;
}

