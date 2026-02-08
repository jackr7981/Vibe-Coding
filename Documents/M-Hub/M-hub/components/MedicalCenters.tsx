import React, { useState, useMemo, useEffect } from 'react';
import { MedicalCenter } from '../types';
import { Search, MapPin, Phone, Stethoscope, Building, ExternalLink, Filter, Map, X } from 'lucide-react';

// Mock Data for DG Shipping Approved Medical Centers
const MOCK_MEDICALS: MedicalCenter[] = [
  {
    id: '1',
    name: 'Marine Health Care',
    approvalNumber: 'DG-MED-001',
    address: 'House # 15, Road # 03, Sector # 01, Uttara, Dhaka',
    phone: '+880 2 8951234',
    city: 'Dhaka',
    status: 'Approved',
    isCenter: true
  },
  {
    id: '2',
    name: 'Dr. Rafiqul Islam (Surgeon)',
    approvalNumber: 'DG-DOC-025',
    address: 'Agrabad C/A, Chittagong',
    phone: '+880 1711 555666',
    city: 'Chittagong',
    status: 'Approved',
    isCenter: false
  },
  {
    id: '3',
    name: 'Popular Diagnostic Center (Maritime Wing)',
    approvalNumber: 'DG-MED-005',
    address: 'Dhanmondi, Dhaka',
    phone: '+880 2 9660000',
    city: 'Dhaka',
    status: 'Approved',
    isCenter: true
  },
  {
    id: '4',
    name: 'Port City Medical Services',
    approvalNumber: 'DG-MED-012',
    address: 'Sk. Mujib Road, Chittagong',
    phone: '+880 31 720123',
    city: 'Chittagong',
    status: 'Approved',
    isCenter: true
  },
  {
    id: '5',
    name: 'Khulna Maritime Health',
    approvalNumber: 'DG-MED-018',
    address: 'Khalishpur, Khulna',
    phone: '+880 41 760555',
    city: 'Khulna',
    status: 'Approved',
    isCenter: true
  },
  {
    id: '6',
    name: 'Dr. Anisur Rahman',
    approvalNumber: 'DG-DOC-033',
    address: 'Motijheel C/A, Dhaka',
    phone: '+880 1819 222333',
    city: 'Dhaka',
    status: 'Suspended',
    isCenter: false
  }
];

export const MedicalCenters: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('All');
  const [selectedCenter, setSelectedCenter] = useState<MedicalCenter | null>(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    if (selectedCenter) {
        setShowMap(false);
    }
  }, [selectedCenter]);

  const filteredCenters = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    
    return MOCK_MEDICALS.filter(center => {
      const matchesSearch = center.name.toLowerCase().includes(lowerQuery) || 
                            center.approvalNumber.toLowerCase().includes(lowerQuery) ||
                            center.address.toLowerCase().includes(lowerQuery);
      
      const matchesCity = cityFilter === 'All' || center.city === cityFilter;

      return matchesSearch && matchesCity;
    }).sort((a, b) => {
        return a.status === 'Approved' ? -1 : 1;
    });
  }, [searchQuery, cityFilter]);

  return (
    <div className="space-y-4 animate-fade-in pb-20">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
         <h2 className="text-xl font-bold text-slate-800">Medical Centers & Doctors</h2>
         <p className="text-sm text-slate-500">DG Shipping Approved for Seafarer Medicals</p>
         
         {/* Search Bar */}
         <div className="mt-4 relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
            <input 
               type="text" 
               placeholder="Search Doctor, Center or Address..."
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
                        ? 'bg-rose-600 text-white border-rose-600 shadow-md'
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
         {filteredCenters.length > 0 ? (
            filteredCenters.map(center => (
                <div 
                    key={center.id} 
                    onClick={() => setSelectedCenter(center)}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Stethoscope className="w-16 h-16 text-rose-600" />
                    </div>
                    
                    <div className="flex justify-between items-start mb-2">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono font-bold text-xs rounded border border-slate-200">
                            {center.approvalNumber}
                        </span>
                        <div className="flex gap-1">
                           <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">{center.city.substring(0,3)}</span>
                           <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${center.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {center.status}
                           </span>
                        </div>
                    </div>
                    
                    <h3 className="font-bold text-slate-800 text-lg mb-1 leading-tight flex items-center">
                        {center.isCenter ? <Building className="w-4 h-4 mr-2 text-slate-400"/> : <Stethoscope className="w-4 h-4 mr-2 text-slate-400"/>}
                        {center.name}
                    </h3>
                    <p className="text-sm text-slate-500 truncate mb-4 ml-6">{center.address}</p>

                    <div className="flex items-center text-rose-600 font-medium text-sm mt-auto ml-6">
                        View Details <ExternalLink className="w-3 h-3 ml-1" />
                    </div>
                </div>
            ))
         ) : (
            <div className="col-span-full py-12 text-center text-slate-400">
                <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No medical centers found.</p>
            </div>
         )}
      </div>

      {/* Detail Modal */}
      {selectedCenter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedCenter(null)}></div>
            <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-rose-900 to-slate-800 p-6 text-white relative shrink-0">
                    <button onClick={() => setSelectedCenter(null)} className="absolute top-4 right-4 p-1.5 hover:bg-white/20 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2 mb-2">
                         <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded text-xs font-mono">{selectedCenter.approvalNumber}</span>
                         <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/20 backdrop-blur-md ${selectedCenter.status === 'Approved' ? 'text-green-300' : 'text-red-300'}`}>
                            {selectedCenter.status}
                         </span>
                    </div>
                    <h3 className="text-2xl font-bold leading-tight">{selectedCenter.name}</h3>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-6 overflow-y-auto">
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-slate-400 mt-1 flex-shrink-0" />
                            <div className="w-full">
                                <label className="block text-xs font-bold text-slate-500 uppercase">Address</label>
                                <p className="text-slate-700">{selectedCenter.address}</p>
                                
                                <button 
                                  onClick={() => setShowMap(!showMap)} 
                                  className="mt-2 text-xs font-bold text-rose-600 flex items-center hover:underline"
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
                                       src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedCenter.name + ', ' + selectedCenter.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                                     ></iframe>
                                     <a 
                                       href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedCenter.name + ' ' + selectedCenter.address)}`}
                                       target="_blank" 
                                       rel="noreferrer"
                                       className="absolute bottom-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded shadow text-xs font-bold text-rose-600 flex items-center hover:bg-white"
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
                                <a href={`tel:${selectedCenter.phone}`} className="text-blue-600 hover:underline">{selectedCenter.phone}</a>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
      )}
    </div>
  );
};