/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, History, MapPin, Utensils, Info, Menu, X, Mic, MicOff, Image as ImageIcon, Sun, Moon, LogOut, LogIn, Search, Paperclip, ChevronLeft, ChevronRight, Maximize2, Minimize2, Copy, Check, Settings, Camera, BookOpen, Download, Bookmark, Library, Trash2, Newspaper, ExternalLink } from 'lucide-react';
import { getMasryAI, generateEgyptianImage, getEgyptNews, type MasryThinkingLevel } from './services/geminiService';
import { EGYPTIAN_SLANG } from './constants';
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser, updateProfile } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, updateDoc } from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  image?: string;
  groundingChunks?: { title: string; uri: string }[];
  status?: 'sending' | 'sent' | 'read';
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated: string;
}

interface Snippet {
  id: string;
  title: string;
  code: string;
  language: string;
  timestamp: string;
}

interface NewsItem {
  title: string;
  summary: string;
  category: string;
  url?: string;
  source?: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Dispatch custom event for UI to handle
  window.dispatchEvent(new CustomEvent('firestore-error', { detail: errInfo }));
}

const Logo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={cn("fill-current", className)}>
    {/* Advanced Iconic Logo: A fusion of a modern eye, a pyramid, and digital circuits */}
    <defs>
      <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c5a059" />
        <stop offset="100%" stopColor="#8b6b3d" />
      </linearGradient>
    </defs>
    <path d="M50 10 L90 85 L10 85 Z" fill="url(#goldGradient)" className="opacity-10" />
    <path d="M50 20 L80 80 L20 80 Z" fill="url(#goldGradient)" className="opacity-20" />
    <circle cx="50" cy="55" r="12" fill="url(#goldGradient)" className="opacity-30 shadow-xl" />
    <circle cx="50" cy="55" r="6" fill="url(#goldGradient)" />
    {/* Stylized Eye of Horus elements */}
    <path d="M20 55 Q50 30 80 55 Q50 80 20 55" fill="none" stroke="url(#goldGradient)" strokeWidth="3" strokeLinecap="round" />
    <path d="M35 70 Q45 75 50 85" fill="none" stroke="url(#goldGradient)" strokeWidth="2" strokeLinecap="round" />
    <path d="M65 70 Q55 75 50 85" fill="none" stroke="url(#goldGradient)" strokeWidth="2" strokeLinecap="round" />
    {/* Digital Circuit Accents */}
    <rect x="48" y="10" width="4" height="10" fill="url(#goldGradient)" rx="2" />
    <rect x="10" y="53" width="10" height="4" fill="url(#goldGradient)" rx="2" />
    <rect x="80" y="53" width="10" height="4" fill="url(#goldGradient)" rx="2" />
  </svg>
);

