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
import {
  MAX_ASSISTANT_MESSAGES,
  createClientMessageId,
  localAssistantMessage,
  markAssistantAttempt,
  optimisticVisitorMessage,
  reconcileAssistantMessages,
} from '../../services/assistantMessages';

const STORAGE_PREFIX = 'rl-assistant:';

function storageKey(uid, workspaceReference) {
  return `${STORAGE_PREFIX}${uid}:${workspaceReference}`;
}
function readSavedConversation(key) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || '{}');
    return {
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-MAX_ASSISTANT_MESSAGES) : [],
      escalated: parsed.escalated === true,
      supportStatus: typeof parsed.supportStatus === 'string' ? parsed.supportStatus : '',
    };
  } catch {
    return { sessionId: '', messages: [], escalated: false, supportStatus: '' };
  }
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
        <button type="submit" className="btn-primary flex-1" disabled={!valid || busy}>{busy ? 'Connecting…' : 'Send to support'}</button>
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
  const [supportStatus, setSupportStatus] = useState(initial.supportStatus);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [lastAttempt, setLastAttempt] = useState(null);
  const [pendingActions, setPendingActions] = useState([]);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const messageEndRef = useRef(null);
  const previousKeyRef = useRef(key);
  const historyLoadedRef = useRef('');
  const submissionRef = useRef('');
  const workspaceReady = ['company', 'solo'].includes(workspace?.status);
  const context = useMemo(() => ({ can, role, pathname: location.pathname, workspaceReady }), [can, role, location.pathname, workspaceReady]);
  const page = useMemo(() => pageKnowledge(location.pathname, context), [location.pathname, context]);
  const questions = useMemo(() => suggestedQuestions(location.pathname, context), [location.pathname, context]);

  useEffect(() => {
    if (previousKeyRef.current !== key) {
      const next = readSavedConversation(key);
      setSessionId(next.sessionId); setMessages(next.messages); setEscalated(next.escalated); setSupportStatus(next.supportStatus);
      setError(''); setLastAttempt(null); setPendingActions([]); setMode('chat'); setOpen(false);
      historyLoadedRef.current = ''; submissionRef.current = '';
      previousKeyRef.current = key;
    }
  }, [key]);

  useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify({ sessionId, messages: messages.slice(-MAX_ASSISTANT_MESSAGES), escalated, supportStatus }));
  }, [key, sessionId, messages, escalated, supportStatus]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = event => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.removeEventListener('keydown', handler);
  }, [open, mode]);

  useEffect(() => { if (open) messageEndRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages, open, mode]);

  useEffect(() => {
    if (!sessionId || !workspaceReady) return undefined;
    const marker = `${key}:${sessionId}`;
    if (historyLoadedRef.current === marker) return undefined;
    historyLoadedRef.current = marker;
    let active = true;
    loadAssistantHistory(sessionId).then(result => {
      if (!active) return;
      setMessages(value => reconcileAssistantMessages(value, result.messages || [], { acknowledgments: result.acknowledgments || [] }));
      setEscalated(result.escalationState === 'requested' && !!result.supportSessionId);
      setSupportStatus(result.supportStatus || '');
    }).catch(() => { if (active) historyLoadedRef.current = ''; });
    return () => { active = false; };
  }, [key, sessionId, workspaceReady]);

  const navigateTo = action => {
    if (!authorizedActions([action.id], can, workspaceReady).length) {
      setError('Your current role cannot open that page.');
      return;
    }
    navigate(action.route);
    setOpen(false);
  };

  const addDeterministicHelp = useCallback((question, prefix = '', clientMessageId = '') => {
    const result = deterministicHelp(question, context);
    setMessages(value => reconcileAssistantMessages(value, [localAssistantMessage(`${prefix}${result.text}`, { clientMessageId, fallback: true })]));
    setPendingActions(result.actions);
    return result;
  }, [context]);

  const ask = useCallback(async (rawQuestion, retryAttempt = null) => {
    const question = String(rawQuestion || '').trim();
    if (!question || submissionRef.current) return;
    if (question.length > 1000) { setError('Questions are limited to 1,000 characters.'); return; }
    if (containsSensitiveQuestion(question)) { setError('Remove email addresses, phone numbers, passwords, credentials, payment details, or access tokens before sending.'); return; }
    const attempt = retryAttempt?.clientMessageId
      ? { clientMessageId: retryAttempt.clientMessageId, question }
      : { clientMessageId: createClientMessageId(), question };
    submissionRef.current = attempt.clientMessageId;
    setBusy(true); setError(''); setLastQuestion(question); setInput(''); setPendingActions([]);
    setMessages(value => retryAttempt
      ? markAssistantAttempt(value, attempt.clientMessageId, 'sending')
      : reconcileAssistantMessages(value, [optimisticVisitorMessage(attempt.clientMessageId, question)]));
    const local = deterministicHelp(question, context);
    try {
      const result = await sendAssistantMessage({ sessionId, message: question, route: location.pathname, clientMessageId: attempt.clientMessageId });
      if (result.disabled || result.fallback) {
        setMessages(value => markAssistantAttempt(value, attempt.clientMessageId, 'local'));
        addDeterministicHelp(question, 'AI guidance is currently disabled. ', attempt.clientMessageId);
        setLastAttempt(null);
      } else {
        const nextSessionId = result.sessionId || sessionId;
        if (nextSessionId) historyLoadedRef.current = `${key}:${nextSessionId}`;
        setSessionId(nextSessionId);
        setMessages(value => reconcileAssistantMessages(value, result.messages || [], {
          acknowledgments: result.acknowledgments || (result.acknowledgment ? [result.acknowledgment] : []),
        }));
        setPendingActions(local.actions);
        setLastAttempt(null);
      }
    } catch (requestError) {
      setError(assistantErrorMessage(requestError));
      setLastAttempt(attempt);
      setMessages(value => markAssistantAttempt(value, attempt.clientMessageId, 'retryable'));
      addDeterministicHelp(question, 'Using verified in-app help: ', attempt.clientMessageId);
    } finally {
      if (submissionRef.current === attempt.clientMessageId) submissionRef.current = '';
      setBusy(false);
    }
  }, [addDeterministicHelp, context, key, location.pathname, sessionId]);

  const newConversation = async () => {
    const old = sessionId;
    setSessionId(''); setMessages([]); setEscalated(false); setSupportStatus(''); setError(''); setPendingActions([]); setMode('chat');
    setLastAttempt(null); historyLoadedRef.current = ''; submissionRef.current = '';
    sessionStorage.removeItem(key);
    if (old) closeAssistantSession(old).catch(() => {});
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const refreshHistory = async () => {
    if (!sessionId || busy) return;
    setBusy(true); setError('');
    try {
      const result = await loadAssistantHistory(sessionId);
      setMessages(value => reconcileAssistantMessages(value, result.messages, { acknowledgments: result.acknowledgments || [] }));
      setEscalated(result.escalationState === 'requested' && !!result.supportSessionId);
      setSupportStatus(result.supportStatus || '');
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
      setSessionId(result.sessionId || sessionId);
      setEscalated(result.persisted === true && !!result.supportSessionId);
      setSupportStatus(result.persisted === true ? (result.supportStatus || 'received') : 'requesting');
      setMode('chat');
      setMessages(value => reconcileAssistantMessages(value, [
        ...(result.messages || []),
        localMessage('system', result.acknowledgment || 'Connecting your request to Workside Support. Please check again shortly.'),
      ]));
    } catch (requestError) {
      const code = String(requestError?.code || '').replace(/^functions\//, '');
      setError(code === 'unavailable'
        ? "We couldn't confirm that Workside Support received your request. Please retry."
        : assistantErrorMessage(requestError));
    }
    finally { setBusy(false); }
  };

  const helpWithPage = () => {
    setMode('chat');
    const question = `Help with this page: ${page?.displayName || location.pathname}`;
    setMessages(value => reconcileAssistantMessages(value, [localMessage('visitor', question)]));
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
          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><div className="flex gap-2"><ExclamationTriangleIcon className="h-5 w-5 shrink-0" /><span>{error}</span></div>{lastAttempt && <button type="button" onClick={() => ask(lastQuestion, lastAttempt)} disabled={busy} className="mt-2 font-semibold underline">Retry</button>}</div>}
          {(escalated || supportStatus === 'requesting') && <div className="mt-3 rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm text-gray-800"><div className="flex items-start gap-2"><LifebuoyIcon className="h-5 w-5 shrink-0 text-primary-700" /><p>{supportStatus === 'requesting' ? 'Connecting your request to Workside Support. Use Refresh to check again shortly.' : supportStatus === 'waiting_for_agent' ? 'Workside Support has received your request. It is waiting for a representative; an immediate live reply is not promised.' : supportStatus === 'assigned_to_support' ? 'Workside Support has received your request and assigned it to a representative. An immediate live reply is not promised.' : 'Workside Support has received your request. Use Refresh to check for supported follow-up; an immediate live reply is not promised.'}</p></div><button type="button" onClick={refreshHistory} disabled={busy} className="mt-2 text-xs font-semibold text-primary-700 underline">Refresh conversation</button></div>}
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

