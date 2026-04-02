import { motion, AnimatePresence } from "motion/react";
import { UploadCloud, X, FileText, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useTicketUpload } from "../../hooks/useTicketUpload";

interface TicketUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  itineraryId?: string;
}

export function TicketUploadModal({ isOpen, onClose, itineraryId }: TicketUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { uploadAndParse, uploading, result } = useTicketUpload();

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (itineraryId) {
      uploadAndParse(file, itineraryId);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-bg-deepest/80 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl glass-panel rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="p-4 border-b border-border-divider flex items-center justify-between bg-bg-surface/50">
            <h2 className="text-lg font-display font-bold text-text-primary">
              Upload Flight Tickets
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            <div
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center transition-all duration-200 ${
                isDragging
                  ? "border-accent-blue bg-accent-blue/5"
                  : "border-border-divider hover:border-text-muted hover:bg-bg-elevated/30"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
            >
              <div className="w-16 h-16 rounded-full bg-bg-elevated flex items-center justify-center mb-4 shadow-inner">
                <UploadCloud
                  className={`w-8 h-8 ${isDragging ? "text-accent-blue" : "text-text-secondary"}`}
                />
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-2">
                Drag & drop tickets here
              </h3>
              <p className="text-sm text-text-muted mb-6 max-w-sm">
                Supports CSV files with flight itinerary data.
              </p>
              <label className="glass-button px-6 py-2.5 rounded-lg text-sm font-medium text-text-primary cursor-pointer">
                Browse Files
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            </div>

            {uploading && (
              <div className="mt-6">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-text-secondary flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Parsing itineraries...
                  </span>
                </div>
                <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "65%" }}
                    className="h-full bg-accent-blue rounded-full shadow-[0_0_10px_rgba(43,108,255,0.5)]"
                  />
                </div>
              </div>
            )}

            {result && (
              <div className="mt-6 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="w-4 h-4" />
                Parsed {result.parsed} flight legs successfully
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border-divider bg-bg-surface/50 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button className="px-6 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white shadow-[0_0_15px_rgba(43,108,255,0.4)] hover:bg-accent-blue/90 transition-all flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Import Tickets
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
