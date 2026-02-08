import React, { useState, useMemo, useEffect } from 'react';
import { ManningAgent, UserProfile } from '../types';
import { Search, Building2, MapPin, Phone, Mail, Globe, ExternalLink, Send, AlertTriangle, X, Filter, Map } from 'lucide-react';

// Mock Data for Bangladeshi Manning Agents (Govt Approved)
const MOCK_AGENTS: ManningAgent[] = [
  {
    id: '1',
    licenseNumber: 'MLA-001',
    name: 'Haque & Sons Ltd.',
    address: '97, Agrabad C/A, Chittagong-4100, Bangladesh',
    phone: '+880 31 716214',
    email: 'info@haquesons.com',
    website: 'www.haquesons.com',
    status: 'Active',
    cities: ['Chittagong']
  },
  {
    id: '2',
    licenseNumber: 'MLA-002',
    name: 'Bangladesh Shipping Corporation',
    address: 'BSC Bhaban, Saltgola Road, Chittagong',
    phone: '+880 31 713251',
    email: 'md@bsc.gov.bd',
    website: 'www.bsc.gov.bd',
    status: 'Active',
    cities: ['Chittagong']
  },
  {
    id: '3',
    licenseNumber: 'MLA-023',
    name: 'MAS Ship Management',
    address: 'House # 11, Road # 10, Sector # 01, Uttara, Dhaka',
    phone: '+880 2 8919702',
    email: 'crew@masship.com',
    status: 'Active',
    cities: ['Dhaka']
  },
  {
    id: '4',
    licenseNumber: 'MLA-015',
    name: 'K.S. Maritime Pvt. Ltd.',
    address: 'Finlay House (3rd Floor), Agrabad C/A, Chittagong',
    phone: '+880 31 2514682',
    email: 'manning@ksmaritime.com',
    website: 'www.ksmaritime.com',
    status: 'Active',
    cities: ['Chittagong']
  },
  {
    id: '5',
    licenseNumber: 'MLA-045',
    name: 'Brave Royal Ship Management',
    address: 'Plot-05, Road-09, Sector-01, Uttara Model Town, Dhaka',
    phone: '+880 2 58954231',
    email: 'info@braveroyal.com',
    status: 'Active',
    cities: ['Dhaka']
  },
  {
    id: '6',
    licenseNumber: 'MLA-067',
    name: 'Univalue Crewing Bangladesh',
    address: 'Sk. Mujib Road, Agrabad, Chittagong',
    phone: '+880 31 2525225',
    email: 'cv@univalue.com.bd',
    status: 'Active',
    cities: ['Chittagong', 'Dhaka']
  },
  {
    id: '7',
    licenseNumber: 'MLA-088',
    name: 'Ocean One Ship Management',
    address: 'Gulshan-1, Dhaka',
    phone: '+880 2 9887766',
    email: 'admin@oceanone.com',
    status: 'Suspended',
    cities: ['Dhaka']
  }
];

interface ManningAgentsProps {
  userProfile?: UserProfile;
}

