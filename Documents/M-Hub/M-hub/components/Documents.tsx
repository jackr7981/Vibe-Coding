import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MarinerDocument, DocumentCategory } from '../types';
import { Plus, X, Camera, Upload, Calendar, Hash, FileText, Check, Loader2, Trash2, Filter, Edit, SwitchCamera, AlertCircle, RefreshCw, FileSpreadsheet, File, Download, AlertTriangle, ChevronLeft, ChevronRight, Layers, Trash, Clock, List, Grid, Eye, ScanLine, Copy, Merge, QrCode, Award, Stethoscope, CreditCard, Plane, FileCheck, Shield } from 'lucide-react';
import { analyzeDocumentImage } from '../services/geminiService';
import { Document, Page, pdfjs } from 'react-pdf';
// @ts-ignore - jsqr is imported via importmap
import jsQR from 'jsqr';
import { supabase, isMockMode } from '../services/supabase';

// Configure PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

interface DocumentsProps {
  documents: MarinerDocument[];
  onAddDocument: (doc: MarinerDocument) => void;
  onUpdateDocument: (doc: MarinerDocument) => void;
  onDeleteDocument: (id: string) => void;
  userName?: string;
  readOnly?: boolean; // New Prop
}

interface PendingFile {
  id: string;
  fileUrl: string; // Base64 for preview
  fileName: string;
  originalBlob?: Blob; // Added for Supabase Upload
}

type ExpiryFilterType = 'all' | 'expired' | '1m' | '3m' | '6m' | '12m';

