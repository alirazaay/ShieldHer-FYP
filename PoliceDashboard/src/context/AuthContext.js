import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth, db, doc, getDoc, serverTimestamp } from '../config/firebase';
import { setDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [policeProfile, setPoliceProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch police officer profile from Firestore
        try {
          const profileDoc = await getDoc(doc(db, 'policeUsers', firebaseUser.uid));
          if (profileDoc.exists()) {
            setPoliceProfile({ id: profileDoc.id, ...profileDoc.data() });
          } else {
            // User exists in Auth but not in policeUsers — they may have just signed up
            setPoliceProfile(null);
          }
        } catch (error) {
          console.error('Error fetching police profile:', error);
          setPoliceProfile(null);
        }
      } else {
        setUser(null);
        setPoliceProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Login with email and password
  const login = async (email, password) => {
    setAuthError(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (error) {
      const message = getAuthErrorMessage(error.code);
      setAuthError(message);
      throw new Error(message);
    }
  };

  // Sign up — creates Auth user + policeUsers Firestore document
  const signup = async (email, password, profileData) => {
    setAuthError(null);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      // Create police profile document
      await setDoc(doc(db, 'policeUsers', result.user.uid), {
        uid: result.user.uid,
        name: profileData.name,
        email: email,
        contact: profileData.contact,
        station: profileData.location,
        rank: profileData.rank,
        role: 'officer',
        createdAt: serverTimestamp(),
      });
      return result.user;
    } catch (error) {
      const message = getAuthErrorMessage(error.code);
      setAuthError(message);
      throw new Error(message);
    }
  };

  // Password reset
  const resetPassword = async (email) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      const message = getAuthErrorMessage(error.code);
      setAuthError(message);
      throw new Error(message);
    }
  };

  // Logout
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Clear auth errors
  const clearError = () => setAuthError(null);

  const value = {
    user,
    policeProfile,
    loading,
    authError,
    login,
    signup,
    logout,
    resetPassword,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Human-readable Firebase Auth error messages
function getAuthErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
      return 'Incorrect password.';
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    default:
      return 'Authentication failed. Please try again.';
  }
}

export default AuthContext;
