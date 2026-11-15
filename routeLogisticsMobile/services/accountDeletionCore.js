// Dependency-injected orchestration keeps destructive effects testable offline.
function createAccountDeletion(deps) {
  let active = null;
  const confirmed = new Map();
  const summary = async () => {
    const account = deps.account();
    if (!account?.uid) throw new Error('Sign in before reviewing account deletion.');
    return deps.summary(account.uid);
  };
  const remove = options => {
    if (active) return active;
    let recorded = null;
    const task = (async () => {
      const live = deps.account();
      // A confirmed deletion may invalidate Auth before local cleanup finishes.
      // The recorded UID, never a caller-supplied identity, owns that retry.
      const previous = !live && confirmed.size === 1 ? [...confirmed.values()][0] : confirmed.get(live?.uid);
      const account = live || previous;
      if (!previous && (!account?.uid || !account.emailVerified)) throw Object.assign(new Error('Sign in with your verified email before deleting your account.'), { code: 'auth/unverified' });
      if (options?.confirmation !== 'DELETE') throw new Error('Type DELETE to confirm account deletion.');
      if (!previous && await deps.isOffline()) throw new Error('Connect to the internet to delete your account.');
      const uid = account.uid;
      const release = await deps.pause(uid);
      let receipt = previous?.receipt, serverConfirmed = !!receipt;
      if (previous) recorded = previous;
      try {
        if (!serverConfirmed) {
          const pending = await deps.summary(uid);
          if ((pending.pendingOperations || pending.pendingPhotos) && !options.discardPendingWork) throw new Error('Synchronize your saved work first, or explicitly confirm discarding the pending edits and photos.');
          // Capture a recent token before shutdown. An interrupted response can
          // then be retried with the same proof even after Auth is deleted.
          const token = await account.getIdToken();
          await deps.stopTracking();
          await deps.stopPush();
          if (deps.account()?.uid !== uid) throw new Error('Your signed-in account changed. Sign in again before deleting it.');
          const result = await deps.invoke(token);
          if (result?.success !== true || (result.deleted !== true && result.deletionPending !== true)) throw new Error('The server did not confirm deletion. Your saved work has been retained; retry to confirm the result.');
          receipt = result; recorded = { uid, email: account.email, receipt };
          confirmed.set(uid, recorded); serverConfirmed = true;
        }
        await deps.record?.(recorded);
        await deps.purge(uid, account.email);
        await deps.finishSession(uid);
        await deps.clearRecord?.(uid);
        confirmed.delete(uid);
        return receipt.deletionPending
          ? { success: true, deletionPending: true, message: 'Deletion requested. Account access is revoked and server cleanup will retry automatically.' }
          : { success: true, deleted: true };
      } finally {
        // A completed account remains paused; a late reader must never recreate
        // its local caches after purge. The next UID gets its own independent scope.
        if (!serverConfirmed) release();
      }
    })().catch(error => recorded ? {
      success: false, deletionRecorded: true, deletionPending: !!recorded.receipt.deletionPending, localCleanupPending: true,
      error: { code: 'account/local-cleanup-failed', message: 'Your deletion request is confirmed and account access is revoked. This device could not finish removing its saved data. Retry cleanup, or remove the app and its data before using another account.' },
    } : { success: false, error: { code: error.code || 'account/deletion-failed', message: error.message || 'Account deletion could not be completed. Please retry.' } });
    active = task;
    task.finally(() => { if (active === task) active = null; });
    return task;
  };
  const resume = async () => {
    if (active) await active;
    // A storage failure may prevent writing the durable receipt itself. Keep
    // the accepted in-memory receipt usable by the signed-out Retry action.
    for (const record of [...confirmed.values()]) {
      await deps.pause(record.uid);
      await deps.record?.(record);
      await deps.purge(record.uid, record.email);
      await deps.finishSession(record.uid);
      await deps.clearRecord?.(record.uid);
      confirmed.delete(record.uid);
    }
  };
  return { summary, remove, resume };
}
module.exports = { createAccountDeletion };
