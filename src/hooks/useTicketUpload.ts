import { useState } from "react";
import { supabase } from "../lib/supabase";

export function useTicketUpload() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ parsed: number; legs: unknown[] } | null>(null);

  const uploadAndParse = async (file: File, itineraryId: string) => {
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .single();

      const path = `${profile!.company_id}/${itineraryId}/${file.name}`;

      const { error: uploadErr } = await supabase.storage.from("tickets").upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data, error } = await supabase.functions.invoke("parse-ticket", {
        body: { itinerary_id: itineraryId, file_path: path },
      });
      if (error) throw error;

      setResult(data);
      return data;
    } finally {
      setUploading(false);
    }
  };

  return { uploadAndParse, uploading, result };
}