export const Documents: React.FC<DocumentsProps> = ({ documents, onAddDocument, onUpdateDocument, onDeleteDocument, userName, readOnly = false }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<MarinerDocument | null>(null);
  const [viewPage, setViewPage] = useState(0); // For multi-page navigation in View
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Upload/Processing State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<string[]>([]); // For merge preview
  // Note: We need to keep track of the blobs for uploading. 
  // In a real app we'd map these better, but for now we'll reconstruct blobs from base64 if needed or store them side-by-side.
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [uploadQueue, setUploadQueue] = useState<PendingFile[]>([]);
  
  // Merge Logic State
  const [isMergePromptOpen, setIsMergePromptOpen] = useState(false);
  const [mergeRejected, setMergeRejected] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{title: string; expiry: string; number: string; category: string} | null>(null);
  const [isEnhanced, setIsEnhanced] = useState(true); // "Scan" effect toggle
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [activeExpiryFilter, setActiveExpiryFilter] = useState<ExpiryFilterType>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  
  // PDF View State
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfPageNumber, setPdfPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState<number>(600);

  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const categories = ['All', ...Object.values(DocumentCategory)];

  // Helper: Convert Base64 to Blob
  const base64ToBlob = async (base64: string): Promise<Blob> => {
    const res = await fetch(base64);
    return await res.blob();
  };
  
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case DocumentCategory.MEDICAL: return Stethoscope;
      case DocumentCategory.PERSONAL_ID: return CreditCard;
      case DocumentCategory.VISA: return Plane;
      case DocumentCategory.LICENSE: return Shield;
      case DocumentCategory.CERTIFICATE: return Award;
      default: return FileText;
    }
  };

  // Category Priority for Sorting
  const categoryPriority: Record<string, number> = {
    [DocumentCategory.PERSONAL_ID]: 1,
    [DocumentCategory.VISA]: 2,
    [DocumentCategory.MEDICAL]: 3,
    [DocumentCategory.CERTIFICATE]: 4,
    [DocumentCategory.LICENSE]: 5,
    [DocumentCategory.OTHER]: 6,
  };

  const filteredDocuments = useMemo(() => {
    let docs = activeFilter === 'All' 
      ? documents 
      : documents.filter(doc => doc.category === activeFilter);
    
    if (activeFilter === 'All' && activeExpiryFilter !== 'all') {
      const now = new Date();
      docs = docs.filter(doc => {
        if (!doc.expiryDate || doc.expiryDate === 'N/A') return false;
        const expiry = new Date(doc.expiryDate);
        const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        switch (activeExpiryFilter) {
          case 'expired': return diffDays < 0;
          case '1m': return diffDays >= 0 && diffDays <= 30;
          case '3m': return diffDays >= 0 && diffDays <= 90;
          case '6m': return diffDays >= 0 && diffDays <= 180;
          case '12m': return diffDays >= 0 && diffDays <= 365;
          default: return true;
        }
      });
    }

    if (activeFilter === 'All') {
      docs.sort((a, b) => {
        const priorityA = categoryPriority[a.category] || 99;
        const priorityB = categoryPriority[b.category] || 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        if (a.expiryDate && b.expiryDate && a.expiryDate !== 'N/A' && b.expiryDate !== 'N/A') {
             return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        }
        return 0;
      });
    }

    return docs;
  }, [documents, activeFilter, activeExpiryFilter]);

  // Responsive PDF sizing
  useEffect(() => {
    function handleResize() {
        setContainerWidth(Math.min(window.innerWidth - 48, 800));
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset View state when opening a new doc
  useEffect(() => {
    if (viewingDoc) {
      setPdfPageNumber(1);
      setNumPages(null);
      setViewPage(0);
    }
  }, [viewingDoc]);

  // Check for Merge Opportunity when camera/upload closes or queue changes
  useEffect(() => {
    if (!isCameraOpen && !isModalOpen && uploadQueue.length > 1 && !mergeRejected && !isMergePromptOpen) {
       // Logic handles inside process queue usually, but we want to intercept
    }
  }, [isCameraOpen, isModalOpen, uploadQueue, mergeRejected]);

  // Queue Processing Effect
  useEffect(() => {
    // Only process if not scanning, no image selected, no merge prompt open
    if (!isCameraOpen && !selectedImage && uploadQueue.length > 0 && !editingId && !isMergePromptOpen) {
      
      // If we have > 1 items and haven't rejected merge yet, Prompt User
      if (uploadQueue.length > 1 && !mergeRejected) {
         setIsMergePromptOpen(true);
         return;
      }

      const nextFile = uploadQueue[0];
      setUploadQueue(prev => prev.slice(1));
      
      setSelectedImage(nextFile.fileUrl);
      setSelectedPages([]); // Reset pages for single doc
      setSelectedFileName(nextFile.fileName);
      processImage(nextFile.fileUrl, nextFile.fileName);
      
      // Open modal if it's not open (e.g. came from background processing)
      setIsModalOpen(true);
    }
  }, [isCameraOpen, selectedImage, uploadQueue, editingId, isMergePromptOpen, mergeRejected]);

  // Camera handling
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (isCameraOpen) {
      setCameraError(null);
      const startCamera = async () => {
        try {
          const constraints = {
            video: { 
                facingMode: facingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (videoRef.current) {
             videoRef.current.srcObject = stream;
             // Explicit play for iOS
             videoRef.current.play().catch(e => console.log("Play error", e));
          }
        } catch (err) {
          console.error("Camera Error:", err);
          setCameraError("Access denied. Please enable camera permissions in your browser settings.");
        }
      };
      startCamera();
    }
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [isCameraOpen, facingMode]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (facingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const fileName = `Captured_Photo_${Date.now()}.jpg`;
        // Convert to blob immediately for reliable upload later? 
        // We'll trust converting dataUrl back to Blob later to keep state simple
        setUploadQueue(prev => [...prev, {
          id: Date.now().toString(),
          fileUrl: dataUrl,
          fileName: fileName
        }]);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      const newQueueItems: PendingFile[] = [];
      let processedCount = 0;
      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          newQueueItems.push({
            id: Math.random().toString(36).substr(2, 9),
            fileUrl: base64,
            fileName: file.name,
            originalBlob: file // Keep reference for upload
          });
          processedCount++;
          if (processedCount === files.length) {
            setUploadQueue(prev => [...prev, ...newQueueItems]);
            // Reset merge rejected state when new files come in
            setMergeRejected(false);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const scanQRCodeFromImage = async (base64: string): Promise<{expiry?: string, number?: string} | null> => {
      return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (!ctx) { resolve(null); return; }
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              
              // Attempt QR Code Scan
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: "dontInvert",
              });

              if (code) {
                  const text = code.data;
                  console.log("QR Code Found:", text);
                  
                  // Simple heuristic extraction
                  // 1. Look for Date (YYYY-MM-DD or DD/MM/YYYY)
                  const dateRegex = /(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})/;
                  const dateMatch = text.match(dateRegex);
                  let foundExpiry = undefined;
                  if (dateMatch) {
                      foundExpiry = dateMatch[0].replace(/\//g, '-'); // Normalize to dashes if needed, but ISO preferred
                  }

                  // 2. Look for Number (simple alphanumeric > 3 chars, maybe following 'No:' or just raw if it's a short string)
                  let foundNumber = undefined;
                  const numberMatch = text.match(/(?:No|Doc|CDC)[:\s]*([A-Z0-9/-]+)/i);
                  if (numberMatch) {
                      foundNumber = numberMatch[1];
                  } else if (text.length < 20 && /^[A-Z0-9/-]+$/.test(text)) {
                      // If the entire QR is just a code
                      foundNumber = text;
                  }

                  resolve({ expiry: foundExpiry, number: foundNumber });
              } else {
                  resolve(null);
              }
          };
          img.src = base64;
      });
  };

  const processImage = async (base64: string, fileName: string) => {
    setIsScanning(true);
    setDuplicateWarning(null);
    const startTime = Date.now();
    
    // Parallel execution: Gemini Analysis + QR Code Scan
    try {
      const [geminiData, qrData] = await Promise.all([
          analyzeDocumentImage(base64),
          scanQRCodeFromImage(base64)
      ]);

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 500 - elapsed); // Faster scan feeling
      
      setTimeout(() => {
        let formattedTitle = geminiData.documentName;
        if (!formattedTitle || formattedTitle === 'Unknown Document') {
            formattedTitle = fileName.split('.').slice(0, -1).join('.') || fileName; 
        }
        formattedTitle = formattedTitle.replace(/Certificate of Proficiency/gi, 'COP');
        if (userName && !formattedTitle.toLowerCase().includes(userName.toLowerCase())) {
          formattedTitle = `${formattedTitle} - ${userName}`;
        }

        // Merge QR Data with Gemini Data (QR takes precedence for specifics if found)
        const finalExpiry = qrData?.expiry || (geminiData.expiryDate !== 'N/A' ? geminiData.expiryDate : '');
        const finalNumber = qrData?.number || (geminiData.documentNumber !== 'N/A' ? geminiData.documentNumber : '');

        setScanResult({
          title: formattedTitle,
          expiry: finalExpiry,
          number: finalNumber,
          category: geminiData.category !== 'N/A' ? geminiData.category : DocumentCategory.OTHER
        });
        setIsScanning(false);
      }, remaining);
    } catch (error) {
      console.error(error);
      setIsScanning(false);
      const fallbackTitle = fileName.split('.').slice(0, -1).join('.') || fileName;
      setScanResult({ title: fallbackTitle, expiry: '', number: '', category: DocumentCategory.OTHER });
    }
  };

  const handleMergeConfirm = () => {
    setIsMergePromptOpen(false);
    
    // Combine all queue items
    if (uploadQueue.length > 0) {
        const first = uploadQueue[0];
        const allFiles = uploadQueue.map(q => q.fileUrl);
        
        // Clear queue
        setUploadQueue([]);
        
        // Setup editing environment for the merged doc
        setSelectedImage(first.fileUrl);
        setSelectedPages(allFiles);
        setSelectedFileName(first.fileName);
        
        // Process only the first page for metadata
        processImage(first.fileUrl, first.fileName);
        setIsModalOpen(true);
    }
  };

  const handleMergeReject = () => {
      setIsMergePromptOpen(false);
      setMergeRejected(true);
      // Logic continues in useEffect to process one by one
  };

  const handleEditClick = (doc: MarinerDocument, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;
    setEditingId(doc.id);
    setSelectedImage(doc.fileUrl);
    setSelectedPages(doc.pages || []);
    setSelectedFileName(doc.title); 
    setScanResult({
      title: doc.title,
      expiry: doc.expiryDate,
      number: doc.documentNumber,
      category: doc.category
    });
    setUploadQueue([]); 
    setIsModalOpen(true);
  };

  // UPDATED HANDLE SAVE FOR SUPABASE
  const handleSave = async () => {
    if (selectedImage && scanResult) {
      if (!duplicateWarning && !editingId) {
        const duplicate = documents.find(d => 
            (d.documentNumber === scanResult.number && scanResult.number && scanResult.number !== 'N/A')
        );
        if (duplicate) {
            setDuplicateWarning(`Possible duplicate: Document #${duplicate.documentNumber} already exists ("${duplicate.title}")`);
            return;
        }
      }

      setIsScanning(true); // Reuse scanning loader

      // Mock Mode Save
      if (isMockMode) {
        setTimeout(() => {
            const mockDoc = {
                id: editingId || Math.random().toString(36).substr(2, 9),
                title: scanResult.title || selectedFileName,
                category: scanResult.category,
                documentNumber: scanResult.number,
                expiryDate: scanResult.expiry || null,
                fileUrl: selectedImage,
                pages: selectedPages.length > 0 ? selectedPages : undefined,
                uploadDate: Date.now()
            };

            if (editingId) {
                onUpdateDocument(mockDoc as any);
            } else {
                onAddDocument(mockDoc as any);
            }
            handleCloseModal();
        }, 1000);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        let mainFilePath = '';
        let pagePaths: string[] = [];

        // Upload Helper
        const uploadFile = async (blob: Blob, fileName: string) => {
            const ext = fileName.split('.').pop() || 'jpg';
            const path = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const { error } = await supabase.storage.from('documents').upload(path, blob);
            if (error) throw error;
            return path;
        };

        // 1. Upload Main Image (Page 1)
        const mainBlob = await base64ToBlob(selectedImage);
        mainFilePath = await uploadFile(mainBlob, selectedFileName);

        // 2. Upload Additional Pages if Merged
        if (selectedPages.length > 1) {
            // Re-upload all pages to ensure structure is clean, or just upload the rest.
            // For simplicity in this logic, we upload all as pages array, index 0 matches mainFilePath content but different pointer is fine, 
            // OR strictly: mainFilePath is the thumbnail/first page, pagePaths contains ALL page paths.
            
            for (const pageBase64 of selectedPages) {
                const pageBlob = await base64ToBlob(pageBase64);
                const pPath = await uploadFile(pageBlob, 'page.jpg');
                pagePaths.push(pPath);
            }
        }

        // 3. Insert/Update Database
        const docPayload = {
            user_id: user.id,
            title: scanResult.title || selectedFileName,
            category: scanResult.category,
            document_number: scanResult.number,
            expiry_date: scanResult.expiry || null,
            file_path: mainFilePath,
            page_paths: pagePaths.length > 0 ? pagePaths : null
        };

        if (editingId) {
            const { error } = await supabase.from('documents').update(docPayload).eq('id', editingId);
            if (error) throw error;
            onUpdateDocument({ ...docPayload, id: editingId, fileUrl: '', uploadDate: 0 } as any); // Optimistic ish, but fetch will override
        } else {
            const { error } = await supabase.from('documents').insert(docPayload);
            if (error) throw error;
            onAddDocument({ ...docPayload, id: 'temp', fileUrl: '', uploadDate: 0 } as any);
        }

        handleCloseModal();

      } catch (error: any) {
        console.error('Upload error:', error);
        alert("Failed to save document: " + error.message);
      } finally {
        setIsScanning(false);
      }
    }
  };

  const handleSkip = () => {
      setSelectedImage(null);
      setSelectedPages([]);
      setSelectedFileName('');
      setScanResult(null);
      setDuplicateWarning(null);
      if (uploadQueue.length === 0) handleCloseModal();
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedImage(null);
    setSelectedPages([]);
    setSelectedFileName('');
    setScanResult(null);
    setIsScanning(false);
    setEditingId(null);
    setIsCameraOpen(false);
    setCameraError(null);
    setDuplicateWarning(null);
    setUploadQueue([]); 
    setIsMergePromptOpen(false);
    setMergeRejected(false);
  };
  
  const requestDelete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (readOnly) return;
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      if (isMockMode) {
         onDeleteDocument(deleteId);
         if (viewingDoc && viewingDoc.id === deleteId) {
            setViewingDoc(null);
         }
         setDeleteId(null);
         return;
      }
      try {
        const { error } = await supabase.from('documents').delete().eq('id', deleteId);
        if (error) throw error;
        onDeleteDocument(deleteId);
        if (viewingDoc && viewingDoc.id === deleteId) {
            setViewingDoc(null);
        }
      } catch (error) {
        console.error("Delete failed", error);
        alert("Failed to delete document");
      }
      setDeleteId(null);
    }
  };

  const handleViewClick = (doc: MarinerDocument) => {
    setViewingDoc(doc);
  };

  const handleCloseView = () => {
    setViewingDoc(null);
  };

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const getExpiryStatus = (dateString: string) => {
    if (!dateString || dateString === 'N/A') return { label: 'No Expiry', color: 'text-slate-500', bg: 'bg-slate-100' };
    const today = new Date();
    const expiry = new Date(dateString);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'Expired', color: 'text-red-700', bg: 'bg-red-100' };
    if (diffDays <= 90) return { label: 'Expiring Soon', color: 'text-amber-700', bg: 'bg-amber-100' };
    return { label: 'Valid', color: 'text-green-700', bg: 'bg-green-100' };
  };

  const isExpired = (dateString: string) => {
     if (!dateString) return false;
     return new Date(dateString) < new Date();
  };

  // Helper to determine preview content
  const renderPreview = () => {
    if (!selectedImage) return null;
    const isImage = selectedImage.startsWith('data:image/') || selectedImage.startsWith('http');
    
    // Check if showing a merged document in preview (edit mode)
    const showPageCount = selectedPages.length > 1;

    if (isImage) {
        return (
            <div className="relative rounded-xl overflow-hidden bg-slate-900 shadow-inner group w-full">
                <img src={selectedImage} alt="Preview" className={`w-full h-64 object-contain transition-all duration-500 ${isEnhanced ? 'contrast-125 grayscale-[0.2]' : ''}`} />
                {!isScanning && (
                  <button onClick={() => setIsEnhanced(!isEnhanced)} className={`absolute bottom-3 right-3 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md transition-colors ${isEnhanced ? 'bg-blue-600/90 text-white' : 'bg-black/50 text-white'}`}>
                    {isEnhanced ? 'Scan Filter: ON' : 'Original'}
                  </button>
                )}
                {showPageCount && (
                   <div className="absolute top-3 right-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-white text-xs font-bold flex items-center">
                      <Layers className="w-3 h-3 mr-1" /> {selectedPages.length} Pages
                   </div>
                )}
            </div>
        );
    }
    let Icon = File;
    let typeLabel = "Document";
    if (selectedImage.includes('application/pdf')) { Icon = FileText; typeLabel = "PDF Document"; } 
    else if (selectedImage.includes('spreadsheet') || selectedImage.includes('excel')) { Icon = FileSpreadsheet; typeLabel = "Spreadsheet"; }

    return (
        <div className="w-full h-64 flex flex-col items-center justify-center bg-slate-100 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 relative overflow-hidden">
             <div className="absolute inset-0 bg-slate-50 opacity-50 pattern-grid-lg"></div>
             <div className="z-10 flex flex-col items-center p-6 text-center">
                 <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4"><Icon className="w-10 h-10 text-blue-500" /></div>
                 <h4 className="text-lg font-bold text-slate-700 mb-1">{typeLabel}</h4>
                 <p className="text-sm text-slate-400 max-w-[200px] truncate">{selectedFileName}</p>
             </div>
        </div>
    );
  };
  
  // Helper to render the hover preview content
  const renderHoverPreview = (doc: MarinerDocument) => {
     const isImage = doc.fileUrl.startsWith('data:image/') || doc.fileUrl.startsWith('http');
     let Icon = File;
     if (doc.fileUrl.includes('application/pdf')) Icon = FileText;
     else if (doc.fileUrl.includes('spreadsheet') || doc.fileUrl.includes('excel')) Icon = FileSpreadsheet;

     return (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover/preview:block z-50 animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
           <div className="bg-white p-2 rounded-xl shadow-2xl border border-slate-200 w-48 flex flex-col items-center">
              {isImage ? (
                  <div className="w-full h-32 bg-slate-100 rounded-lg overflow-hidden relative">
                    <img src={doc.fileUrl} alt={doc.title} className="w-full h-full object-cover" />
                    {doc.pages && doc.pages.length > 1 && (
                      <div className="absolute bottom-1 right-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white flex items-center">
                        <Layers className="w-2.5 h-2.5 mr-1" /> {doc.pages.length}
                      </div>
                    )}
                  </div>
              ) : (
                  <div className="w-full h-32 bg-slate-50 rounded-lg flex flex-col items-center justify-center border border-slate-100 relative overflow-hidden">
                     <div className="absolute inset-0 bg-slate-100 opacity-30 pattern-grid-lg"></div>
                     <Icon className="w-10 h-10 text-blue-500 mb-2 relative z-10" />
                     <span className="text-[10px] text-slate-500 font-medium relative z-10 px-2 text-center truncate w-full">{doc.category}</span>
                  </div>
              )}
              <div className="mt-2 text-center w-full"><p className="text-xs font-semibold text-slate-800 truncate px-1">{doc.title}</p></div>
           </div>
           <div className="w-3 h-3 bg-white border-b border-r border-slate-200 transform rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2 shadow-sm"></div>
        </div>
     );
  };

  const renderViewContent = () => {
    if (!viewingDoc) return null;

    // Handle Merged Documents (Multi-page images)
    if (viewingDoc.pages && viewingDoc.pages.length > 1) {
        const currentPageUrl = viewingDoc.pages[viewPage] || viewingDoc.fileUrl;
        return (
          <div className="flex flex-col items-center w-full h-full">
             <div className="flex-1 w-full flex items-center justify-center p-4 relative">
                <img src={currentPageUrl} alt={`Page ${viewPage + 1}`} className="max-w-full max-h-full object-contain shadow-2xl" />
                
                {/* Navigation Arrows */}
                <button 
                  onClick={(e) => { e.stopPropagation(); setViewPage(p => Math.max(0, p - 1)); }}
                  disabled={viewPage === 0}
                  className="absolute left-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 transition-all"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setViewPage(p => Math.min((viewingDoc.pages?.length || 1) - 1, p + 1)); }}
                  disabled={viewPage === ((viewingDoc.pages?.length || 1) - 1)}
                  className="absolute right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 transition-all"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
             </div>
             
             {/* Pagination Dots */}
             <div className="h-12 flex items-center justify-center space-x-2 bg-white/10 backdrop-blur-md rounded-full px-4 mb-4 border border-white/10">
                {viewingDoc.pages.map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setViewPage(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${idx === viewPage ? 'bg-blue-400 w-4' : 'bg-white/50 hover:bg-white'}`}
                  />
                ))}
             </div>
          </div>
        );
    }

    // Single Image
    if (viewingDoc.fileUrl.startsWith('data:image/') || viewingDoc.fileUrl.startsWith('http')) {
       return <img src={viewingDoc.fileUrl} alt={viewingDoc.title} className="max-w-full max-h-full object-contain p-4 shadow-2xl" />;
    }

    // PDF View
    if (viewingDoc.fileUrl.includes('application/pdf') || viewingDoc.fileUrl.toLowerCase().endsWith('.pdf')) {
       return (
         <div className="flex flex-col items-center justify-center w-full p-4 overflow-y-auto">
            <Document file={viewingDoc.fileUrl} onLoadSuccess={onDocumentLoadSuccess} loading={<div className="flex flex-col items-center space-y-3 p-8"><Loader2 className="animate-spin w-8 h-8 text-blue-500" /><span className="text-white text-sm">Loading PDF Document...</span></div>} error={<div className="flex flex-col items-center justify-center h-full text-white/80 space-y-4"><div className="p-6 bg-red-500/10 rounded-full backdrop-blur-sm"><AlertTriangle className="w-16 h-16 text-red-400" /></div><p className="text-lg font-medium">Failed to load PDF.</p><a href={viewingDoc.fileUrl} download={`${viewingDoc.title}.pdf`} className="px-6 py-2.5 bg-white text-slate-900 rounded-lg font-bold shadow-lg flex items-center"><Download className="w-5 h-5 mr-2" /> Download Instead</a></div>} className="shadow-2xl rounded-lg overflow-hidden">
              <Page pageNumber={pdfPageNumber} width={containerWidth} renderTextLayer={false} renderAnnotationLayer={false} className="bg-white"/>
            </Document>
            {numPages && numPages > 1 && (
              <div className="fixed bottom-24 sm:bottom-8 z-50 flex items-center space-x-4 bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-full shadow-2xl border border-white/10 text-white animate-in slide-in-from-bottom-5">
                <button disabled={pdfPageNumber <= 1} onClick={() => setPdfPageNumber(p => p - 1)} className="p-1 hover:bg-white/20 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors"><ChevronLeft className="w-6 h-6" /></button>
                <span className="text-sm font-medium tabular-nums tracking-wide">{pdfPageNumber} <span className="text-white/50">/</span> {numPages}</span>
                <button disabled={pdfPageNumber >= numPages} onClick={() => setPdfPageNumber(p => p + 1)} className="p-1 hover:bg-white/20 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors"><ChevronRight className="w-6 h-6" /></button>
              </div>
            )}
         </div>
       );
    }
    let Icon = File;
    if (viewingDoc.fileUrl.includes('spreadsheet') || viewingDoc.fileUrl.includes('excel')) Icon = FileSpreadsheet;
    return (
       <div className="flex flex-col items-center justify-center p-12 text-white/90">
          <div className="p-8 bg-white/10 rounded-3xl backdrop-blur-md mb-6 border border-white/10"><Icon className="w-24 h-24 text-blue-300" /></div>
          <p className="text-xl font-medium mb-2">{viewingDoc.title}</p>
          <p className="text-sm opacity-70 mb-8 max-w-md text-center">This file format cannot be previewed directly in the browser.</p>
          <a href={viewingDoc.fileUrl} download={viewingDoc.title} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold transition-all hover:scale-105 flex items-center shadow-lg shadow-blue-900/50"><Download className="w-5 h-5 mr-2" /> Download File</a>
       </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in relative min-h-[500px]">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">My Documents</h2>
          <p className="text-sm text-slate-500">{documents.length} files stored</p>
        </div>
        {!readOnly && (
          <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-transform active:scale-95 self-end sm:self-auto">
            <Plus className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border ${
              activeFilter === cat ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Expiry Filters (Only for "All" tab) */}
      {activeFilter === 'All' && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 animate-in fade-in slide-in-from-top-1">
          {(['all', 'expired', '1m', '3m', '6m', '12m'] as const).map(filter => (
             <button
                key={filter}
                onClick={() => setActiveExpiryFilter(filter)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                  activeExpiryFilter === filter
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
             >
                {filter === 'all' ? 'All Dates' : filter === 'expired' ? 'Expired' : `< ${filter.toUpperCase()}`}
             </button>
          ))}
        </div>
      )}

      {/* Document Content */}
      {activeFilter === 'All' ? (
        // SIMPLIFIED LIST VIEW FOR 'ALL' TAB
        <div className="space-y-3">
          {filteredDocuments.map((doc) => {
             const status = getExpiryStatus(doc.expiryDate);
             const isImage = doc.fileUrl.startsWith('data:image/') || doc.fileUrl.startsWith('http');
             const CategoryIcon = getCategoryIcon(doc.category);

             return (
               <div key={doc.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 hover:shadow-md transition-shadow flex items-center gap-4 group cursor-pointer" onClick={() => handleViewClick(doc)}>
                 {/* Thumbnail Icon */}
                 <div className="w-12 h-12 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200 relative">
                    {isImage ? (
                      <img src={doc.fileUrl} className="w-full h-full object-cover" alt="thumb" />
                    ) : (
                      <CategoryIcon className="w-6 h-6 text-slate-400" />
                    )}
                    {doc.pages && doc.pages.length > 1 && (
                      <div className="absolute bottom-0 right-0 bg-black/60 text-white px-1 text-[8px] font-bold rounded-tl">
                        {doc.pages.length}
                      </div>
                    )}
                 </div>

                 {/* Main Info */}
                 <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800 truncate">{doc.title}</h3>
                    <div className="flex items-center text-xs text-slate-500 mt-0.5 space-x-2">
                       <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                          <CategoryIcon className="w-3 h-3 text-slate-500" />
                          {doc.category}
                       </span>
                       <span className="font-mono text-[10px]">{doc.documentNumber || 'N/A'}</span>
                    </div>
                 </div>

                 {/* Expiry Info */}
                 <div className="text-right flex-shrink-0">
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${status.bg} ${status.color}`}>
                       {status.label}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 hidden sm:block">
                       {doc.expiryDate}
                    </div>
                 </div>

                 {/* Actions */}
                 {!readOnly && (
                   <div className="flex items-center gap-1 pl-2 border-l border-slate-100 ml-2">
                      <button onClick={(e) => handleEditClick(doc, e)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"><Edit className="w-4 h-4" /></button>
                      <button onClick={(e) => requestDelete(doc.id, e)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"><Trash2 className="w-4 h-4" /></button>
                   </div>
                 )}
               </div>
             );
          })}
        </div>
      ) : (
        // GRID VIEW FOR SPECIFIC CATEGORIES
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDocuments.map((doc) => {
             const status = getExpiryStatus(doc.expiryDate);
             const CategoryIcon = getCategoryIcon(doc.category);
             const isImage = doc.fileUrl.startsWith('data:image/') || doc.fileUrl.startsWith('http');

             return (
              <div key={doc.id} className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow group relative">
                <div className="flex p-3">
                  <div className="relative group/preview">
                    <div className="w-20 h-24 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200 relative flex items-center justify-center cursor-pointer active:scale-95 transition-transform" onClick={() => handleViewClick(doc)}>
                      {isImage ? <img src={doc.fileUrl} alt={doc.title} className="w-full h-full object-cover" /> : <CategoryIcon className="w-8 h-8 text-slate-400" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-1">
                        <span className="text-[10px] text-white font-medium"><Eye className="w-4 h-4" /></span>
                      </div>
                    </div>
                    {renderHoverPreview(doc)}
                  </div>
                  
                  <div className="ml-4 flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-slate-800 truncate pr-2 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleViewClick(doc)}>{doc.title}</h3>
                      {!readOnly && (
                        <div className="flex space-x-1">
                          <button onClick={(e) => handleEditClick(doc, e)} className="text-slate-400 hover:text-blue-500 p-1"><Edit className="w-4 h-4" /></button>
                          <button onClick={(e) => requestDelete(doc.id, e)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center mt-0.5 mb-2">
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200 flex items-center gap-1">
                            <CategoryIcon className="w-3 h-3" />
                            {doc.category}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center mb-1"><Hash className="w-3 h-3 mr-1" /> {doc.documentNumber || 'N/A'}</p>
                    <div className="flex items-center">
                       <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${status.bg} ${status.color}`}>{status.label}</span>
                       <span className="text-xs text-slate-500 ml-2">{doc.expiryDate || 'No Expiry'}</span>
                    </div>
                  </div>
                </div>
              </div>
             );
          })}
        </div>
      )}
      
      {filteredDocuments.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
             <Filter className="w-12 h-12 mb-3 opacity-30" />
             <p>No documents found.</p>
             {activeFilter !== 'All' && <button onClick={() => setActiveFilter('All')} className="text-sm text-blue-600 hover:underline mt-2">View All Documents</button>}
          </div>
      )}

      {/* View Document Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md" onClick={handleCloseView}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 z-10 shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 bg-blue-100 rounded-lg">{viewingDoc.fileUrl.startsWith('data:image/') || viewingDoc.fileUrl.startsWith('http') ? <Camera className="w-5 h-5 text-blue-600"/> : <FileText className="w-5 h-5 text-blue-600"/>}</div>
                  <div className="min-w-0"><h3 className="text-lg font-bold text-slate-800 truncate">{viewingDoc.title}</h3><span className="text-xs text-slate-500 uppercase font-semibold tracking-wider">{viewingDoc.category}</span></div>
                </div>
                <div className="flex items-center space-x-2">
                  <a href={viewingDoc.fileUrl} download={viewingDoc.title} className="p-2 rounded-full hover:bg-slate-200 transition-colors text-slate-500" title="Download"><Download className="w-5 h-5" /></a>
                  {!readOnly && <button onClick={() => requestDelete(viewingDoc.id)} className="p-2 rounded-full hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors" title="Delete"><Trash className="w-5 h-5" /></button>}
                  <div className="w-px h-6 bg-slate-200 mx-1"></div>
                  <button onClick={handleCloseView} className="p-2 rounded-full hover:bg-slate-200 transition-colors text-slate-500"><X className="w-6 h-6" /></button>
                </div>
             </div>
             <div className="flex-1 overflow-y-auto bg-slate-900 flex items-start justify-center min-h-[300px] relative scrollbar-hide">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none"></div>
                {renderViewContent()}
             </div>
             <div className="p-4 bg-white border-t border-slate-100 shrink-0">
               <div className="grid grid-cols-2 gap-4 sm:flex sm:justify-around">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex-1 text-center">
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Document Number</p>
                    <p className="text-sm font-bold text-slate-700 font-mono">{viewingDoc.documentNumber || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex-1 text-center">
                     <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Expiry Date</p>
                     <p className={`text-sm font-bold ${isExpired(viewingDoc.expiryDate) ? 'text-red-600' : 'text-slate-700'}`}>{viewingDoc.expiryDate || 'N/A'}</p>
                  </div>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Merge Prompt Modal */}
      {isMergePromptOpen && (
         <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsMergePromptOpen(false)}></div>
            <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-200">
               <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-600"><Merge className="w-6 h-6" /></div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">Merge Documents?</h3>
                  <p className="text-slate-500 text-sm mb-6">You have {uploadQueue.length} items queued. Do you want to merge them into a single multi-page document?</p>
                  <div className="flex gap-3 w-full">
                     <button onClick={handleMergeReject} className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center"><Copy className="w-4 h-4 mr-2"/> No, Individual</button>
                     <button onClick={handleMergeConfirm} className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow-md transition-colors flex items-center justify-center"><Merge className="w-4 h-4 mr-2"/> Yes, Merge</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDeleteId(null)}></div>
            <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4"><Trash2 className="w-6 h-6 text-red-600" /></div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Delete Document?</h3>
                    <p className="text-slate-500 text-sm mb-6">Are you sure you want to delete this document? This action cannot be undone.</p>
                    <div className="flex gap-3 w-full">
                        <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">Cancel</button>
                        <button onClick={confirmDelete} className="flex-1 py-2.5 px-4 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 shadow-md transition-colors">Delete</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Upload/Scan Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={handleCloseModal}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {isCameraOpen ? (
               // In-App Camera UI
               <div className="absolute inset-0 bg-black z-50 flex flex-col">
                 <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
                   {cameraError ? (
                     <div className="text-center p-6 max-w-sm">
                       <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8 text-red-600" /></div>
                       <h3 className="text-white text-lg font-bold mb-2">Camera Error</h3>
                       <p className="text-slate-400 text-sm mb-6">{cameraError}</p>
                       <div className="flex gap-3 justify-center">
                         <button onClick={() => setIsCameraOpen(false)} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 transition-colors">Close</button>
                         <button onClick={() => { setCameraError(null); setIsCameraOpen(false); setTimeout(() => setIsCameraOpen(true), 100); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center"><RefreshCw className="w-4 h-4 mr-2" /> Retry</button>
                       </div>
                     </div>
                   ) : (
                     <>
                       <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                       <div className="absolute inset-0 border-[40px] border-black/30 pointer-events-none">
                          <div className="w-full h-full border-2 border-white/50 rounded-lg relative shadow-2xl">
                              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white"></div>
                              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white"></div>
                              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white"></div>
                              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white"></div>
                          </div>
                       </div>
                       <div className="absolute top-4 left-0 right-0 text-center pointer-events-none">
                          <span className="bg-black/50 text-white text-xs px-3 py-1 rounded-full backdrop-blur-md flex items-center justify-center inline-flex gap-2">
                             <ScanLine className="w-3 h-3" /> Align document or QR code
                          </span>
                       </div>
                       {uploadQueue.length > 0 && (<div className="absolute bottom-32 left-0 right-0 flex justify-center pointer-events-none"><div className="bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 animate-in slide-in-from-bottom-2"><Layers className="w-4 h-4" /><span className="font-bold">{uploadQueue.length} Captured</span></div></div>)}
                     </>
                   )}
                 </div>
                 {!cameraError && (
                   <div className="h-28 bg-black flex items-center justify-around px-6 pb-4">
                     <button onClick={() => setIsCameraOpen(false)} className="text-white p-3 hover:bg-white/10 rounded-full transition-colors flex flex-col items-center min-w-[60px]"><span className="text-sm font-medium">{uploadQueue.length > 0 ? 'Done' : 'Cancel'}</span></button>
                     <button onClick={capturePhoto} className="w-16 h-16 bg-white rounded-full border-4 border-slate-300 shadow-lg active:scale-90 transition-transform flex items-center justify-center"><div className="w-14 h-14 bg-white rounded-full border-2 border-slate-900"></div></button>
                     <button onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')} className="text-white p-3 hover:bg-white/10 rounded-full transition-colors flex flex-col items-center min-w-[60px]"><SwitchCamera className="w-6 h-6" /></button>
                   </div>
                 )}
                 <canvas ref={canvasRef} className="hidden" />
               </div>
            ) : (
              // Standard Upload UI
              <>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Edit Document' : 'Add Document'}</h3>
                    {uploadQueue.length > 0 && (<span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">{uploadQueue.length} More Pending</span>)}
                  </div>
                  <button onClick={handleCloseModal} className="p-1 rounded-full hover:bg-slate-100"><X className="w-6 h-6 text-slate-500" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {!selectedImage ? (
                    <div className="space-y-4 py-8">
                      <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setIsCameraOpen(true)} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-blue-200 rounded-2xl bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors group">
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3 text-blue-600 group-hover:scale-110 transition-transform"><Camera className="w-6 h-6" /></div>
                          <span className="font-semibold text-blue-900 text-sm">Take Photo</span>
                          <span className="text-[10px] text-blue-500 mt-1 text-center">Document Camera</span>
                        </button>
                        <button onClick={() => setIsCameraOpen(true)} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-indigo-200 rounded-2xl bg-indigo-50 cursor-pointer hover:bg-indigo-100 transition-colors group relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-2 opacity-10"><QrCode className="w-24 h-24 text-indigo-500" /></div>
                          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-3 text-indigo-600 group-hover:scale-110 transition-transform z-10"><ScanLine className="w-6 h-6" /></div>
                          <span className="font-semibold text-indigo-900 text-sm z-10">Scan QR Code</span>
                          <span className="text-[10px] text-indigo-500 mt-1 text-center z-10">Auto-fill Details</span>
                        </button>
                      </div>
                      
                      <div className="relative flex py-2 items-center"><div className="flex-grow border-t border-slate-200"></div><span className="flex-shrink-0 mx-4 text-slate-400 text-xs uppercase">Or upload file</span><div className="flex-grow border-t border-slate-200"></div></div>
                      <label className="flex flex-col items-center justify-center p-6 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                        <Upload className="w-6 h-6 text-slate-500 mb-2" />
                        <span className="text-sm font-medium text-slate-700">Choose from Gallery</span>
                        <p className="text-xs text-slate-400 mt-1">Images, PDF, Doc, Excel (Bulk Supported)</p>
                        <input type="file" multiple accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleFileSelect} />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="relative">
                        {renderPreview()}
                        {isScanning && (<div className="absolute inset-0 z-10 rounded-xl overflow-hidden"><div className="absolute inset-x-0 h-1 bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div><div className="absolute inset-0 bg-blue-500/10"></div><div className="absolute bottom-4 left-0 right-0 text-center"><span className="inline-block px-3 py-1 bg-black/50 backdrop-blur-md rounded-full text-white text-xs font-medium animate-pulse">Scanning Document & QR...</span></div></div>)}
                      </div>
                      {duplicateWarning && (<div className="flex items-start p-4 bg-amber-50 border border-amber-200 rounded-lg animate-in fade-in slide-in-from-top-2"><AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 mr-3 flex-shrink-0" /><div><h4 className="text-sm font-bold text-amber-800">Duplicate Detected</h4><p className="text-sm text-amber-700 mt-1">{duplicateWarning}</p><p className="text-xs text-amber-600 mt-1">Click save again to confirm and store it anyway.</p></div></div>)}
                      <div className="space-y-4">
                        <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Document Name</label><div className="flex items-center border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 bg-slate-50"><FileText className="w-5 h-5 text-slate-400 ml-3" /><input type="text" value={scanResult?.title || ''} onChange={(e) => setScanResult(prev => prev ? {...prev, title: e.target.value} : null)} placeholder="e.g. CDC Book" className="w-full p-3 bg-transparent outline-none text-slate-800" disabled={isScanning} /></div></div>
                        <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Category</label><div className="relative"><select value={scanResult?.category || DocumentCategory.OTHER} onChange={(e) => setScanResult(prev => prev ? {...prev, category: e.target.value} : null)} className="w-full p-3 pl-4 rounded-lg border border-slate-300 bg-slate-50 outline-none appearance-none" disabled={isScanning}>{Object.values(DocumentCategory).map(cat => (<option key={cat} value={cat}>{cat}</option>))}</select><div className="absolute right-3 top-3 pointer-events-none"><svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></div></div></div>
                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Doc Number</label><div className="flex items-center border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 bg-slate-50"><Hash className="w-4 h-4 text-slate-400 ml-3" /><input type="text" value={scanResult?.number || ''} onChange={(e) => setScanResult(prev => prev ? {...prev, number: e.target.value} : null)} placeholder="X00000" className="w-full p-3 bg-transparent outline-none text-slate-800" disabled={isScanning} /></div></div>
                          <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Expiry Date</label><div className="flex items-center border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 bg-slate-50"><Calendar className="w-4 h-4 text-slate-400 ml-3" /><input type="date" value={scanResult?.expiry || ''} onChange={(e) => setScanResult(prev => prev ? {...prev, expiry: e.target.value} : null)} className="w-full p-3 bg-transparent outline-none text-slate-800" disabled={isScanning} /></div></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50">
                  {selectedImage ? (
                    <div className="flex gap-3">
                      <button onClick={uploadQueue.length > 0 ? handleSkip : () => { setSelectedImage(null); setSelectedFileName(''); setScanResult(null); setEditingId(null); setDuplicateWarning(null); }} className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-100 transition-colors" disabled={isScanning}>{uploadQueue.length > 0 ? 'Skip' : (editingId ? 'Change File' : 'Retake')}</button>
                      <button onClick={handleSave} disabled={isScanning || !scanResult?.title} className={`flex-[2] py-3 px-4 rounded-xl text-white font-semibold shadow-md transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center ${duplicateWarning ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>{isScanning ? (<Loader2 className="w-5 h-5 animate-spin" />) : duplicateWarning ? (<><Check className="w-5 h-5 mr-2" /> Confirm Save</>) : (<><Check className="w-5 h-5 mr-2" /> {uploadQueue.length > 0 ? 'Save & Next' : (editingId ? 'Save Changes' : 'Save Document')}</>)}</button>
                    </div>
                  ) : (<button onClick={handleCloseModal} className="w-full py-3 text-slate-500 hover:text-slate-800 font-medium">Cancel</button>)}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .pattern-grid-lg {
            background-image: linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px);
            background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
};