// src/lib/firestore.js
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function isAdmin(email) {
  if (!email) return false;
  const snap = await getDoc(doc(db, 'admins', email.toLowerCase()));
  return snap.exists();
}
