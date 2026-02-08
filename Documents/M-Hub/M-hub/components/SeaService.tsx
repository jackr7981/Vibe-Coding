import React, { useState, useMemo } from 'react';
import { SeaServiceRecord, ShipType } from '../types';
import { Ship, Calendar, Plus, Edit2, Trash2, Anchor, Clock, Filter, Droplet, Box, Truck, Waves } from 'lucide-react';

interface SeaServiceProps {
  records: SeaServiceRecord[];
  onUpdate: (records: SeaServiceRecord[]) => void;
}

export const SeaService: React.FC<SeaServiceProps> = ({ records = [], onUpdate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<SeaServiceRecord>>({
    vesselName: '',
    rank: '',
    shipType: '',
    signOnDate: '',
    signOffDate: '',
    imoNumber: ''
  });
  const [activeRankFilter, setActiveRankFilter] = useState<string>('All');
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('All');

  // Calculate Duration Helper
  const calculateTotalSeaTime = (recs: SeaServiceRecord[]) => {
    let totalDays = 0;
    recs.forEach(rec => {
      if (rec.signOnDate && rec.signOffDate) {
        const start = new Date(rec.signOnDate);
        const end = new Date(rec.signOffDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive
        totalDays += diffDays;
      }
    });

    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const days = (totalDays % 365) % 30;

    return { years, months, days, totalDays };
  };

  const uniqueRanks = useMemo(() => {
      const ranks = new Set(records.map(r => r.rank).filter(Boolean));
      return ['All', ...Array.from(ranks)];
  }, [records]);

  const uniqueTypes = useMemo(() => {
    // Map missing ship types to 'Unspecified' or 'Other' so they appear in filters
    const types = new Set(records.map(r => r.shipType || 'Unspecified').filter(Boolean));
    return ['All', ...Array.from(types)];
  }, [records]);

  const filteredRecords = useMemo(() => {
      return records.filter(r => {
        const matchesRank = activeRankFilter === 'All' || r.rank === activeRankFilter;
        
        const recordType = r.shipType || 'Unspecified';
        const matchesType = activeTypeFilter === 'All' || recordType === activeTypeFilter;
        
        return matchesRank && matchesType;
      });
  }, [records, activeRankFilter, activeTypeFilter]);

  const totalSeaTime = useMemo(() => calculateTotalSeaTime(filteredRecords), [filteredRecords]);

  const calculateRecordDuration = (start: string, end: string) => {
      if (!start || !end) return "Pending";
      const s = new Date(start);
      const e = new Date(end);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return "Invalid Dates";
      
      const diffTime = e.getTime() - s.getTime();
      if (diffTime < 0) return "Invalid Range";

      const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      const months = Math.floor(totalDays / 30);
      const days = totalDays % 30;
      
      return `${months}m ${days}d`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingId) {
      const updatedRecords = records.map(rec => 
        rec.id === editingId ? { ...rec, ...formData } as SeaServiceRecord : rec
      );
      onUpdate(updatedRecords);
    } else {
      const newRecord: SeaServiceRecord = {
        id: Date.now().toString(),
        vesselName: formData.vesselName || 'Unknown Vessel',
        rank: formData.rank || 'Cadet',
        shipType: formData.shipType || ShipType.OTHER,
        signOnDate: formData.signOnDate || '',
        signOffDate: formData.signOffDate || '',
        imoNumber: formData.imoNumber,
      };
      onUpdate([...records, newRecord]);
    }
    handleClose();
  };

  const handleEdit = (rec: SeaServiceRecord) => {
    setEditingId(rec.id);
    setFormData(rec);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this record?")) {
        onUpdate(records.filter(r => r.id !== id));
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ vesselName: '', rank: '', shipType: '', signOnDate: '', signOffDate: '', imoNumber: '' });
  };

  const getShipIcon = (type?: string) => {
    if (!type) return <Ship className="w-6 h-6" />;
    const t = type.toLowerCase();
    if (t.includes('oil') || t.includes('chemical') || t.includes('gas') || t.includes('lng') || t.includes('lpg')) return <Droplet className="w-6 h-6" />;
    if (t.includes('container') || t.includes('box')) return <Box className="w-6 h-6" />;
    if (t.includes('car') || t.includes('ro-ro')) return <Truck className="w-6 h-6" />;
    if (t.includes('offshore')) return <Waves className="w-6 h-6" />;
    return <Ship className="w-6 h-6" />;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      
      {/* Header & Stats */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden transition-all duration-500">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Anchor className="w-32 h-32" />
        </div>
        <div className="relative z-10">
          <h2 className="text-xl font-bold mb-1">
            {activeRankFilter === 'All' ? 'Total Sea Service' : `${activeRankFilter} Service`}
          </h2>
          <p className="text-blue-200 text-sm mb-6 flex items-center gap-2">
             {activeTypeFilter !== 'All' && <span className="bg-blue-500/30 px-2 py-0.5 rounded text-xs border border-blue-400/30">{activeTypeFilter}</span>}
             <span>Calculated from {filteredRecords.length} records</span>
          </p>
          
          <div className="flex gap-4 items-end">
             <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[80px] text-center border border-white/10">
                <span className="block text-3xl font-bold">{totalSeaTime.years}</span>
                <span className="text-xs uppercase tracking-wider text-blue-200">Years</span>
             </div>
             <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[80px] text-center border border-white/10">
                <span className="block text-3xl font-bold">{totalSeaTime.months}</span>
                <span className="text-xs uppercase tracking-wider text-blue-200">Months</span>
             </div>
             <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 min-w-[80px] text-center border border-white/10">
                <span className="block text-3xl font-bold">{totalSeaTime.days}</span>
                <span className="text-xs uppercase tracking-wider text-blue-200">Days</span>
             </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-700 text-lg">Service History</h3>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:bg-blue-700 transition-transform active:scale-95"
        >
          <Plus className="w-4 h-4" /> Add Record
        </button>
      </div>

      {/* Filter Tabs - Rank */}
      {records.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-2 px-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 self-center mr-2">Rank:</span>
              {uniqueRanks.map(rank => (
                  <button
                      key={rank}
                      onClick={() => setActiveRankFilter(rank)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border flex items-center ${
                          activeRankFilter === rank
                          ? 'bg-slate-800 text-white border-slate-800 shadow-md'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                      {rank === 'All' && <Filter className="w-3 h-3 mr-1.5" />}
                      {rank}
                  </button>
              ))}
          </div>

          {/* Filter Tabs - Ship Type */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-2 px-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 self-center mr-2">Type:</span>
              {uniqueTypes.map(type => (
                  <button
                      key={type as string}
                      onClick={() => setActiveTypeFilter(type as string)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border flex items-center ${
                          activeTypeFilter === type
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                      {type}
                  </button>
              ))}
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-4">
        {filteredRecords.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
             <Ship className="w-12 h-12 text-slate-300 mx-auto mb-3" />
             <p className="text-slate-500 font-medium">No sea service records found matching filters.</p>
             {(activeRankFilter !== 'All' || activeTypeFilter !== 'All') ? (
                <button onClick={() => {setActiveRankFilter('All'); setActiveTypeFilter('All');}} className="text-blue-600 text-sm font-semibold mt-2 hover:underline">Clear Filters</button>
             ) : (
                <button onClick={() => setIsModalOpen(true)} className="text-blue-600 text-sm font-semibold mt-2 hover:underline">Add your first ship</button>
             )}
          </div>
        ) : (
          filteredRecords.sort((a,b) => new Date(b.signOnDate).getTime() - new Date(a.signOnDate).getTime()).map((rec) => (
            <div key={rec.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
               <div className="flex justify-between items-start mb-2">
                  <div className="flex items-start gap-3">
                     <div className="bg-blue-50 p-2.5 rounded-lg text-blue-600">
                        {getShipIcon(rec.shipType as string)}
                     </div>
                     <div>
                        <h4 className="font-bold text-slate-800 text-lg leading-tight">{rec.vesselName}</h4>
                        <div className="flex items-center gap-2 text-sm mt-0.5">
                            <span className="text-slate-700 font-medium">{rec.rank}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">{rec.shipType || 'Unspecified'}</span>
                        </div>
                     </div>
                  </div>
                  <div className="flex gap-1">
                     <button onClick={() => handleEdit(rec)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"><Edit2 className="w-4 h-4" /></button>
                     <button onClick={() => handleDelete(rec.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4 mt-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div>
                     <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Sign On</span>
                     <div className="flex items-center text-slate-700 text-sm font-semibold">
                        <Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                        {rec.signOnDate || 'N/A'}
                     </div>
                  </div>
                  <div>
                     <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Sign Off</span>
                     <div className="flex items-center text-slate-700 text-sm font-semibold">
                        <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                        {rec.signOffDate || 'Present'}
                     </div>
                  </div>
               </div>
               
               <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-mono">IMO: {rec.imoNumber || 'N/A'}</span>
                  <div className="flex items-center font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                     <Clock className="w-3 h-3 mr-1" />
                     {calculateRecordDuration(rec.signOnDate, rec.signOffDate)}
                  </div>
               </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose}></div>
           <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-slate-800 mb-4">{editingId ? 'Edit Record' : 'Add Sea Service'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vessel Name</label>
                    <input type="text" required value={formData.vesselName} onChange={e => setFormData({...formData, vesselName: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. MV AKIJ PEARL" />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rank</label>
                        <input type="text" required value={formData.rank} onChange={e => setFormData({...formData, rank: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="Rank" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">IMO Number</label>
                        <input type="text" value={formData.imoNumber} onChange={e => setFormData({...formData, imoNumber: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional" />
                    </div>
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ship Type</label>
                    <div className="relative">
                        <select 
                            value={formData.shipType} 
                            onChange={(e) => setFormData({...formData, shipType: e.target.value})} 
                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                        >
                            <option value="">Select Ship Type</option>
                            {Object.values(ShipType).map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-3 pointer-events-none text-slate-400">
                             <Filter className="w-4 h-4" />
                        </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sign On</label>
                        <input type="date" required value={formData.signOnDate} onChange={e => setFormData({...formData, signOnDate: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sign Off</label>
                        <input type="date" value={formData.signOffDate} onChange={e => setFormData({...formData, signOffDate: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                 </div>
                 
                 <div className="flex gap-3 mt-6">
                    <button type="button" onClick={handleClose} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                    <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-md transition-colors">Save Record</button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};