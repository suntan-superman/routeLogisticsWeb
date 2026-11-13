import { sendPasswordResetEmail } from 'firebase/auth';

export const PASSWORD_RESET_MESSAGE = 'If an account exists for this email, a password reset link has been sent. Check your inbox and junk folder.';

export async function requestPasswordReset(auth, email, origin) {
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase(), {
      url: new URL('/login', origin).href,
    });
  } catch (error) {
    // Give the same response when older Firebase configurations expose a missing account.
    if (error.code !== 'auth/user-not-found') throw error;
  }
  return PASSWORD_RESET_MESSAGE;
}
