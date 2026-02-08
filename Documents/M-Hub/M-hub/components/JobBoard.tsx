import React, { useState, useMemo } from 'react';
import { JobPosting, UserProfile, ShipType, Rank } from '../types';
import { Briefcase, MapPin, DollarSign, Calendar, Search, Filter, MessageSquare, Phone, Mail, PlusCircle, Sparkles, Loader2, Copy } from 'lucide-react';
import { parseJobPosting } from '../services/geminiService';

// Mock Initial Jobs
const INITIAL_JOBS: JobPosting[] = [
  {
    id: '1',
    rank: Rank.MASTER,
    shipType: ShipType.BULK_CARRIER,
    wage: '$8500-9000',
    joiningDate: 'Urgent / mid-June',
    description: 'Master required for Supramax Bulk Carrier. 2012 built. Trading worldwide. Must have valid US Visa.',
    contactInfo: 'crew@agency.com / +880170000000',
    source: 'WhatsApp',
    postedDate: Date.now() - 100000000,
    companyName: 'Global Maritime'
  },
  {
    id: '2',
    rank: Rank.SECOND_ENGINEER,
    shipType: ShipType.OIL_TANKER,
    wage: '$6000',
    joiningDate: 'July 2024',
    description: '2/E for Aframax Tanker. Experience in oil major vetting required. 4 +/- 1 months contract.',
    contactInfo: 'hr@tankers.bd',
    source: 'Telegram',
    postedDate: Date.now() - 50000000,
    companyName: 'BD Tankers Ltd'
  },
  {
    id: '3',
    rank: Rank.ABLE_SEAMAN,
    shipType: ShipType.CONTAINER,
    wage: '$1400',
    joiningDate: 'ASAP',
    description: 'AB required for Feeder container. Chittagong-Singapore run. COP required.',
    contactInfo: '+880180000000',
    source: 'Direct',
    postedDate: Date.now(),
    companyName: 'Local Agency'
  }
];

interface JobBoardProps {
  userProfile?: UserProfile;
}