export const ManningAgents: React.FC<ManningAgentsProps> = ({ userProfile }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('All');
  const [selectedAgent, setSelectedAgent] = useState<ManningAgent | null>(null);
  const [showMap, setShowMap] = useState(false);

  // Reset map view when closing modal or switching agents
  useEffect(() => {
    if (selectedAgent) {
        setShowMap(false);
    }
  }, [selectedAgent]);

  const filteredAgents = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    
    return MOCK_AGENTS.filter(agent => {
      // Search Filter
      const matchesSearch = agent.name.toLowerCase().includes(lowerQuery) || 
                            agent.licenseNumber.toLowerCase().includes(lowerQuery);
      
      // City Filter
      const matchesCity = cityFilter === 'All' || (agent.cities && agent.cities.includes(cityFilter));

      return matchesSearch && matchesCity;
    }).sort((a, b) => {
        // Simple alphanumeric sort for MLA-XXX
        return a.licenseNumber.localeCompare(b.licenseNumber, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [searchQuery, cityFilter]);

  const handleSubmitCV = (agent: ManningAgent) => {
    const subject = `Application for Sea Service - ${userProfile?.rank || 'Mariner'} - ${userProfile?.firstName} ${userProfile?.lastName}`;
    const body = `Dear Hiring Manager,\n\nI am writing to express my interest in joining your fleet. Please find my details below:\n\nName: ${userProfile?.firstName} ${userProfile?.lastName}\nRank: ${userProfile?.rank}\nCDC No: ${userProfile?.cdcNumber}\nMobile: ${userProfile?.mobileNumber}\n\nI have attached my CV for your review.\n\nBest Regards,\n${userProfile?.firstName} ${userProfile?.lastName}`;
    
    window.location.href = `mailto:${agent.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="space-y-4 animate-fade-in pb-20">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
         <h2 className="text-xl font-bold text-slate-800">Govt. Approved Agents</h2>
         <p className="text-sm text-slate-500">Department of Shipping Licensed Manning Agents</p>
         
         {/* Search Bar */}
         <div className="mt-4 relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
            <input 
               type="text" 
               placeholder="Search by Agent Name or License (e.g., MLA-001)"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
            />
         </div>

         {/* City Filters */}
         <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {['All', 'Dhaka', 'Chittagong', 'Khulna'].map(city => (
                <button
                    key={city}
                    onClick={() => setCityFilter(city)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border flex items-center ${
                        cityFilter === city
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    {city === 'All' ? <Filter className="w-3 h-3 mr-1.5" /> : <MapPin className="w-3 h-3 mr-1.5" />}
                    {city}
                </button>
            ))}
         </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         {filteredAgents.length > 0 ? (
            filteredAgents.map(agent => (
                <div 
                    key={agent.id} 
                    onClick={() => setSelectedAgent(agent)}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Building2 className="w-16 h-16 text-blue-600" />
                    </div>
                    
                    <div className="flex justify-between items-start mb-2">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono font-bold text-xs rounded border border-slate-200">
                            {agent.licenseNumber}
                        </span>
                        <div className="flex gap-1">
                           {agent.cities && agent.cities.includes('Dhaka') && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">DHK</span>}
                           {agent.cities && agent.cities.includes('Chittagong') && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">CTG</span>}
                           <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${agent.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {agent.status}
                           </span>
                        </div>
                    </div>
                    
                    <h3 className="font-bold text-slate-800 text-lg mb-1 leading-tight">{agent.name}</h3>
                    <p className="text-sm text-slate-500 truncate mb-4">{agent.address}</p>

                    <div className="flex items-center text-blue-600 font-medium text-sm mt-auto">
                        View Details <ExternalLink className="w-3 h-3 ml-1" />
                    </div>
                </div>
            ))
         ) : (
            <div className="col-span-full py-12 text-center text-slate-400">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No agents found matching current filters.</p>
                {(searchQuery || cityFilter !== 'All') && (
                    <button 
                        onClick={() => { setSearchQuery(''); setCityFilter('All'); }}
                        className="text-blue-600 text-sm font-semibold mt-2 hover:underline"
                    >
                        Clear Filters
                    </button>
                )}
            </div>
         )}
      </div>

      {/* Detail Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedAgent(null)}></div>
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-blue-900 to-slate-800 p-6 text-white relative shrink-0">
                    <button onClick={() => setSelectedAgent(null)} className="absolute top-4 right-4 p-1.5 hover:bg-white/20 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2 mb-2">
                         <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded text-xs font-mono">{selectedAgent.licenseNumber}</span>
                         <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/20 backdrop-blur-md ${selectedAgent.status === 'Active' ? 'text-green-300' : 'text-red-300'}`}>
                            {selectedAgent.status}
                         </span>
                    </div>
                    <h3 className="text-2xl font-bold leading-tight">{selectedAgent.name}</h3>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-6 overflow-y-auto">
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />
                            <div className="w-full">
                                <label className="block text-xs font-bold text-slate-500 uppercase">Address</label>
                                <p className="text-slate-700">{selectedAgent.address}</p>
                                
                                <button 
                                  onClick={() => setShowMap(!showMap)} 
                                  className="mt-2 text-xs font-bold text-blue-600 flex items-center hover:underline"
                                >
                                  {showMap ? 'Hide Map' : 'View on Map'} 
                                  <Map className="w-3 h-3 ml-1" />
                                </button>

                                {showMap && (
                                  <div className="mt-3 w-full h-48 rounded-lg overflow-hidden border border-slate-200 relative bg-slate-100">
                                     <iframe 
                                       width="100%" 
                                       height="100%" 
                                       style={{border:0}} 
                                       loading="lazy" 
                                       allowFullScreen 
                                       src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedAgent.name + ', ' + selectedAgent.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                     ></iframe>
                                     <a 
                                       href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAgent.name + ' ' + selectedAgent.address)}`}
                                       target="_blank" 
                                       rel="noreferrer"
                                       className="absolute bottom-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded shadow text-xs font-bold text-blue-600 flex items-center hover:bg-white"
                                     >
                                       Open App <ExternalLink className="w-3 h-3 ml-1"/>
                                     </a>
                                  </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <Phone className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase">Phone</label>
                                <a href={`tel:${selectedAgent.phone}`} className="text-blue-600 hover:underline">{selectedAgent.phone}</a>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <Mail className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase">Email</label>
                                <a href={`mailto:${selectedAgent.email}`} className="text-blue-600 hover:underline">{selectedAgent.email}</a>
                            </div>
                        </div>

                        {selectedAgent.website && (
                            <div className="flex items-start gap-3">
                                <Globe className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase">Website</label>
                                    <a href={`http://${selectedAgent.website}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{selectedAgent.website}</a>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                        {selectedAgent.status === 'Active' ? (
                            <button 
                                onClick={() => handleSubmitCV(selectedAgent)}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 flex items-center justify-center transition-transform active:scale-95"
                            >
                                <Send className="w-5 h-5 mr-2" /> Submit CV via Email
                            </button>
                        ) : (
                            <div className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold flex items-center justify-center border border-red-100">
                                <AlertTriangle className="w-5 h-5 mr-2" /> Agent Suspended
                            </div>
                        )}
                        <p className="text-center text-xs text-slate-400 mt-3">
                            Clicking Submit will open your default email client with a pre-filled template.
                        </p>
                    </div>
                </div>

            </div>
        </div>
      )}

    </div>
  );
};