const CodeBlock = ({ language, value, onSave }: { language: string, value: string, onSave?: (code: string, lang: string) => void }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCode = () => {
    const blob = new Blob([value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const extension = language === 'javascript' ? 'js' : language === 'typescript' ? 'ts' : language === 'python' ? 'py' : language === 'html' ? 'html' : language === 'css' ? 'css' : 'txt';
    a.href = url;
    a.download = `code-snippet-${Date.now()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative group my-4 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 bg-black/5 dark:bg-black/40 backdrop-blur-md border-b border-black/5 dark:border-white/5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#c5a059]">{language || 'code'}</span>
        <div className="flex items-center gap-1">
          {onSave && (
            <button 
              onClick={() => onSave(value, language)}
              className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-all text-[#2c2c2c]/60 dark:text-white/60 hover:text-[#c5a059]"
              title="حفظ في المكتبة"
            >
              <Bookmark size={14} />
            </button>
          )}
          <button 
            onClick={downloadCode}
            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-all text-[#2c2c2c]/60 dark:text-white/60 hover:text-white"
            title="تحميل الملف"
          >
            <Download size={14} />
          </button>
          <button 
            onClick={copyToClipboard}
            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-all text-[#2c2c2c]/60 dark:text-white/60 hover:text-white"
            title="نسخ الكود"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: '1.5rem',
          fontSize: '0.85rem',
          backgroundColor: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(10px)'
        }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#fdfaf6] dark:bg-[#1a1a1a] p-6 text-center" dir="rtl">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-6">
            <X className="text-red-500" size={40} />
          </div>
          <h1 className="text-2xl font-bold text-[#8b6b3d] dark:text-[#c5a059] mb-4">يا باشا حصل مشكلة غير متوقعة!</h1>
          <p className="text-[#2c2c2c]/60 dark:text-[#fdfaf6]/60 max-w-md mb-8">
            عذراً، التطبيق واجه خطأ فني. جرب تعمل تحديث للصفحة (Refresh) وإن شاء الله كل حاجة ترجع تمام.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-[#c5a059] text-white rounded-xl font-bold shadow-lg hover:bg-[#b08d4a] transition-all"
          >
            تحديث الصفحة
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-8 p-4 bg-black/5 rounded-lg text-xs text-left overflow-auto max-w-full">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

  function MainApp() {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [thinkingLevel, setThinkingLevel] = useState<MasryThinkingLevel>('deep');
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const [showArtifact, setShowArtifact] = useState(false);
    const [artifactContent, setArtifactContent] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);
    const [isWidgetMode, setIsWidgetMode] = useState(false);
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [isNewsOpen, setIsNewsOpen] = useState(false);
    const [isNewsLoading, setIsNewsLoading] = useState(false);
    const [editDisplayName, setEditDisplayName] = useState('');
    const [editPhotoURL, setEditPhotoURL] = useState('');
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
    const [isSessionsLoading, setIsSessionsLoading] = useState(true);
    const isCreatingInitialChat = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const currentSession = sessions.find(s => s.id === currentSessionId);
    const messages = currentSession?.messages || [];

  // Load dark mode preference
  useEffect(() => {
    const savedMode = localStorage.getItem('masry_ai_dark_mode');
    if (savedMode === 'true') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('masry_ai_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('masry_ai_dark_mode', 'false');
    }
  };

  const saveSnippet = async (code: string, language: string) => {
    if (!user) {
      setToast({ message: 'لازم تسجل دخول الأول يا باشا عشان تحفظ الكود!', type: 'error' });
      return;
    }

    try {
      const snippetsRef = collection(db, 'users', user.uid, 'snippets');
      await addDoc(snippetsRef, {
        title: `كود ${language || 'برمجي'} - ${new Date().toLocaleDateString('ar-EG')}`,
        code,
        language,
        timestamp: new Date().toISOString()
      });
      setToast({ message: 'تم حفظ الكود في مكتبتك بنجاح!', type: 'success' });
    } catch (error) {
      console.error('Error saving snippet:', error);
      setToast({ message: 'حصل مشكلة وأنا بحفظ الكود، جرب تاني.', type: 'error' });
    }
  };

  const deleteSnippet = async (snippetId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'snippets', snippetId));
      setToast({ message: 'تم حذف الكود من المكتبة.', type: 'success' });
    } catch (error) {
      console.error('Error deleting snippet:', error);
      setToast({ message: 'فشلت عملية الحذف، جرب تاني.', type: 'error' });
    }
  };

  const fetchNews = async () => {
    setIsNewsLoading(true);
    setIsNewsOpen(true);
    try {
      const newsData = await getEgyptNews();
      setNews(newsData);
    } catch (error) {
      console.error('Error fetching news:', error);
      setToast({ message: 'حصل مشكلة وأنا بجيب الأخبار، جرب تاني.', type: 'error' });
    } finally {
      setIsNewsLoading(false);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  }, [input]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Listen for Firestore errors
  useEffect(() => {
    const handleErr = (e: any) => {
      const detail = e.detail;
      let userMessage = "يا باشا حصلت مشكلة في قاعدة البيانات، جرب تاني كمان شوية.";
      
      if (detail.error.includes('permission-denied')) {
        userMessage = "معندكش صلاحية تعمل العملية دي، اتأكد إنك مسجل دخول صح.";
      } else if (detail.error.includes('quota-exceeded')) {
        userMessage = "يا عيني، الكوتة خلصت النهاردة! جرب تاني بكرة إن شاء الله.";
      } else if (detail.error.includes('unavailable')) {
        userMessage = "السيرفر واقع حالياً، جرب كمان دقيقة.";
      }

      setToast({ message: userMessage, type: 'error' });
      
      // Auto-hide toast
      setTimeout(() => {
        setToast(null);
      }, 5000);
    };

    window.addEventListener('firestore-error', handleErr);
    return () => window.removeEventListener('firestore-error', handleErr);
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser) {
        // Sync user profile to Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          await setDoc(userRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            lastLogin: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      } else {
        setSessions([]);
        setCurrentSessionId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load Sessions from Firestore
  useEffect(() => {
    if (!user) {
      setIsSessionsLoading(false);
      return;
    }

    setIsSessionsLoading(true);
    const sessionsRef = collection(db, 'users', user.uid, 'sessions');
    const q = query(sessionsRef, orderBy('lastUpdated', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedSessions: ChatSession[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        messages: [] // Messages will be loaded separately for current session
      } as ChatSession));
      
      setSessions(loadedSessions);
      setIsSessionsLoading(false);
      
      if (loadedSessions.length > 0 && !currentSessionId) {
        setCurrentSessionId(loadedSessions[0].id);
      } else if (loadedSessions.length === 0 && !isCreatingInitialChat.current) {
        isCreatingInitialChat.current = true;
        createNewChat();
      }
    }, (error) => {
      setIsSessionsLoading(false);
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/sessions`);
    });

    return () => unsubscribe();
  }, [user]);

  // Load Snippets from Firestore
  useEffect(() => {
    if (!user) {
      setSnippets([]);
      return;
    }

    const snippetsRef = collection(db, 'users', user.uid, 'snippets');
    const q = query(snippetsRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const snippetsData: Snippet[] = [];
      snapshot.forEach((doc) => {
        snippetsData.push({ id: doc.id, ...doc.data() } as Snippet);
      });
      setSnippets(snippetsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/snippets`);
    });

    return () => unsubscribe();
  }, [user]);

  // Load Messages for Current Session
  useEffect(() => {
    if (!user || !currentSessionId) return;

    const messagesRef = collection(db, 'users', user.uid, 'sessions', currentSessionId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedMessages = snapshot.docs.map(doc => doc.data() as Message);
      
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, messages: loadedMessages };
        }
        return s;
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/sessions/${currentSessionId}/messages`);
    });

    return () => unsubscribe();
  }, [user, currentSessionId]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsUpdatingProfile(true);
    try {
      // Update Firebase Auth Profile
      await updateProfile(user, {
        displayName: editDisplayName,
        photoURL: editPhotoURL
      });

      // Update Firestore User Document
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: editDisplayName,
        photoURL: editPhotoURL,
        lastUpdated: serverTimestamp()
      });

      setToast({ message: 'تم تحديث البروفايل بنجاح يا باشا!', type: 'success' });
      setIsProfileModalOpen(false);
      
      // Force user state update locally
      setUser({ ...user, displayName: editDisplayName, photoURL: editPhotoURL } as FirebaseUser);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsUpdatingProfile(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const createNewChat = async () => {
    if (!user) return;
    const sessionId = Date.now().toString();
    const sessionRef = doc(db, 'users', user.uid, 'sessions', sessionId);
    
    const newSessionData = {
      id: sessionId,
      userId: user.uid,
      title: 'محادثة جديدة',
      lastUpdated: new Date().toISOString()
    };

    try {
      await setDoc(sessionRef, newSessionData);
      
      const messagesRef = collection(db, 'users', user.uid, 'sessions', sessionId, 'messages');
      await addDoc(messagesRef, {
        role: 'model',
        text: 'أهلاً بك يا باشا! أنا "مصري ذكي"، مساعدك الشخصي اللي بيفهمك من غير كلام كتير. أقدر أساعدك في أي حاجة تخص مصر، من التاريخ للأكل للتمشية، أو حتى لو عايز تدردش بس. نورتني!',
        timestamp: new Date().toISOString(),
      });

      setCurrentSessionId(sessionId);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/sessions/${sessionId}`);
      isCreatingInitialChat.current = false; // Reset if failed so it can retry
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'sessions', id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/sessions/${id}`);
    }
  };

  const groupSessionsByDate = () => {
    const groups: { [key: string]: ChatSession[] } = {
      'اليوم': [],
      'أمس': [],
      'آخر 7 أيام': [],
      'أقدم': []
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const filteredSessions = sessions.filter(session => 
      session.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
    );

    filteredSessions.forEach(session => {
      const date = new Date(session.lastUpdated);
      if (date >= today) {
        groups['اليوم'].push(session);
      } else if (date >= yesterday) {
        groups['أمس'].push(session);
      } else if (date >= lastWeek) {
        groups['آخر 7 أيام'].push(session);
      } else {
        groups['أقدم'].push(session);
      }
    });

    return groups;
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
             date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'ar-EG';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (error) {
        console.error('Failed to start recognition:', error);
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [sessions]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (isImageRequest = false) => {
    if ((!input.trim() && !attachedImage) || isLoading || !user || !currentSessionId) return;

    const userMessage: Message = {
      role: 'user',
      text: isImageRequest ? `ارسم لي: ${input}` : input,
      timestamp: new Date().toISOString(),
      image: attachedImage || undefined,
      status: 'sent',
    };

    const currentInput = input;
    const currentAttachedImage = attachedImage;
    setInput('');
    setAttachedImage(null);
    setIsLoading(true);

    try {
      const messagesRef = collection(db, 'users', user.uid, 'sessions', currentSessionId, 'messages');
      const sessionRef = doc(db, 'users', user.uid, 'sessions', currentSessionId);
      const currentSession = sessions.find(s => s.id === currentSessionId);

      // Save user message
      let userMsgRef: any;
      try {
        userMsgRef = await addDoc(messagesRef, userMessage);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/sessions/${currentSessionId}/messages`);
      }
      
      // Update session title if needed
      try {
        if (currentSession?.title === 'محادثة جديدة') {
          const newTitle = currentInput.slice(0, 30) + (currentInput.length > 30 ? '...' : '');
          await updateDoc(sessionRef, { title: newTitle, lastUpdated: new Date().toISOString() });
        } else {
          await updateDoc(sessionRef, { lastUpdated: new Date().toISOString() });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/sessions/${currentSessionId}`);
      }

      let modelResponseText = '';
      let modelResponseImage = '';
      let modelMessageGrounding: { title: string; uri: string }[] | undefined = undefined;

      if (isImageRequest) {
        modelResponseImage = await generateEgyptianImage(currentInput);
        modelResponseText = `تفضل يا باشا، دي الصورة اللي طلبتها لـ "${currentInput}":`;
        // Mark user message as read
        if (userMsgRef) {
          await updateDoc(userMsgRef, { status: 'read' });
        }
      } else {
        // Prepare history for Gemini
        const history = (currentSession?.messages || []).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }]
        }));

        const chat = getMasryAI(history, thinkingLevel);
        
        let parts: any[] = [{ text: currentInput || "حلل هذه الصورة يا باشا" }];
        if (currentAttachedImage) {
          const base64Data = currentAttachedImage.split(',')[1];
          const mimeType = currentAttachedImage.split(';')[0].split(':')[1];
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          });
        }

        const response = await chat.sendMessage({ message: parts });
        modelResponseText = response.text || 'عذراً، حدث خطأ ما. حاول مرة أخرى.';
        
        // Mark user message as read
        if (userMsgRef) {
          await updateDoc(userMsgRef, { status: 'read' });
        }
        
        // Detect code/artifacts (Claude-like feature)
        if (modelResponseText.includes('```')) {
          setArtifactContent(modelResponseText);
          setShowArtifact(true);
        }

        // Extract grounding metadata
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
          const sources = chunks
            .filter(c => c.web)
            .map(c => ({ title: c.web!.title || 'المصدر', uri: c.web!.uri! }));
          if (sources.length > 0) {
            modelMessageGrounding = sources;
          }
        }
      }

      const modelMessage: Message = {
        role: 'model',
        text: modelResponseText,
        image: modelResponseImage || undefined,
        groundingChunks: modelMessageGrounding,
        timestamp: new Date().toISOString(),
        status: 'read',
      };

      try {
        await addDoc(messagesRef, modelMessage);
        await updateDoc(sessionRef, { lastUpdated: new Date().toISOString() });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/sessions/${currentSessionId}`);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      const messagesRef = collection(db, 'users', user.uid, 'sessions', currentSessionId, 'messages');
      await addDoc(messagesRef, {
        role: 'model',
        text: 'يا باشا حصل مشكلة، جرب تاني كمان شوية. ممكن يكون ضغط على السيرفر.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    { icon: History, label: 'تاريخ مصر', prompt: 'احكيلي قصة غريبة من تاريخ مصر القديم' },
    { icon: Utensils, label: 'أكلة مصرية', prompt: 'ايه أحسن مكان آكل فيه كشري في القاهرة؟' },
    { icon: MapPin, label: 'خروجة حلوة', prompt: 'اقترح عليا مكان خروجة رايقة في الزمالك' },
    { icon: Sparkles, label: 'نكتة مصرية', prompt: 'قولي نكتة مصرية تضحكني' },
  ];

  return (
    <div className="flex h-screen font-sans overflow-hidden transition-colors duration-300 relative" dir="rtl">
      <div className="atmosphere" />
      
      {/* Sidebar for Desktop */}
      <aside className={cn(
        "fixed inset-y-0 right-0 z-50 w-72 glass-panel transition-transform duration-500 lg:relative lg:translate-x-0 m-4 rounded-3xl ios-shadow",
        isSidebarOpen ? "translate-x-0" : "translate-x-[calc(100%+2rem)]"
      )}>
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#c5a059]/10 flex items-center justify-center shadow-lg border border-[#c5a059]/30">
                <Logo className="w-6 h-6 text-[#c5a059]" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-[#2c2c2c] dark:text-white">مصري ذكي</h1>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors text-[#2c2c2c] dark:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
            <button
              onClick={createNewChat}
              className="w-full flex items-center justify-center gap-2 p-3 mb-4 rounded-xl bg-[#c5a059] text-white font-bold hover:bg-[#b08d4a] transition-all shadow-md active:scale-95"
            >
              <Sparkles size={18} />
              <span>محادثة جديدة</span>
            </button>

            <div className="relative mb-6">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2c2c2c]/40 dark:text-white/40" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في المحادثات..."
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:border-[#c5a059]/50 transition-colors placeholder:text-[#2c2c2c]/20 dark:placeholder:text-white/20 text-[#2c2c2c] dark:text-white"
              />
            </div>

            {isSessionsLoading ? (
              <div className="space-y-4 px-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-10 bg-black/5 dark:bg-white/5 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              Object.entries(groupSessionsByDate()).map(([groupName, groupSessions]) => (
                groupSessions.length > 0 && (
                  <div key={groupName} className="mb-6">
                    <p className="text-[10px] uppercase tracking-widest text-[#2c2c2c]/40 dark:text-white/30 font-bold mb-2 px-2">{groupName}</p>
                    <div className="space-y-1">
                      {groupSessions.map((session) => (
                        <div
                          key={session.id}
                          onClick={() => {
                            setCurrentSessionId(session.id);
                            setIsSidebarOpen(false);
                          }}
                          className={cn(
                            "group w-full flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer text-right",
                            currentSessionId === session.id 
                              ? "bg-[#c5a059]/10 dark:bg-white/20 text-[#c5a059] dark:text-white shadow-sm" 
                              : "text-[#2c2c2c]/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#2c2c2c] dark:hover:text-white"
                          )}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <History size={14} className={cn(
                              "flex-shrink-0",
                              currentSessionId === session.id ? "text-[#c5a059]" : "text-[#2c2c2c]/20 dark:text-white/20"
                            )} />
                            <span className="text-xs truncate font-medium">{session.title}</span>
                          </div>
                          <button 
                            onClick={(e) => deleteSession(session.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-500 transition-all rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ))
            )}

            <div className="pt-6">
              <p className="text-xs uppercase tracking-widest text-[#2c2c2c]/40 dark:text-white/40 font-semibold mb-4">اكتشف</p>
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInput(action.prompt);
                    setIsSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-right text-[#2c2c2c]/80 dark:text-white/80"
                >
                  <action.icon size={18} className="text-[#c5a059]" />
                  <span className="text-sm">{action.label}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className="mt-auto pt-6 border-t border-black/10 dark:border-white/10">
            {user && (
              <>
                <button
                  onClick={() => setIsLibraryOpen(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-right mb-2 text-[#2c2c2c] dark:text-white"
                >
                  <Library size={18} className="text-[#c5a059]" />
                  <span className="text-sm font-bold">مكتبة الأكواد</span>
                </button>
                <button
                  onClick={fetchNews}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-right mb-2 text-[#2c2c2c] dark:text-white"
                >
                  <Newspaper size={18} className="text-[#c5a059]" />
                  <span className="text-sm font-bold">أخبار مصر اليوم</span>
                </button>
                <button
                  onClick={() => setIsDictionaryOpen(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-right mb-2 text-[#2c2c2c] dark:text-white"
                >
                  <BookOpen size={18} className="text-[#c5a059]" />
                  <span className="text-sm font-bold">قاموس المصطلحات</span>
                </button>
                <button
                  onClick={() => {
                    setEditDisplayName(user.displayName || '');
                    setEditPhotoURL(user.photoURL || '');
                    setIsProfileModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-right mb-2 text-[#2c2c2c] dark:text-white"
                >
                  <Settings size={18} className="text-[#c5a059]" />
                  <span className="text-sm font-bold">تعديل البروفايل</span>
                </button>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors text-right mb-4"
                >
                  <LogOut size={18} />
                  <span className="text-sm font-bold">تسجيل الخروج</span>
                </button>
              </>
            )}
            <div className="flex items-center gap-3 p-3 text-[#2c2c2c]/60 dark:text-white/60">
              <Info size={18} />
              <span className="text-xs">صنع بكل حب في مصر 🇪🇬</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 m-2 md:m-4 lg:mr-0 glass-panel rounded-[2.5rem] ios-shadow overflow-hidden">
        {/* Header */}
        <header className="h-16 md:h-20 border-b border-[#8b6b3d]/10 dark:border-white/5 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-40">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-2 hover:bg-[#8b6b3d]/5 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <Menu size={24} className="text-[#8b6b3d] dark:text-[#c5a059]" />
          </button>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Logo className="w-6 h-6 text-[#8b6b3d] dark:text-[#c5a059]" />
              <span className="text-[#8b6b3d] dark:text-[#c5a059] font-bold text-lg">Masry AI</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            
            <div className="hidden md:flex items-center bg-[#8b6b3d]/5 dark:bg-white/5 rounded-full p-1 border border-[#8b6b3d]/10 dark:border-white/10">
              <button
                onClick={() => setThinkingLevel('fast')}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                  thinkingLevel === 'fast' ? "bg-[#c5a059] text-white shadow-sm" : "text-[#8b6b3d]/60 dark:text-[#c5a059]/60 hover:text-[#c5a059]"
                )}
              >
                سريع
              </button>
              <button
                onClick={() => setThinkingLevel('deep')}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                  thinkingLevel === 'deep' ? "bg-[#c5a059] text-white shadow-sm" : "text-[#8b6b3d]/60 dark:text-[#c5a059]/60 hover:text-[#c5a059]"
                )}
              >
                عميق
              </button>
              <button
                onClick={() => setThinkingLevel('genius')}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                  thinkingLevel === 'genius' ? "bg-[#c5a059] text-white shadow-sm" : "text-[#8b6b3d]/60 dark:text-[#c5a059]/60 hover:text-[#c5a059]"
                )}
              >
                عبقري
              </button>
            </div>
            
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full hover:bg-[#8b6b3d]/5 dark:hover:bg-white/5 text-[#8b6b3d] dark:text-[#c5a059] transition-all"
              title={isDarkMode ? "تفعيل الوضع المضيء" : "تفعيل الوضع الليلي"}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <button
              onClick={() => setIsWidgetMode(!isWidgetMode)}
              className={cn(
                "p-2 rounded-full transition-all",
                isWidgetMode ? "bg-[#c5a059] text-white" : "hover:bg-[#8b6b3d]/5 dark:hover:bg-white/5 text-[#8b6b3d] dark:text-[#c5a059]"
              )}
              title="نمط الويدجت"
            >
              <Maximize2 size={20} />
            </button>

            {user && (
              <button
                onClick={() => {
                  setEditDisplayName(user.displayName || '');
                  setEditPhotoURL(user.photoURL || '');
                  setIsProfileModalOpen(true);
                }}
                className="p-2 rounded-full hover:bg-[#8b6b3d]/5 dark:hover:bg-white/5 text-[#8b6b3d] dark:text-[#c5a059] transition-all"
                title="تعديل البروفايل"
              >
                <Settings size={20} />
              </button>
            )}
          </div>

          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#c5a059]/30">
            {user ? (
              <img 
                src={user.photoURL || "https://picsum.photos/seed/egypt/100/100"} 
                alt="User" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-[#c5a059] flex items-center justify-center">
                <User size={20} className="text-white" />
              </div>
            )}
          </div>
        </header>

        {/* Chat Area */}
        <div 
          className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6 custom-scrollbar"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onloadend = () => {
                setAttachedImage(reader.result as string);
              };
              reader.readAsDataURL(file);
            }
          }}
        >
          {!user ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="w-20 h-20 rounded-full bg-[#c5a059]/10 flex items-center justify-center mb-6">
                <Bot size={40} className="text-[#c5a059]" />
              </div>
              <h2 className="text-2xl font-bold text-[#8b6b3d] dark:text-[#c5a059] mb-4">أهلاً بك في مصري ذكي</h2>
              <p className="text-[#2c2c2c]/60 dark:text-[#fdfaf6]/60 max-w-md mb-8">
                سجل دخولك عشان تقدر تحفظ محادثاتك وتكملها من أي مكان، وتستمتع بكل مميزات المساعد الذكي.
              </p>
              <button
                onClick={login}
                className="flex items-center gap-3 px-8 py-4 bg-[#c5a059] text-white rounded-2xl font-bold shadow-xl hover:bg-[#b08d4a] hover:scale-105 transition-all active:scale-95"
              >
                <LogIn size={20} />
                <span>تسجيل الدخول بجوجل</span>
              </button>
            </div>
          ) : (
            <>
              <AnimatePresence initial={false}>
                {messages.length === 0 && !isLoading && (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                    <Sparkles size={48} className="text-[#c5a059] mb-4" />
                    <p className="text-lg font-medium">ابدأ المحادثة دلوقتي يا باشا!</p>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={cn(
                      "flex gap-3 md:gap-4 max-w-[92%] sm:max-w-[85%] lg:max-w-[75%]",
                      msg.role === 'user' ? "mr-auto flex-row-reverse" : "ml-auto"
                    )}
                  >
                    <div className={cn(
                      "w-7 h-7 md:w-8 md:h-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm mt-1",
                      msg.role === 'user' ? "bg-[#2c2c2c]" : "bg-[#c5a059]/10 border border-[#c5a059]/30"
                    )}>
                      {msg.role === 'user' ? <User size={14} className="text-white md:hidden" /> : <Logo className="w-4 h-4 text-[#c5a059] md:hidden" />}
                      {msg.role === 'user' ? <User size={16} className="text-white hidden md:block" /> : <Logo className="w-5 h-5 text-[#c5a059] hidden md:block" />}
                    </div>
                    
                    <div className={cn(
                      "p-3 md:p-4 rounded-2xl shadow-sm relative",
                      msg.role === 'user' 
                        ? "bg-[#2c2c2c] dark:bg-[#3d3d3d] text-white rounded-tr-none" 
                        : "bg-white dark:bg-[#2c2c2c] border border-[#8b6b3d]/10 dark:border-white/5 text-[#2c2c2c] dark:text-[#fdfaf6] rounded-tl-none"
                    )}>
                      <div className="markdown-body text-sm md:text-base break-words">
                        <Markdown
                          components={{
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline && match ? (
                                <CodeBlock
                                  language={match[1]}
                                  value={String(children).replace(/\n$/, '')}
                                  onSave={saveSnippet}
                                />
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {msg.text}
                        </Markdown>
                      </div>
                      {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-[#8b6b3d]/10 dark:border-white/10">
                          <p className="text-[10px] font-bold text-[#c5a059] mb-2">المصادر:</p>
                          <div className="flex flex-wrap gap-2">
                            {msg.groundingChunks.map((chunk, cIdx) => (
                              <a
                                key={cIdx}
                                href={chunk.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] px-2 py-1 bg-[#8b6b3d]/5 dark:bg-white/5 rounded-md hover:bg-[#c5a059]/10 transition-colors flex items-center gap-1"
                              >
                                <Info size={10} />
                                <span className="truncate max-w-[120px]">{chunk.title}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {msg.image && (
                        <div className="mt-3 rounded-xl overflow-hidden border border-[#8b6b3d]/20 shadow-inner">
                          <img 
                            src={msg.image} 
                            alt="Generated Egyptian Visual" 
                            className="w-full h-auto object-cover max-h-96"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      <div className={cn(
                        "text-[9px] md:text-[10px] mt-2 flex items-center gap-1 opacity-40",
                        msg.role === 'user' ? "justify-start" : "justify-end"
                      )}>
                        <span>{formatMessageTime(msg.timestamp)}</span>
                        {msg.role === 'user' && msg.status && (
                          <span className="flex items-center">
                            {msg.status === 'sent' && <Check size={10} />}
                            {msg.status === 'read' && (
                              <div className="flex -space-x-1">
                                <Check size={10} className="text-[#c5a059]" />
                                <Check size={10} className="text-[#c5a059]" />
                              </div>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isLoading && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 md:gap-4 ml-auto items-start"
                >
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#c5a059] flex items-center justify-center shadow-sm mt-1">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div className="glass-card border border-[#8b6b3d]/10 dark:border-white/5 p-3 md:p-4 rounded-2xl rounded-tl-none shadow-2xl">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] md:text-xs text-[#8b6b3d] dark:text-[#c5a059] font-bold">مصري ذكي بيفكر...</span>
                        <Sparkles size={12} className="text-[#c5a059] animate-spin" />
                      </div>
                      <div className="flex gap-1.5">
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                          className="w-1.5 h-1.5 md:w-2 md:h-2 bg-[#c5a059] rounded-full" 
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                          className="w-1.5 h-1.5 md:w-2 md:h-2 bg-[#c5a059] rounded-full" 
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                          className="w-1.5 h-1.5 md:w-2 md:h-2 bg-[#c5a059] rounded-full" 
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
        {/* Profile Edit Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProfileModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md glass-panel rounded-3xl ios-shadow overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xl font-bold">تعديل البروفايل</h3>
                <button 
                  onClick={() => setIsProfileModalOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleUpdateProfile} className="p-6 space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#c5a059]/30 shadow-xl">
                      <img 
                        src={editPhotoURL || "https://picsum.photos/seed/egypt/100/100"} 
                        alt="Preview" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer">
                      <Camera size={24} className="text-white" />
                    </div>
                  </div>
                  <p className="text-xs text-white/40">تقدر تغير صورتك من خلال رابط الصورة تحت</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#c5a059] uppercase tracking-widest px-1">الاسم المستعار</label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      placeholder="اسمك يا باشا..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[#c5a059]/50 transition-colors"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#c5a059] uppercase tracking-widest px-1">رابط الصورة (URL)</label>
                    <input
                      type="url"
                      value={editPhotoURL}
                      onChange={(e) => setEditPhotoURL(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[#c5a059]/50 transition-colors"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsProfileModalOpen(false)}
                    className="flex-1 py-3 rounded-xl border border-white/10 font-bold hover:bg-white/5 transition-all"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="flex-1 py-3 rounded-xl bg-[#c5a059] text-white font-bold hover:bg-[#b08d4a] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isUpdatingProfile ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      'حفظ التعديلات'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showArtifact && artifactContent && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-full lg:w-1/2 z-[60] glass-panel m-4 rounded-3xl ios-shadow flex flex-col overflow-hidden"
          >
            <div className="p-6 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#c5a059]/10 rounded-xl">
                  <Sparkles size={20} className="text-[#c5a059]" />
                </div>
                <h3 className="font-bold text-lg text-[#2c2c2c] dark:text-white">تحليل ذكي (Artifact)</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowArtifact(false)}
                  className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors text-[#2c2c2c] dark:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="markdown-body">
                <Markdown
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <CodeBlock
                          language={match[1]}
                          value={String(children).replace(/\n$/, '')}
                          onSave={saveSnippet}
                        />
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {artifactContent}
                </Markdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Widget Overlay */}
      <AnimatePresence>
        {isWidgetMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 100 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 100 }}
            className="fixed bottom-24 right-6 w-80 h-[500px] z-[100] glass-panel rounded-[2.5rem] ios-shadow flex flex-col overflow-hidden border border-[#c5a059]/30"
          >
            <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-[#c5a059]/10">
              <div className="flex items-center gap-2">
                <Logo className="w-5 h-5 text-[#c5a059]" />
                <span className="font-bold text-sm text-[#2c2c2c] dark:text-white">Masry AI Widget</span>
              </div>
              <button 
                onClick={() => setIsWidgetMode(false)}
                className="p-1 hover:bg-black/10 dark:hover:bg-white/20 rounded-full transition-colors text-[#2c2c2c] dark:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/5 dark:bg-white/5">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 text-[#2c2c2c] dark:text-white">
                  <Sparkles size={32} className="mb-2" />
                  <p className="text-xs">اسألني أي حاجة بسرعة يا باشا</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={cn(
                    "p-3 rounded-2xl text-xs max-w-[85%]",
                    msg.role === 'user' 
                      ? "bg-[#c5a059] text-white ml-auto rounded-tr-none" 
                      : "bg-white dark:bg-white/10 text-[#2c2c2c] dark:text-white mr-auto rounded-tl-none border border-black/5 dark:border-white/5"
                  )}>
                    {msg.text}
                  </div>
                ))
              )}
            </div>
            <div className="p-4 bg-black/5 dark:bg-white/5 border-t border-black/10 dark:border-white/10">
              <div className="flex gap-2 items-center bg-white dark:bg-white/10 rounded-2xl p-2 border border-black/10 dark:border-white/10">
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="اكتب هنا..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-xs py-1 text-[#2c2c2c] dark:text-white placeholder:text-[#2c2c2c]/40 dark:placeholder:text-white/40"
                />
                <button 
                  onClick={() => handleSend()}
                  className="p-2 bg-[#c5a059] text-white rounded-xl"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dictionary Modal */}
      <AnimatePresence>
        {isDictionaryOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDictionaryOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl glass-panel p-8 rounded-[2.5rem] ios-shadow overflow-hidden flex flex-col max-h-[80vh] border border-[#c5a059]/20"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#c5a059]/10 rounded-xl">
                    <BookOpen size={20} className="text-[#c5a059]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#8b6b3d] dark:text-[#c5a059]">قاموس المصطلحات المصرية</h3>
                </div>
                <button 
                  onClick={() => setIsDictionaryOpen(false)}
                  className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors text-[#2c2c2c] dark:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {EGYPTIAN_SLANG.map((item, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#8b6b3d]/10 dark:border-white/10 hover:border-[#c5a059]/30 transition-all"
                    >
                      <h4 className="font-bold text-[#c5a059] mb-1">{item.term}</h4>
                      <p className="text-sm font-semibold mb-2">{item.meaning}</p>
                      <div className="space-y-1">
                        <p className="text-xs italic opacity-60">مثال: {item.example}</p>
                        <p className="text-xs opacity-80">{item.usage}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-[#8b6b3d]/10 dark:border-white/10 text-center">
                <p className="text-xs opacity-60">القاموس ده عشان تفهمنا أكتر يا باشا!</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProfileModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md glass-panel p-8 rounded-[2.5rem] ios-shadow overflow-hidden border border-[#c5a059]/20"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#c5a059]/10 rounded-xl">
                    <User size={20} className="text-[#c5a059]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#8b6b3d] dark:text-[#c5a059]">تعديل البروفايل</h3>
                </div>
                <button 
                  onClick={() => setIsProfileModalOpen(false)}
                  className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors text-[#2c2c2c] dark:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div className="flex flex-col items-center mb-6">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#c5a059]/30 shadow-xl">
                      <img 
                        src={editPhotoURL || "https://picsum.photos/seed/egypt/100/100"} 
                        alt="Preview" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                      <Camera size={24} className="text-white" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#8b6b3d] dark:text-[#c5a059] mb-2 mr-1">الاسم المستعار</label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      placeholder="اسمك يا باشا..."
                      className="w-full bg-black/5 dark:bg-white/5 border border-[#8b6b3d]/10 dark:border-white/10 rounded-2xl py-3 px-4 focus:outline-none focus:border-[#c5a059] transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8b6b3d] dark:text-[#c5a059] mb-2 mr-1">رابط الصورة (URL)</label>
                    <input
                      type="url"
                      value={editPhotoURL}
                      onChange={(e) => setEditPhotoURL(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full bg-black/5 dark:bg-white/5 border border-[#8b6b3d]/10 dark:border-white/10 rounded-2xl py-3 px-4 focus:outline-none focus:border-[#c5a059] transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="flex-1 bg-[#c5a059] text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-[#b08d4a] transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
                  >
                    {isUpdatingProfile ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsProfileModalOpen(false)}
                    className="flex-1 bg-black/5 dark:bg-white/5 text-[#2c2c2c] dark:text-[#fdfaf6] py-4 rounded-2xl font-bold hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Library Modal */}
      <AnimatePresence>
        {isLibraryOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLibraryOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl glass-panel p-8 rounded-[2.5rem] ios-shadow overflow-hidden flex flex-col max-h-[85vh] border border-[#c5a059]/20"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#c5a059]/10 rounded-xl">
                    <Library size={20} className="text-[#c5a059]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#8b6b3d] dark:text-[#c5a059]">مكتبة الأكواد المحفوظة</h3>
                </div>
                <button 
                  onClick={() => setIsLibraryOpen(false)}
                  className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors text-[#2c2c2c] dark:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                {snippets.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center opacity-40">
                    <Bookmark size={48} className="mb-4" />
                    <p className="text-lg font-bold">مكتبتك لسه فاضية يا باشا!</p>
                    <p className="text-sm">احفظ أي كود بيعجبك وهتلاقيه هنا دايماً.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {snippets.map((snippet) => (
                      <motion.div
                        key={snippet.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group relative"
                      >
                        <div className="flex items-center justify-between mb-2 px-2">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-[#8b6b3d] dark:text-[#c5a059]">{snippet.title}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-[#c5a059]/10 text-[#c5a059] rounded-full font-bold uppercase tracking-widest">{snippet.language}</span>
                          </div>
                          <button 
                            onClick={() => deleteSnippet(snippet.id)}
                            className="p-1.5 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                            title="حذف من المكتبة"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <CodeBlock language={snippet.language} value={snippet.code} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-8 pt-4 border-t border-[#8b6b3d]/10 dark:border-white/10 text-center">
                <p className="text-xs opacity-60">كل أكوادك المهمة في مكان واحد يا باشا!</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* News Modal */}
      <AnimatePresence>
        {isNewsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNewsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl glass-panel p-8 rounded-[2.5rem] ios-shadow overflow-hidden flex flex-col max-h-[85vh] border border-[#c5a059]/20"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#c5a059]/10 rounded-xl">
                    <Newspaper size={20} className="text-[#c5a059]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#8b6b3d] dark:text-[#c5a059]">أخبار مصر اليوم</h3>
                </div>
                <button 
                  onClick={() => setIsNewsOpen(false)}
                  className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors text-[#2c2c2c] dark:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                {isNewsLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 border-4 border-[#c5a059]/30 border-t-[#c5a059] rounded-full animate-spin mb-4" />
                    <p className="text-lg font-bold">بجيبلك آخر الأخبار يا باشا...</p>
                    <p className="text-sm opacity-60">ثواني وهتكون عندك.</p>
                  </div>
                ) : news.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center opacity-40">
                    <Search size={48} className="mb-4" />
                    <p className="text-lg font-bold">مفيش أخبار جديدة دلوقتي!</p>
                    <p className="text-sm">جرب تاني كمان شوية.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {news.map((item, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="p-5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#8b6b3d]/10 dark:border-white/10 hover:border-[#c5a059]/30 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] px-2 py-0.5 bg-[#c5a059]/10 text-[#c5a059] rounded-full font-bold uppercase tracking-widest">{item.category}</span>
                          {item.source && <span className="text-[10px] opacity-60 font-bold">{item.source}</span>}
                        </div>
                        <h4 className="text-lg font-bold text-[#8b6b3d] dark:text-[#c5a059] mb-2 group-hover:text-[#c5a059] transition-colors">{item.title}</h4>
                        <p className="text-sm opacity-80 leading-relaxed mb-4">{item.summary}</p>
                        {item.url && (
                          <a 
                            href={item.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-xs font-bold text-[#c5a059] hover:underline"
                          >
                            <span>اقرأ المزيد</span>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-8 pt-4 border-t border-[#8b6b3d]/10 dark:border-white/10 text-center">
                <p className="text-xs opacity-60 italic">الأخبار دي جاية من بحث جوجل المباشر يا باشا!</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 min-w-[300px]",
              toast.type === 'error' ? "bg-red-500/90 text-white border-red-400/50" : "bg-emerald-500/90 text-white border-emerald-400/50"
            )}
          >
            <div className="p-1.5 bg-white/20 rounded-full">
              {toast.type === 'error' ? <X size={16} /> : <Sparkles size={16} />}
            </div>
            <p className="text-sm font-bold">{toast.message}</p>
            <button 
              onClick={() => setToast(null)}
              className="mr-auto p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

        {/* Input Area */}
        <div className="p-4 md:p-6 lg:p-8 backdrop-blur-2xl">
          <div className="max-w-4xl mx-auto relative">
            <AnimatePresence>
              {attachedImage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute bottom-full mb-4 right-0 p-2 glass-card rounded-2xl flex items-center gap-3"
                >
                  <img src={attachedImage} className="w-16 h-16 object-cover rounded-xl border border-white/20" />
                  <button 
                    onClick={() => setAttachedImage(null)}
                    className="p-1.5 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500/20 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-1 md:gap-2 items-end glass-card rounded-[2rem] p-2 shadow-2xl focus-within:ring-2 ring-[#c5a059]/30 transition-all">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!user}
                className="p-2 md:p-3 text-[#8b6b3d] dark:text-[#c5a059] hover:bg-[#c5a059]/10 rounded-2xl transition-all disabled:opacity-20"
                title="إرفاق صورة"
              >
                <Paperclip size={20} />
              </button>

              <button
                onClick={toggleListening}
                disabled={!user}
                className={cn(
                  "p-2 md:p-3 rounded-2xl transition-all flex-shrink-0 mb-0.5 md:mb-0",
                  !user ? "opacity-20 cursor-not-allowed" : (
                  isListening 
                    ? "bg-red-500 text-white animate-pulse" 
                    : "text-[#8b6b3d] dark:text-[#c5a059] hover:bg-[#8b6b3d]/5 dark:hover:bg-white/5"
                  )
                )}
                title={isListening ? "إيقاف التسجيل" : "تحدث الآن"}
              >
                {isListening ? <MicOff size={18} className="md:hidden" /> : <Mic size={18} className="md:hidden" />}
                {isListening ? <MicOff size={20} className="hidden md:block" /> : <Mic size={20} className="hidden md:block" />}
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={!user}
                placeholder={user ? "اسألني عن أي حاجة يا بطل..." : "سجل دخولك عشان تبدأ الدردشة..."}
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2.5 md:py-3.5 px-2 md:px-4 text-[#2c2c2c] dark:text-[#fdfaf6] text-base leading-relaxed min-h-[44px] md:min-h-[52px] disabled:opacity-50"
                rows={1}
              />
              <div className="flex gap-1 mb-0.5 md:mb-0">
                <button
                  onClick={() => handleSend(true)}
                  disabled={!input.trim() || isLoading || !user}
                  className={cn(
                    "p-2 md:p-3 rounded-xl transition-all flex-shrink-0",
                    input.trim() && !isLoading && user
                      ? "text-[#c5a059] hover:bg-[#c5a059]/10" 
                      : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  )}
                  title="تخيل صورة"
                >
                  <ImageIcon size={18} className="md:hidden" />
                  <ImageIcon size={20} className="hidden md:block" />
                </button>
                <button
                  onClick={() => handleSend(false)}
                  disabled={(!input.trim() && !attachedImage) || isLoading || !user}
                  className={cn(
                    "p-2 md:p-3 rounded-xl transition-all flex-shrink-0",
                    (input.trim() || attachedImage) && !isLoading && user
                      ? "bg-[#c5a059] text-white shadow-md hover:scale-105 active:scale-95" 
                      : "bg-gray-100 dark:bg-[#3d3d3d] text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  )}
                >
                  <Send size={18} className="rotate-180 md:hidden" />
                  <Send size={20} className="rotate-180 hidden md:block" />
                </button>
              </div>
            </div>
            <p className="text-[9px] md:text-[10px] text-center mt-2 md:mt-3 text-[#8b6b3d]/60">
              مصري ذكي ممكن يغلط، اتأكد من المعلومات المهمة بنفسك.
            </p>
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </main>
    </div>
  );
}
