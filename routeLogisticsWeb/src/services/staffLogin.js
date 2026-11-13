import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, functions } from './firebase';

export async function requestStaffCode(email) {
  const result = await httpsCallable(functions, 'rlRequestStaffOTP')({ email: email.trim().toLowerCase() });
  return result.data;
}

export async function signInWithStaffCode(challengeId, code) {
  const result = await httpsCallable(functions, 'rlVerifyStaffOTP')({ challengeId, code });
  return signInWithCustomToken(auth, result.data.token);
}
