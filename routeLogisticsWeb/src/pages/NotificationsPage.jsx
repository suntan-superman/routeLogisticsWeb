import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { getClaims } from '../services/tenancy';
export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]), [error, setError] = useState('');
  useEffect(() => {
    const companyId = getClaims()?.companyId || null;
    return onSnapshot(query(collection(db, 'rlNotifications'), where('userId', '==', auth.currentUser.uid), where('companyId', '==', companyId), orderBy('createdAt', 'desc'), limit(100)), (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => setError(e.message));
  }, []);
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Notifications</h1><p className="text-gray-600">Latest 100 job updates.</p>{error && <p role="alert">{error}</p>}{!notifications.length && !error && <p>No notifications yet.</p>}{notifications.map((item) => <article key={item.id} className={`rounded-lg border p-4 ${item.read ? 'bg-white' : 'bg-blue-50'}`}><h2 className="font-semibold">{item.title}</h2><p className="my-2">{item.body}</p><Link to="/jobs" className="text-primary-700 underline">View jobs</Link>{!item.read && <button className="ml-5 underline" onClick={() => updateDoc(doc(db, 'rlNotifications', item.id), { read: true }).catch((e) => setError(e.message))}>Mark read</button>}</article>)}</div>;
}
