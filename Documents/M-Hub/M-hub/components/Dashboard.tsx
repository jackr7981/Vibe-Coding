import React, { useState, useRef, useEffect } from 'react';
import { User, ChatMessage, MarinerDocument, DocumentCategory, SeaServiceRecord } from '../types';
import { User as UserIcon, LogOut, Send, Bot, Menu, Ship, FileText, Anchor, Edit, Building2, Briefcase, Stethoscope, WifiOff, CheckCircle, X, Palmtree, Users } from 'lucide-react';
import { getGeminiResponse } from '../services/geminiService';
import { Documents } from './Documents';
import { SeaService } from './SeaService';
import { ManningAgents } from './ManningAgents';
import { JobBoard } from './JobBoard';
import { MedicalCenters } from './MedicalCenters';
import { Community } from './Community';
import { supabase, getStorageUrl, isMockMode } from '../services/supabase';

interface DashboardProps {
  user: User;
  onLogout: () => void;
  onEditProfile: () => void;
  onUpdateSeaService: (records: SeaServiceRecord[]) => void;
  onToggleJobStatus: (status: boolean) => void;
  onToggleOnboardStatus: (status: boolean) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, onEditProfile, onUpdateSeaService, onToggleJobStatus, onToggleOnboardStatus }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'chat' | 'documents' | 'seaservice' | 'agents' | 'jobs' | 'medical' | 'community'>('home');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Welcome aboard, ${user.profile?.rank} ${user.profile?.lastName}! I am Sea Mate, your personal AI assistant. How can I assist you today?`,
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Status Confirmations
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [showOnboardConfirm, setShowOnboardConfirm] = useState(false);

  // Document management
  const [documents, setDocuments] = useState<MarinerDocument[]>([]);

  const navItems = [
    { id: 'home', label: 'Home', icon: UserIcon },
    { id: 'community', label: 'Forum', icon: Users },
    { id: 'seaservice', label: 'Service', icon: Ship },
    { id: 'jobs', label: 'Jobs', icon: Briefcase },
    { id: 'documents', label: 'Docs', icon: FileText },
    { id: 'agents', label: 'Agents', icon: Building2 },
    { id: 'medical', label: 'Medical', icon: Stethoscope },
    { id: 'chat', label: 'Chat', icon: Bot },
  ];

  useEffect(() => {
    // Listener for offline status
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [user]);

  const fetchDocuments = async () => {
    if (isMockMode) {
        // Sample Documents for Demo
        setDocuments([
            {
                id: '1',
                title: 'Continuous Discharge Certificate (CDC)',
                expiryDate: '2028-05-12',
                documentNumber: 'C/O/88219',
                fileUrl: 'https://images.unsplash.com/photo-1544531586-fde5298cdd40?auto=format&fit=crop&q=80&w=600',
                uploadDate: Date.now(),
                category: DocumentCategory.PERSONAL_ID
            },
            {
                id: '2',
                title: 'Certificate of Competency (COC)',
                expiryDate: '2025-11-01',
                documentNumber: 'COC-DK-221',
                fileUrl: 'https://images.unsplash.com/photo-1628155930542-3c7a64e2c833?auto=format&fit=crop&q=80&w=600',
                uploadDate: Date.now() - 10000000,
                category: DocumentCategory.LICENSE
            },
            {
                id: '3',
                title: 'Yellow Fever Vaccination',
                expiryDate: '2024-03-10', // Expiring soon example
                documentNumber: 'YF-9921',
                fileUrl: '', // Will show icon
                uploadDate: Date.now() - 20000000,
                category: DocumentCategory.MEDICAL
            }
        ]);
        return;
    }

    // Try LocalStorage first (Offline Strategy)
    if (user.profile && user.email) {
        const cachedDocs = localStorage.getItem(`bd_mariner_docs_${user.email}`);
        if (cachedDocs) {
            try {
                setDocuments(JSON.parse(cachedDocs));
            } catch (e) {
                console.error("Failed to load cached docs");
            }
        }
    }

    if (!navigator.onLine) return; // Don't try fetch if offline

    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('expiry_date', { ascending: true });

      if (error) throw error;

      if (data) {
        // Map DB fields (snake_case) to Frontend fields (camelCase)
        // and transform paths to URLs
        const mappedDocs: MarinerDocument[] = data.map(doc => ({
          id: doc.id,
          title: doc.title,
          expiryDate: doc.expiry_date || 'N/A',
          documentNumber: doc.document_number,
          // Generate full URL from the stored path
          fileUrl: getStorageUrl('documents', doc.file_path),
          // Handle multi-page arrays
          pages: doc.page_paths ? doc.page_paths.map((p: string) => getStorageUrl('documents', p)) : undefined,
          uploadDate: new Date(doc.created_at).getTime(),
          category: doc.category as DocumentCategory
        }));
        setDocuments(mappedDocs);
        
        // Cache for offline use
        if (user.email) {
            localStorage.setItem(`bd_mariner_docs_${user.email}`, JSON.stringify(mappedDocs));
        }
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom();
    }
  }, [messages, activeTab]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    if (isOffline) {
        const errorMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'model',
            text: "I am currently offline. Please connect to the internet to chat.",
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, errorMsg]);
        return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Prepare history for API
    const history = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    const responseText = await getGeminiResponse(userMsg.text, history);

    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, botMsg]);
    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleAddDocument = (doc: MarinerDocument) => {
    if (isMockMode) {
        setDocuments(prev => [...prev, doc]);
    } else {
        // Just refetch from server to ensure sync
        fetchDocuments();
    }
  };

  const handleUpdateDocument = (updatedDoc: MarinerDocument) => {
    if (isMockMode) {
        setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
    } else {
        fetchDocuments();
    }
  };

  const handleDeleteDocument = (id: string) => {
     // Optimistic update
     setDocuments(prev => prev.filter(d => d.id !== id));
     // Documents component handles actual DB deletion in real mode
     // Also update cache if possible for consistent UI
     const updated = documents.filter(d => d.id !== id);
     if (user.email) {
        localStorage.setItem(`bd_mariner_docs_${user.email}`, JSON.stringify(updated));
     }
  };

  const confirmJobStatusToggle = () => {
      onToggleJobStatus(!user.profile?.isOpenForWork);
      setShowStatusConfirm(false);
  };

  const confirmOnboardStatusToggle = () => {
      onToggleOnboardStatus(!user.profile?.isOnboard);
      setShowOnboardConfirm(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-blue-900 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center gap-4">
          <div className="flex items-center space-x-2 flex-shrink-0 cursor-pointer" onClick={() => setActiveTab('home')}>
            <Anchor className="w-6 h-6 text-sky-400" />
            <span className="font-bold text-lg hidden lg:block">BD Mariner Hub</span>
          </div>

          {/* Desktop/Tablet Navigation */}
          <nav className="hidden sm:flex items-center space-x-1 md:space-x-2 bg-blue-800/40 p-1 rounded-xl overflow-x-auto">
             {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 whitespace-nowrap ${
                    activeTab === item.id 
                      ? 'bg-sky-500 text-white shadow-md' 
                      : 'text-blue-100 hover:bg-blue-700 hover:text-white'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </button>
             ))}
          </nav>

          <div className="flex items-center space-x-4 flex-shrink-0">
            <div className="flex items-center space-x-2 bg-blue-800 rounded-full px-3 py-1 cursor-pointer hover:bg-blue-700 transition-colors" onClick={onEditProfile} title="Edit Profile">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden border-2 ${user.profile?.isOpenForWork ? 'border-green-400' : 'border-white'}`}>
                {user.profile?.profilePicture ? (
                  <img src={user.profile.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-sm text-white">{user.profile?.firstName.charAt(0)}</span>
                )}
              </div>
              <span className="text-sm font-medium hidden lg:block">
                {user.profile?.rank} {user.profile?.lastName}
              </span>
            </div>
            <button onClick={onLogout} className="p-2 hover:bg-blue-800 rounded-full transition-colors" title="Logout">
              <LogOut className="w-5 h-5 text-red-200" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 container mx-auto p-4 pb-24 sm:pb-8">
        {activeTab === 'home' && (
          <div className="space-y-6 animate-fade-in">
            {/* ID Card Style Widget */}
            <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-slate-200 relative">
              <div className="h-24 bg-gradient-to-r from-blue-600 to-sky-500"></div>
              <div className="px-6 relative pb-6">
                {/* Profile Picture - Moved to Right */}
                <div className="absolute -top-12 right-6">
                  <div className={`w-24 h-24 rounded-2xl bg-white p-1 shadow-lg relative ${user.profile?.isOpenForWork ? 'ring-4 ring-green-400' : ''}`}>
                    {user.profile?.profilePicture ? (
                      <img src={user.profile.profilePicture} alt="Profile" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <div className="w-full h-full bg-slate-200 rounded-xl flex items-center justify-center">
                        <UserIcon className="w-10 h-10 text-slate-400" />
                      </div>
                    )}
                    {user.profile?.isOpenForWork && (
                        <div className="absolute -bottom-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-white shadow-sm">
                            HIRE ME
                        </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 pr-28 space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-slate-800 leading-tight">{user.profile?.firstName} {user.profile?.lastName}</h2>
                    <button 
                      onClick={onEditProfile}
                      disabled={isOffline}
                      className={`p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors ${isOffline ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={isOffline ? "Editing disabled offline" : "Edit Profile"}
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-blue-600 font-semibold">{user.profile?.rank}</p>
                  <p className="text-slate-500 text-sm flex items-center">
                    <Ship className="w-4 h-4 mr-1" /> {user.profile?.department} Department
                  </p>
                </div>
                
                <div className="pt-4 grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-xs text-slate-400 uppercase font-semibold">CDC Number</p>
                    <p className="text-slate-700 font-mono">{user.profile?.cdcNumber}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-xs text-slate-400 uppercase font-semibold">Date of Birth</p>
                    <p className="text-slate-700">{user.profile?.dateOfBirth}</p>
                  </div>
                </div>

                {/* Status Toggles Grid */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <button 
                        onClick={() => !isOffline && setShowStatusConfirm(true)}
                        disabled={isOffline}
                        className={`py-3 px-2 rounded-xl flex flex-col items-center justify-center font-bold text-xs sm:text-sm transition-all shadow-sm active:scale-[0.98] border ${
                            user.profile?.isOpenForWork 
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' 
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                        }`}
                    >
                        {user.profile?.isOpenForWork ? (
                            <>
                                <CheckCircle className="w-5 h-5 mb-1 text-green-600" />
                                <span>Ready to Sail</span>
                            </>
                        ) : (
                            <>
                                <Anchor className="w-5 h-5 mb-1 opacity-50" />
                                <span>Not Looking</span>
                            </>
                        )}
                    </button>

                    <button 
                        onClick={() => !isOffline && setShowOnboardConfirm(true)}
                        disabled={isOffline}
                        className={`py-3 px-2 rounded-xl flex flex-col items-center justify-center font-bold text-xs sm:text-sm transition-all shadow-sm active:scale-[0.98] border ${
                            user.profile?.isOnboard 
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' 
                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        }`}
                    >
                        {user.profile?.isOnboard ? (
                            <>
                                <Ship className="w-5 h-5 mb-1 text-blue-600" />
                                <span>Status: Onboard</span>
                            </>
                        ) : (
                            <>
                                <Palmtree className="w-5 h-5 mb-1 text-amber-600" />
                                <span>Status: At Home</span>
                            </>
                        )}
                    </button>
                </div>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              <button 
                onClick={() => !isOffline && setActiveTab('chat')}
                className={`col-span-1 p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-md text-white flex flex-col items-center justify-center space-y-2 hover:shadow-lg transition-all active:scale-95 ${isOffline ? 'opacity-50 grayscale' : ''}`}
                disabled={isOffline}
              >
                {isOffline ? <WifiOff className="w-7 h-7" /> : <Bot className="w-7 h-7" />}
                <span className="font-medium text-xs">{isOffline ? 'Offline' : 'AI Chat'}</span>
              </button>
              <button
                onClick={() => setActiveTab('community')}
                className="col-span-1 p-4 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center space-y-2 hover:border-purple-300 hover:shadow-md transition-all active:scale-95"
              >
                <Users className="w-7 h-7 text-purple-600" />
                <span className="font-medium text-slate-700 text-xs">Forum</span>
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center space-y-2 hover:border-blue-300 hover:shadow-md transition-all active:scale-95"
              >
                <FileText className="w-7 h-7 text-blue-500" />
                <span className="font-medium text-slate-700 text-xs">Docs</span>
              </button>
              <button
                onClick={() => setActiveTab('seaservice')}
                className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center space-y-2 hover:border-blue-300 hover:shadow-md transition-all active:scale-95"
              >
                <Ship className="w-7 h-7 text-sky-500" />
                <span className="font-medium text-slate-700 text-xs">Service</span>
              </button>
              <button
                onClick={() => setActiveTab('jobs')}
                className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center space-y-2 hover:border-blue-300 hover:shadow-md transition-all active:scale-95"
              >
                <Briefcase className="w-7 h-7 text-emerald-600" />
                <span className="font-medium text-slate-700 text-xs">Jobs</span>
              </button>
              <button
                onClick={() => setActiveTab('agents')}
                className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center space-y-2 hover:border-blue-300 hover:shadow-md transition-all active:scale-95"
              >
                <Building2 className="w-7 h-7 text-orange-500" />
                <span className="font-medium text-slate-700 text-xs">Agents</span>
              </button>
              <button
                onClick={() => setActiveTab('medical')}
                className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center space-y-2 hover:border-rose-300 hover:shadow-md transition-all active:scale-95 sm:hidden"
              >
                <Stethoscope className="w-7 h-7 text-rose-500" />
                <span className="font-medium text-slate-700 text-xs">Med</span>
              </button>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h3 className="text-blue-900 font-bold text-lg mb-2">Notice Board</h3>
              <p className="text-blue-800 text-sm">Welcome to the beta version of BD Mariner Hub. Ensure your sea service records are up to date for accurate calculation.</p>
            </div>
          </div>
        )}

        {activeTab === 'community' && (
            <Community user={user} />
        )}

        {activeTab === 'documents' && (
          <>
             {isOffline && (
                 <div className="mb-4 bg-orange-100 border border-orange-200 text-orange-800 px-4 py-2 rounded-lg text-sm flex items-center">
                     <WifiOff className="w-4 h-4 mr-2" />
                     Viewing cached documents. Adding or editing is disabled offline.
                 </div>
             )}
             <div className={isOffline ? 'pointer-events-none opacity-80' : ''}>
             </div>
             <Documents 
                documents={documents} 
                onAddDocument={isOffline ? () => alert("Offline") : handleAddDocument}
                onUpdateDocument={isOffline ? () => alert("Offline") : handleUpdateDocument}
                onDeleteDocument={isOffline ? () => alert("Offline") : handleDeleteDocument}
                userName={user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : undefined}
             />
          </>
        )}

        {activeTab === 'seaservice' && (
           <SeaService 
              records={user.profile?.seaServiceHistory || []}
              onUpdate={onUpdateSeaService}
           />
        )}

        {activeTab === 'agents' && (
            <ManningAgents userProfile={user.profile} />
        )}

        {activeTab === 'jobs' && (
            <JobBoard userProfile={user.profile} />
        )}

        {activeTab === 'medical' && (
            <MedicalCenters />
        )}

        {activeTab === 'chat' && (
          <div className="h-[calc(100vh-140px)] flex flex-col bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center">
               <div className="flex items-center space-x-2">
                 <div className="p-1.5 bg-indigo-100 rounded-lg">
                   <Bot className="w-5 h-5 text-indigo-600" />
                 </div>
                 <div>
                   <h3 className="font-bold text-slate-700">Sea Mate AI</h3>
                   <p className="text-xs text-slate-500">Powered by Gemini 3 Flash</p>
                 </div>
               </div>
               <button onClick={() => setMessages([])} className="text-xs text-slate-400 hover:text-red-500">Clear</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-white text-slate-700 border border-slate-200 rounded-tl-none'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    <span className={`text-[10px] mt-1 block opacity-70 ${msg.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 bg-white border-t border-slate-200">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={isOffline ? "You are offline..." : "Ask about regulations, career, or shipping..."}
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50"
                  disabled={isLoading || isOffline}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isLoading || !input.trim() || isOffline}
                  className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation for Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-2 px-4 flex justify-around items-center sm:hidden z-40 pb-safe">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center space-y-1 w-14 ${activeTab === 'home' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <UserIcon className="w-6 h-6" />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        <button 
          onClick={() => setActiveTab('community')}
          className={`flex flex-col items-center space-y-1 w-14 ${activeTab === 'community' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <Users className="w-6 h-6" />
          <span className="text-[10px] font-medium">Forum</span>
        </button>
        <button 
          onClick={() => setActiveTab('seaservice')}
          className={`flex flex-col items-center space-y-1 w-14 ${activeTab === 'seaservice' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <Ship className="w-6 h-6" />
          <span className="text-[10px] font-medium">Service</span>
        </button>
        <button 
          onClick={() => setActiveTab('jobs')}
          className={`flex flex-col items-center space-y-1 w-14 ${activeTab === 'jobs' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <Briefcase className="w-6 h-6" />
          <span className="text-[10px] font-medium">Jobs</span>
        </button>
        <button 
          onClick={() => setActiveTab('agents')}
          className={`flex flex-col items-center space-y-1 w-14 ${activeTab === 'agents' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <Building2 className="w-6 h-6" />
          <span className="text-[10px] font-medium">Agents</span>
        </button>
      </nav>

      {/* Confirmation Modal for Job Status */}
      {showStatusConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowStatusConfirm(false)}></div>
            <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95">
                <div className="flex flex-col items-center text-center">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${user.profile?.isOpenForWork ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-600'}`}>
                        <Anchor className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">
                        {user.profile?.isOpenForWork ? 'Close Availability?' : 'Mark as Ready to Sail?'}
                    </h3>
                    <p className="text-slate-500 text-sm mb-6 px-2">
                        {user.profile?.isOpenForWork 
                            ? "Recruiters will no longer see you in the 'Immediately Available' list." 
                            : "This will signal recruiters that you are available for a new contract immediately."}
                    </p>
                    <div className="flex gap-3 w-full">
                        <button onClick={() => setShowStatusConfirm(false)} className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
                        <button 
                            onClick={confirmJobStatusToggle} 
                            className={`flex-1 py-3 px-4 rounded-xl text-white font-semibold shadow-md transition-all active:scale-95 ${user.profile?.isOpenForWork ? 'bg-slate-600 hover:bg-slate-700' : 'bg-green-600 hover:bg-green-700'}`}
                        >
                            {user.profile?.isOpenForWork ? 'Close Status' : 'Confirm Ready'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Confirmation Modal for Onboard Status */}
      {showOnboardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowOnboardConfirm(false)}></div>
            <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95">
                <div className="flex flex-col items-center text-center">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${user.profile?.isOnboard ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                        {user.profile?.isOnboard ? <Palmtree className="w-8 h-8" /> : <Ship className="w-8 h-8" />}
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">
                        {user.profile?.isOnboard ? 'Mark as Signed Off?' : 'Mark as Onboard?'}
                    </h3>
                    <p className="text-slate-500 text-sm mb-6 px-2">
                        {user.profile?.isOnboard 
                            ? "Welcome back home! This will update your status to 'At Home' and you may appear in search results." 
                            : "Fair winds! Setting status to 'At Sea' indicates you are currently sailing and unavailable."}
                    </p>
                    <div className="flex gap-3 w-full">
                        <button onClick={() => setShowOnboardConfirm(false)} className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
                        <button 
                            onClick={confirmOnboardStatusToggle} 
                            className={`flex-1 py-3 px-4 rounded-xl text-white font-semibold shadow-md transition-all active:scale-95 ${user.profile?.isOnboard ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {user.profile?.isOnboard ? 'Confirm Sign Off' : 'Confirm Sign On'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};