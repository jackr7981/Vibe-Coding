import React, { useState, useEffect, useMemo } from 'react';
import { User, UserProfile, ShipType, Rank, DocumentCategory, MarinerDocument, Department } from '../types';
import { LogOut, Users, FileCheck, Anchor, Search, ChevronRight, ArrowLeft, BarChart, Shield } from 'lucide-react';
import { Documents } from './Documents';
import { supabase, isMockMode } from '../services/supabase';

interface AdminDashboardProps {
  onLogout: () => void;
}

// Generate Mock Data for Admin View
const generateMockUsers = (count: number): User[] => {
  const users: User[] = [];
  const names = ['Rahim', 'Karim', 'Sultan', 'Akbar', 'Jalal', 'Mizan', 'Kamal', 'Hassan', 'Farid', 'Nazrul'];
  const lastNames = ['Uddin', 'Ahmed', 'Khan', 'Chowdhury', 'Ali', 'Islam', 'Rahman', 'Sarkar', 'Mia', 'Bhuiyan'];
  
  for (let i = 0; i < count; i++) {
    const firstName = names[Math.floor(Math.random() * names.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const rank = Object.values(Rank)[Math.floor(Math.random() * Object.values(Rank).length)];
    const shipType = Object.values(ShipType)[Math.floor(Math.random() * Object.values(ShipType).length)];
    
    users.push({
      id: `user-${i}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      isVerified: true,
      profile: {
        firstName,
        lastName,
        rank: rank as Rank,
        department: Department.DECK, // Simplified
        cdcNumber: `C/O/${Math.floor(10000 + Math.random() * 90000)}`,
        mobileNumber: `+88017${Math.floor(10000000 + Math.random() * 90000000)}`,
        dateOfBirth: '1990-01-01',
        preferredShipType: shipType as ShipType,
        profilePicture: null,
        seaServiceHistory: []
      }
    });
  }
  return users;
};

// Generate Mock Documents for a User
const generateMockDocuments = (userId: string): MarinerDocument[] => {
    const docs: MarinerDocument[] = [];
    const titles = ['CDC', 'COC', 'Passport', 'Medical', 'STCW Basic Safety', 'Seaman Book'];
    
    titles.forEach((title, idx) => {
        // Randomize expiry to simulate valid/invalid pool
        const isExpiringSoon = Math.random() > 0.7; 
        const year = isExpiringSoon ? 2023 : 2026 + Math.floor(Math.random() * 3);
        const month = Math.floor(Math.random() * 12) + 1;
        const day = Math.floor(Math.random() * 28) + 1;
        
        docs.push({
            id: `${userId}-doc-${idx}`,
            title,
            category: DocumentCategory.CERTIFICATE,
            documentNumber: `DOC-${Math.floor(Math.random() * 1000)}`,
            expiryDate: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
            fileUrl: '',
            uploadDate: Date.now()
        });
    });
    return docs;
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'users'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userDocuments, setUserDocuments] = useState<MarinerDocument[]>([]);
  
  useEffect(() => {
    // Fetch Users logic
    const loadUsers = async () => {
        if (isMockMode) {
            setUsers(generateMockUsers(25));
        } else {
            // Real Supabase Fetch - Requires RLS policy allowing admin to see all profiles
            const { data, error } = await supabase.from('profiles').select('*');
            if (data && !error) {
                // Map raw DB profile to User object structure
                const mappedUsers = data.map((p: any) => ({
                    id: p.id,
                    email: 'user@example.com', // Email strictly not exposed in profiles table usually, but okay for list
                    isVerified: true,
                    profile: {
                        firstName: p.first_name,
                        lastName: p.last_name,
                        rank: p.rank,
                        department: p.department,
                        cdcNumber: p.cdc_number,
                        mobileNumber: p.mobile_number,
                        dateOfBirth: p.date_of_birth,
                        preferredShipType: p.preferred_ship_type,
                        profilePicture: null
                    }
                }));
                setUsers(mappedUsers);
            }
        }
    };
    loadUsers();
  }, []);

  const handleUserClick = async (user: User) => {
      setSelectedUser(user);
      // Fetch documents for this user
      if (isMockMode) {
          setUserDocuments(generateMockDocuments(user.id || 'temp'));
      } else {
          // Fetch from Supabase
          const { data } = await supabase.from('documents').select('*').eq('user_id', user.id);
          if (data) {
             const mappedDocs = data.map((doc: any) => ({
                id: doc.id,
                title: doc.title,
                expiryDate: doc.expiry_date || 'N/A',
                documentNumber: doc.document_number,
                fileUrl: '', // URLs fetched on demand or use getStorageUrl here
                uploadDate: new Date(doc.created_at).getTime(),
                category: doc.category
             }));
             setUserDocuments(mappedDocs);
          }
      }
  };

  const filteredUsers = useMemo(() => {
      const lowerQ = searchQuery.toLowerCase();
      return users.filter(u => 
        u.profile?.firstName.toLowerCase().includes(lowerQ) || 
        u.profile?.lastName.toLowerCase().includes(lowerQ) ||
        u.profile?.cdcNumber.toLowerCase().includes(lowerQ)
      );
  }, [users, searchQuery]);

  // Analytics
  const shipTypeStats = useMemo(() => {
      const stats: Record<string, number> = {};
      users.forEach(u => {
          const type = u.profile?.preferredShipType || 'Unspecified';
          stats[type] = (stats[type] || 0) + 1;
      });
      return Object.entries(stats).sort((a,b) => b[1] - a[1]);
  }, [users]);

  const validCertCount = useMemo(() => {
      // In a real app, this requires fetching ALL docs for ALL users which is heavy.
      // We simulate this based on a probability for the "Overview" tab.
      return Math.floor(users.length * 0.7); // Mock 70% have valid certs > 12m
  }, [users]);

  // If drill-down view is active
  if (selectedUser) {
      return (
          <div className="min-h-screen bg-slate-100 flex flex-col">
              <header className="bg-slate-800 text-white p-4 shadow-lg sticky top-0 z-50">
                  <div className="container mx-auto flex justify-between items-center">
                      <div className="flex items-center gap-4">
                          <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-slate-700 rounded-full transition-colors"><ArrowLeft className="w-6 h-6" /></button>
                          <div>
                              <h1 className="font-bold text-lg">{selectedUser.profile?.firstName} {selectedUser.profile?.lastName}</h1>
                              <p className="text-xs text-slate-400">{selectedUser.profile?.rank} • {selectedUser.profile?.cdcNumber}</p>
                          </div>
                      </div>
                  </div>
              </header>
              <main className="flex-1 container mx-auto p-4">
                  <Documents 
                    documents={userDocuments} 
                    onAddDocument={() => {}} 
                    onDeleteDocument={() => {}} 
                    onUpdateDocument={() => {}} 
                    readOnly={true} // Admin Read Only
                  />
              </main>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Admin Header */}
      <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-400" />
            <span className="font-bold text-lg">Admin Console</span>
          </div>
          <button onClick={onLogout} className="text-slate-300 hover:text-white flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-40">
          <div className="container mx-auto flex">
              <button 
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'overview' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                  <BarChart className="w-4 h-4 inline-block mr-2" /> Overview
              </button>
              <button 
                onClick={() => setActiveTab('users')}
                className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'users' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                  <Users className="w-4 h-4 inline-block mr-2" /> Mariners
              </button>
          </div>
      </div>

      <main className="flex-1 container mx-auto p-6">
        
        {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-slate-500 font-medium text-sm">Total Mariners</h3>
                            <Users className="w-5 h-5 text-blue-500" />
                        </div>
                        <p className="text-3xl font-bold text-slate-800">{users.length}</p>
                        <p className="text-xs text-green-600 mt-2 flex items-center">+5 this week</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-slate-500 font-medium text-sm">Ready for Sea</h3>
                            <Anchor className="w-5 h-5 text-emerald-500" />
                        </div>
                        <p className="text-3xl font-bold text-slate-800">{validCertCount}</p>
                        <p className="text-xs text-slate-400 mt-2">Certs expiring &gt; 12 months</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-slate-500 font-medium text-sm">Doc Verification</h3>
                            <FileCheck className="w-5 h-5 text-amber-500" />
                        </div>
                        <p className="text-3xl font-bold text-slate-800">12</p>
                        <p className="text-xs text-amber-600 mt-2">Pending review</p>
                    </div>
                </div>

                {/* Charts */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-6">Preferred Ship Type Distribution</h3>
                    <div className="space-y-4">
                        {shipTypeStats.map(([type, count]) => (
                            <div key={type}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-slate-700">{type}</span>
                                    <span className="text-slate-500">{count} Users</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-emerald-500 rounded-full" 
                                        style={{ width: `${(count / users.length) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'users' && (
            <div className="space-y-6 animate-fade-in">
                {/* Search */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3">
                    <Search className="w-5 h-5 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search by Name, CDC Number..." 
                        className="flex-1 outline-none text-slate-700"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* List */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                            <tr>
                                <th className="p-4">Name</th>
                                <th className="p-4 hidden md:table-cell">Rank</th>
                                <th className="p-4 hidden md:table-cell">Ship Type</th>
                                <th className="p-4">CDC No</th>
                                <th className="p-4">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4">
                                        <div className="font-bold text-slate-800">{user.profile?.firstName} {user.profile?.lastName}</div>
                                        <div className="text-xs text-slate-400 md:hidden">{user.profile?.rank}</div>
                                    </td>
                                    <td className="p-4 hidden md:table-cell text-sm text-slate-600">{user.profile?.rank}</td>
                                    <td className="p-4 hidden md:table-cell text-sm text-slate-600">{user.profile?.preferredShipType || '-'}</td>
                                    <td className="p-4 font-mono text-xs text-slate-500">{user.profile?.cdcNumber}</td>
                                    <td className="p-4">
                                        <button 
                                            onClick={() => handleUserClick(user)}
                                            className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors flex items-center text-xs font-bold"
                                        >
                                            View Docs <ChevronRight className="w-3 h-3 ml-1" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredUsers.length === 0 && (
                        <div className="p-8 text-center text-slate-400">
                            No users found matching "{searchQuery}"
                        </div>
                    )}
                </div>
            </div>
        )}

      </main>
    </div>
  );
};