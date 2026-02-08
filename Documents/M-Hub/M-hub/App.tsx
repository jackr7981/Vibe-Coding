import React, { useState, useEffect } from 'react';
import { AppView, Department, Rank, User, UserProfile, SeaServiceRecord, ShipType } from './types';
import { Logo } from './components/Logo';
import { Dashboard } from './components/Dashboard';
import { AdminDashboard } from './components/AdminDashboard'; // Import Admin Dashboard
import { ArrowRight, Mail, Lock, Upload, Calendar, Phone, CheckCircle, User as UserIcon, Loader2, Search, Globe, RefreshCw, ShieldCheck, X, AlertTriangle, WifiOff, Ship } from 'lucide-react';
import { supabase, getStorageUrl, isMockMode } from './services/supabase';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.LANDING);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Auth States
  const [email, setEmail] = useState('test@test.com');
  const [password, setPassword] = useState('12345678');
  
  // Profile States
  const [profileData, setProfileData] = useState<Partial<UserProfile>>({
    department: '',
    rank: '',
    preferredShipType: '',
  });
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
  const [profilePicPreview, setProfilePicPreview] = useState<string | null>(null);

  // DOS Import States
  const [showDosModal, setShowDosModal] = useState(false);
  const [dosLoading, setDosLoading] = useState(false);
  const [dosCaptcha, setDosCaptcha] = useState('');
  const [dosError, setDosError] = useState<string | null>(null);
  const [dosStep, setDosStep] = useState<'captcha' | 'fetching' | 'success'>('captcha');

  useEffect(() => {
    // Network Status Listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check active session
    const checkSession = async () => {
      if (isMockMode) {
        // Mock Session Check using LocalStorage
        const storedSession = localStorage.getItem('bd_mariner_demo_session');
        const storedAdmin = localStorage.getItem('bd_mariner_admin_session');
        
        if (storedAdmin) {
            setCurrentView(AppView.ADMIN_DASHBOARD);
            setAuthChecking(false);
            return;
        }

        if (storedSession) {
          try {
             const user = JSON.parse(storedSession);
             setCurrentUser(user);
             setCurrentView(AppView.DASHBOARD);
          } catch(e) {
             console.error("Failed to parse mock session");
          }
        }
        setAuthChecking(false);
        return;
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session?.user) {
          // Attempt to load from offline cache first to speed up UI
          const cachedProfile = localStorage.getItem(`bd_mariner_profile_${session.user.id}`);
          if (cachedProfile) {
              const parsedUser = JSON.parse(cachedProfile);
              setCurrentUser(parsedUser);
              setCurrentView(AppView.DASHBOARD);
              // Don't stop checking, we still want fresh data if online
          }

          if (navigator.onLine) {
             await fetchUserProfile(session.user.id, session.user.email!);
          } else if (!cachedProfile) {
             // If offline and no cache, stop
             setAuthChecking(false);
          } else {
             // If offline but had cache, we are good
             setAuthChecking(false);
          }
        } else {
          setAuthChecking(false);
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        setAuthChecking(false);
      }
    };

    checkSession();

    if (!isMockMode) {
        const {
        data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
            fetchUserProfile(session.user.id, session.user.email!); 
        } else {
            setCurrentUser(null);
            setCurrentView(AppView.LANDING);
            setAuthChecking(false);
        }
        });
        return () => {
            subscription.unsubscribe();
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }
    
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchUserProfile = async (userId: string, email: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
      }

      const user: User = {
        id: userId,
        email: email,
        isVerified: true, // Supabase handles verification
      };

      if (data) {
        user.profile = {
          firstName: data.first_name,
          lastName: data.last_name,
          department: data.department as Department,
          rank: data.rank,
          cdcNumber: data.cdc_number,
          mobileNumber: data.mobile_number,
          dateOfBirth: data.date_of_birth,
          profilePicture: data.profile_picture_url ? getStorageUrl('avatars', data.profile_picture_url) : null,
          seaServiceHistory: data.sea_service_history || [],
          preferredShipType: data.preferred_ship_type || '',
          isOpenForWork: data.is_open_for_work || false,
          isOnboard: data.is_onboard || false,
        };
        
        // Update State
        setCurrentUser(user);
        
        // Update Cache
        localStorage.setItem(`bd_mariner_profile_${userId}`, JSON.stringify(user));
        
        setCurrentView(AppView.DASHBOARD);
      } else {
        // No profile in DB yet
        setCurrentUser(user);
        setCurrentView(AppView.PROFILE_SETUP);
      }
    } catch (error) {
      console.error('Profile fetch error:', error);
    } finally {
      setAuthChecking(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline) { alert("You are offline. Please connect to the internet to register."); return; }
    setLoading(true);

    if (isMockMode) {
       // Mock Register Flow
       setTimeout(() => {
          const mockUser: User = {
            id: 'mock-user-id',
            email: email,
            isVerified: true,
          };
          setCurrentUser(mockUser);
          // Directly go to profile setup in mock mode
          setCurrentView(AppView.PROFILE_SETUP);
          setLoading(false);
          alert("Mock Account Created! Proceeding to Profile Setup.");
       }, 800);
       return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      if (data.session) {
         // Do nothing, listener handles it
      } else if (data.user) {
         alert('Check your email for the verification link!');
         setCurrentView(AppView.VERIFY_EMAIL);
      }
    }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline && !isMockMode) { alert("You are offline. Please connect to the internet to login."); return; }
    setLoading(true);

    // Hardcoded Admin Check
    if (email === 'admin@bdmarinerhub.com' && password === 'admin123') {
        setTimeout(() => {
            if (isMockMode) localStorage.setItem('bd_mariner_admin_session', 'true');
            setCurrentView(AppView.ADMIN_DASHBOARD);
            setLoading(false);
        }, 1000);
        return;
    }

    if (isMockMode) {
      // Mock Login Flow
      setTimeout(() => {
        // Create a fake populated profile for the demo
        const mockUser: User = {
          id: 'mock-user-id',
          email: email,
          isVerified: true,
          profile: {
            firstName: 'Tanvir',
            lastName: 'Ahmed',
            department: Department.DECK,
            rank: Rank.CHIEF_OFFICER,
            cdcNumber: 'C/O/12345',
            mobileNumber: '+8801700000000',
            dateOfBirth: '1990-01-01',
            profilePicture: null,
            seaServiceHistory: [],
            preferredShipType: ShipType.BULK_CARRIER,
            isOpenForWork: false,
            isOnboard: false
          }
        };
        
        localStorage.setItem('bd_mariner_demo_session', JSON.stringify(mockUser));
        setCurrentUser(mockUser);
        setCurrentView(AppView.DASHBOARD);
        setLoading(false);
      }, 800);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    }
    setLoading(false);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline && !isMockMode) { alert("Cannot update profile while offline."); return; }
    setLoading(true);
    
    if (isMockMode) {
        setTimeout(() => {
            const updatedUser: User = {
                id: currentUser?.id || 'mock-user-id',
                email: currentUser?.email || email,
                isVerified: true,
                profile: {
                    firstName: profileData.firstName || 'User',
                    lastName: profileData.lastName || '',
                    department: (profileData.department as Department) || Department.DECK,
                    rank: (profileData.rank as Rank) || Rank.DECK_CADET,
                    cdcNumber: profileData.cdcNumber || '',
                    mobileNumber: profileData.mobileNumber || '',
                    dateOfBirth: profileData.dateOfBirth || '',
                    profilePicture: profilePicPreview || currentUser?.profile?.profilePicture || null,
                    seaServiceHistory: profileData.seaServiceHistory || [],
                    preferredShipType: profileData.preferredShipType || '',
                    isOpenForWork: currentUser?.profile?.isOpenForWork || false,
                    isOnboard: currentUser?.profile?.isOnboard || false
                }
            };
            localStorage.setItem('bd_mariner_demo_session', JSON.stringify(updatedUser));
            setCurrentUser(updatedUser);
            setCurrentView(AppView.DASHBOARD);
            setLoading(false);
        }, 800);
        return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      let profilePicPath = null;
      if (profilePicFile) {
        const fileExt = profilePicFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, profilePicFile);

        if (uploadError) throw uploadError;
        profilePicPath = fileName;
      }

      const profilePayload = {
        id: user.id,
        first_name: profileData.firstName,
        last_name: profileData.lastName,
        department: profileData.department,
        rank: profileData.rank,
        cdc_number: profileData.cdcNumber,
        mobile_number: profileData.mobileNumber,
        date_of_birth: profileData.dateOfBirth,
        preferred_ship_type: profileData.preferredShipType,
        ...(profilePicPath && { profile_picture_url: profilePicPath })
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(profilePayload);

      if (error) throw error;

      await fetchUserProfile(user.id, user.email!);

    } catch (error: any) {
      console.error('Error updating profile:', error);
      alert('Error updating profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSeaService = async (records: SeaServiceRecord[]) => {
      if (!currentUser || !currentUser.profile) return;
      if (isOffline && !isMockMode) { alert("You are offline. Changes will not be saved."); return; }

      const updatedUser = { 
          ...currentUser, 
          profile: { 
              ...currentUser.profile, 
              seaServiceHistory: records 
          } 
      };
      
      // Optimistic update
      setCurrentUser(updatedUser);
      
      if (isMockMode) {
          localStorage.setItem('bd_mariner_demo_session', JSON.stringify(updatedUser));
      } else {
          try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                  // Update Cache
                  localStorage.setItem(`bd_mariner_profile_${user.id}`, JSON.stringify(updatedUser));
                  
                  // Update DB
                  await supabase.from('profiles').update({
                      sea_service_history: records
                  }).eq('id', user.id);
              }
          } catch (e) {
              console.error("Failed to save sea service", e);
              alert("Failed to save sea service. Check connection.");
          }
      }
  };

  const handleToggleJobStatus = async (newStatus: boolean) => {
    if (!currentUser || !currentUser.profile) return;
    if (isOffline && !isMockMode) { alert("You are offline. Cannot update status."); return; }

    const updatedUser = {
        ...currentUser,
        profile: { ...currentUser.profile, isOpenForWork: newStatus }
    };
    setCurrentUser(updatedUser);

    if (isMockMode) {
        localStorage.setItem('bd_mariner_demo_session', JSON.stringify(updatedUser));
    } else {
        try {
            // Optimistic update
            const { error } = await supabase.from('profiles').update({ is_open_for_work: newStatus }).eq('id', currentUser.id);
            if (error) {
                console.error(error);
                // Revert on error
                setCurrentUser(currentUser); 
                alert("Failed to update status.");
            } else {
                localStorage.setItem(`bd_mariner_profile_${currentUser.id}`, JSON.stringify(updatedUser));
            }
        } catch (e) {
            console.error("Update failed", e);
        }
    }
  };

  const handleToggleOnboardStatus = async (onboardStatus: boolean) => {
    if (!currentUser || !currentUser.profile) return;
    if (isOffline && !isMockMode) { alert("You are offline. Cannot update status."); return; }

    const updatedUser = {
        ...currentUser,
        profile: { ...currentUser.profile, isOnboard: onboardStatus }
    };
    setCurrentUser(updatedUser);

    if (isMockMode) {
        localStorage.setItem('bd_mariner_demo_session', JSON.stringify(updatedUser));
    } else {
        try {
            // Optimistic update
            const { error } = await supabase.from('profiles').update({ is_onboard: onboardStatus }).eq('id', currentUser.id);
            if (error) {
                console.error(error);
                setCurrentUser(currentUser); 
                alert("Failed to update onboard status.");
            } else {
                localStorage.setItem(`bd_mariner_profile_${currentUser.id}`, JSON.stringify(updatedUser));
            }
        } catch (e) {
            console.error("Update failed", e);
        }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfilePicFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicPreview(reader.result as string);
        setProfileData({ ...profileData, profilePicture: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  // DOS IMPORT LOGIC
  const openDosModal = () => {
    if (isOffline) {
        alert("DOS Import requires internet connection.");
        return;
    }
    if (!profileData.cdcNumber || !profileData.dateOfBirth) {
       alert("Please enter your CDC Number and Date of Birth first.");
       return;
    }
    setDosStep('captcha');
    setDosCaptcha('');
    setDosError(null);
    setShowDosModal(true);
  };

  const handleDosSubmit = async () => {
    setDosLoading(true);
    setDosError(null);

    // SIMULATE API CALL
    setTimeout(() => {
        // Validate Captcha (Mock)
        if (dosCaptcha.length !== 4) {
             setDosError("Invalid Captcha Code. Please try again.");
             setDosLoading(false);
             return;
        }

        setDosStep('fetching');

        // Simulate Data Fetching Delay
        setTimeout(() => {
             // MOCK DATA RESPONSE
             const mockData = {
                firstName: 'Mohammad',
                lastName: 'Rahim',
                rank: Rank.ABLE_SEAMAN,
                department: Department.DECK_RATINGS,
                profilePicture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?fit=crop&w=200&h=200',
                seaService: [
                    { id: '1', vesselName: 'MV BANGLA HOPE', rank: 'Ordinary Seaman', signOnDate: '2020-01-10', signOffDate: '2020-11-15', imoNumber: '9123456', shipType: ShipType.GENERAL_CARGO },
                    { id: '2', vesselName: 'MT MEGHNA PRIDE', rank: 'Able Seaman', signOnDate: '2021-03-05', signOffDate: '2021-12-20', imoNumber: '9567890', shipType: ShipType.OIL_TANKER },
                    { id: '3', vesselName: 'MV AKIJ PEARL', rank: 'Able Seaman', signOnDate: '2022-04-01', signOffDate: '2023-01-10', imoNumber: '9345678', shipType: ShipType.BULK_CARRIER },
                ]
             };

             setProfileData(prev => ({
                ...prev,
                firstName: mockData.firstName,
                lastName: mockData.lastName,
                rank: mockData.rank,
                department: mockData.department,
                profilePicture: mockData.profilePicture,
                seaServiceHistory: mockData.seaService
             }));
             setProfilePicPreview(mockData.profilePicture);

             setDosStep('success');
             setDosLoading(false);

             // Close modal after success
             setTimeout(() => {
                setShowDosModal(false);
             }, 2000);

        }, 2000);
    }, 1000);
  };

  const handleLogout = async () => {
    if (isMockMode) {
        localStorage.removeItem('bd_mariner_demo_session');
        localStorage.removeItem('bd_mariner_admin_session');
        setCurrentUser(null);
        setCurrentView(AppView.LANDING);
        // Clear login form
        setEmail('');
        setPassword('');
        return;
    }
    await supabase.auth.signOut();
  };

  const handleEditProfile = () => {
    if (currentUser?.profile) {
      setProfileData(currentUser.profile);
      setProfilePicPreview(currentUser.profile.profilePicture);
      setCurrentView(AppView.PROFILE_SETUP);
    }
  };

  // Helper to get ranks based on department
  const getRanksForDepartment = (dept: string): string[] => {
    switch (dept) {
      case Department.DECK:
        return [Rank.MASTER, Rank.CHIEF_OFFICER, Rank.SECOND_OFFICER, Rank.THIRD_OFFICER, Rank.FOURTH_OFFICER, Rank.DECK_CADET];
      case Department.ENGINE:
        return [Rank.CHIEF_ENGINEER, Rank.SECOND_ENGINEER, Rank.THIRD_ENGINEER, Rank.FOURTH_ENGINEER, Rank.FIFTH_ENGINEER, Rank.ENGINE_CADET];
      case Department.ELECTRICAL:
        return [Rank.ELECTRICAL_OFFICER];
      case Department.GALLEY:
        return [Rank.CHIEF_COOK, Rank.MESSMAN];
      case Department.DECK_RATINGS:
        return [Rank.BOSUN, Rank.ABLE_SEAMAN, Rank.ORDINARY_SEAMAN];
      case Department.ENGINE_RATINGS:
        return [Rank.FITTER, Rank.MOTORMAN, Rank.OILER, Rank.WIPER, Rank.WELDER];
      case Department.CREWING:
        return [Rank.CREW_MANAGER];
      case Department.AGENCY:
        return [Rank.AGENT];
      default:
        return [Rank.OTHER];
    }
  };

  // RENDER HELPERS
  const renderInput = (label: string, value: string, onChange: (val: string) => void, type = "text", placeholder = "", icon?: React.ReactNode, extraAction?: React.ReactNode) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
            {icon && <div className="absolute left-3 top-3 text-slate-400">{icon}</div>}
            <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            required
            className={`w-full ${icon ? 'pl-10' : 'pl-4'} pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all`}
            />
        </div>
        {extraAction}
      </div>
    </div>
  );

  const renderSelect = (label: string, value: string, onChange: (val: string) => void, options: string[]) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white transition-all"
          required
        >
          <option value="" disabled>Select {label}</option>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <div className="absolute right-3 top-3 pointer-events-none">
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>
    </div>
  );

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  // VIEWS
  if (currentView === AppView.LANDING) {
    return (
      <div className="min-h-screen bg-slate-900 relative overflow-hidden flex flex-col items-center justify-center p-6 text-center">
        {/* Background Decorative */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1548293777-62b166299971?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center opacity-30"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-slate-900/60"></div>

        <div className="relative z-10 max-w-md w-full animate-fade-in-up">
          <Logo size="lg" color="white" />
          <p className="mt-4 text-slate-300 text-lg">Your professional companion for a seamless maritime career.</p>
          
          <div className="mt-10 space-y-4">
            <button 
              onClick={() => setCurrentView(AppView.LOGIN)}
              className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-lg transition-transform active:scale-95 shadow-lg shadow-blue-900/50"
            >
              Sign In
            </button>
            <button 
              onClick={() => setCurrentView(AppView.REGISTER)}
              className="w-full py-3.5 px-6 bg-slate-800/80 hover:bg-slate-800 text-white border border-slate-700 rounded-xl font-semibold text-lg backdrop-blur-sm transition-transform active:scale-95"
            >
              Create Account
            </button>
          </div>
          
          <div className="mt-12 flex flex-col items-center gap-3">
             <div className="px-4 py-1.5 rounded-full border border-slate-700 bg-slate-800/50 backdrop-blur-sm">
                <span className="text-xs text-slate-400 font-medium tracking-wide">Designed for Bangladeshi Mariners 🇧🇩</span>
             </div>
             <p className="text-blue-200 font-medium text-sm tracking-wide">Built by a Mariner for Mariners</p>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === AppView.LOGIN || currentView === AppView.REGISTER) {
    const isLogin = currentView === AppView.LOGIN;
    return (
      <div className="min-h-screen flex flex-col justify-center py-12 px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <Logo size="md" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          {isMockMode && (
             <p className="text-xs text-center text-amber-600 bg-amber-50 p-2 rounded mt-2 border border-amber-200">
                ⚠️ Simulation Mode: Login with any details.
             </p>
          )}
          {isOffline && (
             <p className="text-xs text-center text-red-600 bg-red-50 p-2 rounded mt-2 border border-red-200 flex items-center justify-center">
                <WifiOff className="w-3 h-3 mr-1"/> Offline: Please check your internet.
             </p>
          )}
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-slate-100">
            <form className="space-y-6" onSubmit={isLogin ? handleLogin : handleRegister}>
              {renderInput("Email Address", email, setEmail, "email", "captain@example.com", <Mail className="w-5 h-5"/>)}
              {renderInput("Password", password, setPassword, "password", "••••••••", <Lock className="w-5 h-5"/>)}

              <div>
                <button
                  type="submit"
                  disabled={loading || (isOffline && !isMockMode)}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    isLogin ? 'Sign In' : 'Sign Up'
                  )}
                </button>
              </div>
            </form>
            {/* ... rest of auth form ... */}
             <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">Or continue with</span>
                </div>
              </div>

              <div className="mt-6">
                <button onClick={() => alert("Google Login needs Supabase configured!")} className="w-full flex items-center justify-center px-4 py-3 border border-slate-300 rounded-xl shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                   <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.17c-.22-.66-.35-1.36-.35-2.17s.13-1.51.35-2.17V7.01H2.18C.79 9.78 0 12.89 0 16c0 3.11.79 6.22 2.18 8.99l3.66-2.82z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.01l3.66 2.82c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                   Google
                </button>
              </div>
            </div>
            
            <div className="mt-6 text-center">
              <button 
                onClick={() => setCurrentView(isLogin ? AppView.REGISTER : AppView.LOGIN)}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ... (Verify Email View) ...
  if (currentView === AppView.VERIFY_EMAIL) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center border border-slate-100">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
            <Mail className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">Verify your email</h3>
          <p className="text-slate-500 mb-8">
            We've sent a verification link to <span className="font-semibold text-slate-800">{email}</span>. Please click the link to continue.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
          >
             I have clicked the link (Reload)
          </button>
          <button 
            onClick={handleLogout}
            className="mt-4 text-sm text-slate-400 hover:text-slate-600"
          >
            Cancel & Logout
          </button>
        </div>
      </div>
    );
  }

  if (currentView === AppView.ADMIN_DASHBOARD) {
      return <AdminDashboard onLogout={handleLogout} />;
  }

  if (currentView === AppView.PROFILE_SETUP) {
    // ... Profile Setup Implementation (same as before) ...
    const ranks = getRanksForDepartment(profileData.department || '');
    const isEditing = !!currentUser?.profile;
    
    return (
      <div className="min-h-screen pb-12">
        <div className="bg-blue-900 h-48 w-full absolute top-0 z-0"></div>
        {isOffline && (
            <div className="fixed top-0 left-0 right-0 z-[100] bg-orange-600 text-white text-xs font-bold text-center py-1 flex items-center justify-center shadow-md">
                <WifiOff className="w-3 h-3 mr-2" />
                You are offline. Profile updates are disabled.
            </div>
        )}
        
        <div className="relative z-10 container mx-auto px-4 pt-12 max-w-2xl">
          <div className="text-center mb-8">
             <h1 className="text-3xl font-bold text-white">{isEditing ? 'Update Profile' : 'Complete Your Profile'}</h1>
             <p className="text-blue-200 mt-2">{isEditing ? 'Keep your information up to date.' : "Let's get your professional profile ship-shape."}</p>
             {isMockMode && <span className="inline-block mt-2 px-2 py-1 bg-amber-500/20 text-amber-200 text-xs rounded border border-amber-500/30">Simulation Mode</span>}
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
            <form onSubmit={handleProfileSubmit} className="p-8 space-y-6">
              {/* Form Content - Same as before */}
              
              {/* Profile Picture Upload */}
              <div className="flex flex-col items-center justify-center mb-8">
                <div className="relative w-32 h-32 mb-4">
                  <div className="w-full h-full rounded-full overflow-hidden border-4 border-slate-100 bg-slate-50 shadow-inner flex items-center justify-center">
                    {profilePicPreview ? (
                      <img src={profilePicPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-slate-300">
                         <UserIcon className="w-16 h-16" />
                      </div>
                    )}
                  </div>
                  <label htmlFor="pic-upload" className={`absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full cursor-pointer shadow-lg transition-transform hover:scale-110 ${isOffline ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <Upload className="w-5 h-5" />
                  </label>
                  <input id="pic-upload" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isOffline} />
                </div>
                <p className="text-sm text-slate-500">Upload a professional photo (Uniform preferred)</p>
              </div>

              {/* Personal Info Group */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                 <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center"><ShieldCheck className="w-4 h-4 mr-2 text-blue-600"/> Official Verification</h3>
                 <div className="grid grid-cols-1 gap-4">
                    {renderInput(
                        "Date of Birth", 
                        profileData.dateOfBirth || '', 
                        (v) => setProfileData({...profileData, dateOfBirth: v}), 
                        "date", "", 
                        <Calendar className="w-5 h-5"/>
                    )}
                    
                    {renderInput(
                        "CDC Number", 
                        profileData.cdcNumber || '', 
                        (v) => setProfileData({...profileData, cdcNumber: v}), 
                        "text", 
                        "C/O/...", 
                        <CheckCircle className="w-5 h-5"/>,
                        // SEARCH BUTTON
                        <button 
                            type="button"
                            onClick={openDosModal}
                            disabled={isOffline}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg flex items-center font-medium shadow-sm transition-colors disabled:opacity-50"
                            title="Import from DOS"
                        >
                            <Globe className="w-4 h-4 mr-2" /> 
                            <span className="hidden sm:inline">Import</span>
                        </button>
                    )}
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {renderInput("First Name", profileData.firstName || '', (v) => setProfileData({...profileData, firstName: v}), "text", "e.g. Mohammad")}
                {renderInput("Last Name", profileData.lastName || '', (v) => setProfileData({...profileData, lastName: v}), "text", "e.g. Rahim")}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {renderSelect(
                  "Department", 
                  profileData.department || '', 
                  (v) => setProfileData({...profileData, department: v as Department, rank: ''}), // Reset rank on dept change
                  Object.values(Department)
                )}
                {renderSelect(
                  "Rank", 
                  profileData.rank || '', 
                  (v) => setProfileData({...profileData, rank: v}), 
                  ranks
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {renderInput("Mobile Number", profileData.mobileNumber || '', (v) => setProfileData({...profileData, mobileNumber: v}), "tel", "+880 1...", <Phone className="w-5 h-5"/>)}
                 {renderSelect(
                  "Preferred Ship Type", 
                  profileData.preferredShipType || '', 
                  (v) => setProfileData({...profileData, preferredShipType: v}), 
                  Object.values(ShipType)
                )}
              </div>


              <div className="pt-6 flex gap-4">
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => setCurrentView(AppView.DASHBOARD)}
                    className="flex-1 py-4 px-6 border border-slate-300 rounded-xl text-lg font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading || isOffline}
                  className={`flex-1 flex items-center justify-center py-4 px-6 border border-transparent rounded-xl shadow-lg text-lg font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed ${!isEditing ? 'w-full' : ''}`}
                >
                  {loading ? 'Saving...' : (isEditing ? 'Save Changes' : 'Set Sail')}
                  {!loading && !isEditing && <ArrowRight className="ml-2 w-5 h-5" />}
                </button>
              </div>

            </form>
          </div>
        </div>

        {/* DOS Import Modal */}
        {showDosModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => !dosLoading && setShowDosModal(false)}></div>
                <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
                    {/* ... DOS Modal Content ... */}
                    <div className="bg-blue-900 p-4 text-white flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <img src="https://erp.gso.gov.bd/img/govt_logo.png" alt="BD Govt" className="w-8 h-8 rounded-full bg-white p-0.5" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            <h3 className="font-bold">DOS Verification</h3>
                        </div>
                        <button onClick={() => setShowDosModal(false)} className="p-1 hover:bg-white/20 rounded-full text-white/80"><X className="w-5 h-5"/></button>
                    </div>
                     <div className="p-6">
                        {dosStep === 'captcha' && (
                            <div className="space-y-4">
                                <p className="text-sm text-slate-600">Please enter the security code to access your CDC records from <strong>gso.gov.bd</strong>.</p>
                                
                                <div className="flex justify-center my-4">
                                    <div className="bg-slate-100 p-4 rounded-lg border-2 border-slate-300 select-none relative overflow-hidden w-full text-center">
                                        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')]"></div>
                                        <span className="text-3xl font-mono font-bold tracking-[0.5em] text-slate-800 relative z-10" style={{textShadow: '2px 2px 2px rgba(0,0,0,0.1)'}}>
                                            8X2K
                                        </span>
                                        <span className="text-[10px] absolute bottom-1 right-2 text-slate-400">gso.gov.bd</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Security Code</label>
                                    <input 
                                        type="text" 
                                        value={dosCaptcha}
                                        onChange={(e) => setDosCaptcha(e.target.value.toUpperCase())}
                                        placeholder="Enter code"
                                        className="w-full p-3 border border-slate-300 rounded-lg font-mono text-center text-lg uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                                        maxLength={4}
                                    />
                                    <p className="text-xs text-slate-400 mt-1 text-center">Hint: The code above is 8X2K</p>
                                </div>

                                {dosError && (
                                    <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center">
                                        <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                                        {dosError}
                                    </div>
                                )}

                                <button 
                                    onClick={handleDosSubmit}
                                    disabled={dosLoading}
                                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-900/20 transition-all active:scale-95 flex items-center justify-center"
                                >
                                    {dosLoading ? <Loader2 className="animate-spin w-5 h-5"/> : "Verify & Fetch"}
                                </button>
                            </div>
                        )}
                        {/* ... Fetching and Success states ... */}
                        {dosStep === 'fetching' && (
                            <div className="py-8 flex flex-col items-center text-center space-y-4">
                                <div className="relative">
                                    <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Globe className="w-6 h-6 text-blue-600" />
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800">Connecting to Server...</h4>
                                    <p className="text-sm text-slate-500 mt-1">Extracting Sea Service records...</p>
                                </div>
                            </div>
                        )}

                        {dosStep === 'success' && (
                            <div className="py-6 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-2">
                                    <CheckCircle className="w-8 h-8" />
                                </div>
                                <div>
                                    <h4 className="text-xl font-bold text-slate-800">Profile Found!</h4>
                                    <p className="text-sm text-slate-500 mt-2 px-4">
                                        Successfully imported details for <strong>{profileData.firstName} {profileData.lastName}</strong> and updated sea service history.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

      </div>
    );
  }

  if (currentView === AppView.DASHBOARD && currentUser) {
    return (
        <>
            {isOffline && (
                <div className="fixed top-0 left-0 right-0 z-[100] bg-orange-600 text-white text-xs font-bold text-center py-1 flex items-center justify-center shadow-md">
                    <WifiOff className="w-3 h-3 mr-2" />
                    Offline Mode: Cached data loaded. Some features are limited.
                </div>
            )}
            <Dashboard user={currentUser} onLogout={handleLogout} onEditProfile={handleEditProfile} onUpdateSeaService={handleUpdateSeaService} onToggleJobStatus={handleToggleJobStatus} onToggleOnboardStatus={handleToggleOnboardStatus} />
        </>
    );
  }

  return <div>Error: Unknown State</div>;
};

export default App;