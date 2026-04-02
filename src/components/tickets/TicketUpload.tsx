import { useCallback, useState } from "react";
import { Upload, Check } from "lucide-react";
import { useTicketUpload } from "../../hooks/useTicketUpload";

export function TicketUpload({ itineraryId }: { itineraryId: string }) {
  const { uploadAndParse, uploading, result } = useTicketUpload();
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      uploadAndParse(file, itineraryId);
    },
    [uploadAndParse, itineraryId]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-500/10"
            : "border-gray-700 hover:border-gray-600"
        }`}
      >
        {uploading ? (
          <div className="text-sm text-gray-400">Parsing ticket...</div>
        ) : (
          <>
            <Upload size={24} className="mx-auto text-gray-500 mb-2" />
            <p className="text-sm text-gray-400">
              Drop a ticket CSV here or{" "}
              <label className="text-blue-400 cursor-pointer hover:underline">
                browse
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            </p>
          </>
        )}
      </div>

      {result && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-3 flex items-center gap-2">
          <Check size={16} className="text-green-400" />
          <span className="text-sm text-green-400">
            Parsed {result.parsed} flight legs
          </span>
        </div>
      )}
    </div>
  );
}