export const JobBoard: React.FC<JobBoardProps> = ({ userProfile }) => {
  const [jobs, setJobs] = useState<JobPosting[]>(INITIAL_JOBS);
  const [filterRank, setFilterRank] = useState<string>(userProfile?.rank || 'All');
  const [filterType, setFilterType] = useState<string>(userProfile?.preferredShipType || 'All');
  
  // Import Modal State
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchRank = filterRank === 'All' || job.rank.includes(filterRank) || (filterRank === 'Other' && job.rank === 'Unknown');
      const matchType = filterType === 'All' || job.shipType === filterType;
      return matchRank && matchType;
    }).sort((a,b) => b.postedDate - a.postedDate);
  }, [jobs, filterRank, filterType]);

  const handleSmartImport = async () => {
    if (!importText.trim()) return;
    setIsParsing(true);
    
    try {
      const parsedData = await parseJobPosting(importText);
      
      const newJob: JobPosting = {
        id: Date.now().toString(),
        rank: parsedData.rank || "Unknown",
        shipType: parsedData.shipType || "Unknown",
        wage: parsedData.wage,
        joiningDate: parsedData.joiningDate,
        description: parsedData.description || importText,
        contactInfo: parsedData.contactInfo || "N/A",
        source: 'WhatsApp', // Defaulting since this is likely from social
        postedDate: Date.now(),
        companyName: parsedData.companyName || "Unknown Agency"
      };

      setJobs(prev => [newJob, ...prev]);
      setShowImport(false);
      setImportText('');
    } catch (e) {
      alert("Failed to parse job. Please try manually.");
    } finally {
      setIsParsing(false);
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    return "Just now";
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-700 p-6 rounded-2xl text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-xl font-bold">Maritime Job Board</h2>
          <p className="text-emerald-100 text-sm opacity-90">Aggregated opportunities from social groups & agencies.</p>
          
          <div className="mt-6 flex gap-3">
             <button 
               onClick={() => setShowImport(true)}
               className="bg-white text-emerald-800 px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center hover:bg-emerald-50 transition-colors active:scale-95"
             >
                <Sparkles className="w-4 h-4 mr-2" /> Smart Import Job
             </button>
             <div className="px-4 py-2.5 bg-black/20 rounded-xl text-xs flex items-center border border-white/10 backdrop-blur-sm">
                <Search className="w-3 h-3 mr-2" /> {filteredJobs.length} Jobs Found
             </div>
          </div>
        </div>
        <Briefcase className="absolute -bottom-4 -right-4 w-32 h-32 text-white opacity-10 rotate-12" />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Rank Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-2 px-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 self-center mr-2">Rank:</span>
            {['All', ...Object.values(Rank)].map(rank => (
                <button
                    key={rank}
                    onClick={() => setFilterRank(rank)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                        filterRank === rank
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-md'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    {rank}
                </button>
            ))}
        </div>
        
        {/* Ship Type Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-2 px-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 self-center mr-2">Type:</span>
            {['All', ...Object.values(ShipType)].map(type => (
                <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                        filterType === type
                        ? 'bg-slate-800 text-white border-slate-800 shadow-md'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    {type}
                </button>
            ))}
        </div>
      </div>

      {/* Job List */}
      <div className="space-y-4">
         {filteredJobs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
                <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No active jobs found for these filters.</p>
                <button onClick={() => {setFilterRank('All'); setFilterType('All');}} className="text-emerald-600 text-sm font-semibold mt-2 hover:underline">Show All Jobs</button>
            </div>
         ) : (
            filteredJobs.map(job => (
                <div key={job.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow relative group">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide border border-emerald-200 mb-1 inline-block">
                                {job.source}
                            </span>
                            <h3 className="font-bold text-slate-800 text-lg leading-tight">{job.rank}</h3>
                            <p className="text-sm font-medium text-slate-600 flex items-center mt-1">
                                <span className="mr-2">{job.shipType}</span>
                                {job.companyName && <span className="text-slate-400 text-xs font-normal">• {job.companyName}</span>}
                            </p>
                        </div>
                        <div className="text-right">
                           <span className="text-xs text-slate-400 font-medium">{getTimeAgo(job.postedDate)}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 my-3">
                        <div className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                             <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Wages</span>
                             <div className="flex items-center text-emerald-700 font-bold text-sm">
                                <DollarSign className="w-3 h-3 mr-1" /> {job.wage || 'Negotiable'}
                             </div>
                        </div>
                        <div className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                             <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Joining</span>
                             <div className="flex items-center text-blue-700 font-bold text-sm">
                                <Calendar className="w-3 h-3 mr-1" /> {job.joiningDate || 'ASAP'}
                             </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm text-slate-600 mb-3">
                        <p className="line-clamp-3">{job.description}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                         <div className="text-xs text-slate-500 font-mono truncate max-w-[50%] bg-slate-100 px-2 py-1 rounded">
                            {job.contactInfo}
                         </div>
                         <div className="flex gap-2">
                             <a href={`tel:${job.contactInfo.match(/[\d+]+/)}`} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                                 <Phone className="w-4 h-4" />
                             </a>
                             <button 
                                onClick={() => navigator.clipboard.writeText(job.contactInfo)}
                                className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                                title="Copy Contact"
                             >
                                 <Copy className="w-4 h-4" />
                             </button>
                         </div>
                    </div>
                </div>
            ))
         )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowImport(false)}></div>
           <div className="relative bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 flex items-center"><Sparkles className="w-5 h-5 text-emerald-500 mr-2"/> Smart Job Import</h3>
                    <p className="text-sm text-slate-500">Paste text from WhatsApp or Telegram groups</p>
                  </div>
                  <button onClick={() => setShowImport(false)} className="p-1 rounded-full hover:bg-slate-100"><PlusCircle className="w-6 h-6 text-slate-400 rotate-45" /></button>
              </div>
              
              <div className="mb-4">
                 <textarea 
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Example: Urgent Master required for Bulk Carrier. Wages $9000. Joining ASAP. Contact: +88017..."
                    className="w-full h-40 p-4 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-emerald-500 outline-none text-sm resize-none"
                    disabled={isParsing}
                 ></textarea>
                 <p className="text-xs text-slate-400 mt-2 text-right">AI will automatically extract Rank, Ship Type, and Contact info.</p>
              </div>

              <button 
                onClick={handleSmartImport}
                disabled={isParsing || !importText.trim()}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-900/20 flex items-center justify-center transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isParsing ? (
                    <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Analyzing Text...</>
                ) : (
                    'Parse & Add to Board'
                )}
              </button>
           </div>
        </div>
      )}

    </div>
  );
};