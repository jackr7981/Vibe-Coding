import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Shield, Phone,
  User, AlertTriangle, CheckCircle, Clock,
  MapPin, Heart, Star, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { format, differenceInDays, parseISO } from "date-fns";
import type { CrewMember } from "../../lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface CrewDocument {
  id: string;
  document_type: string;
  document_name: string;
  document_number: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  is_verified: boolean;
}

type ExtendedCrew = Omit<CrewMember, "emergency_contact" | "metadata"> & {
  emergency_contact: { name?: string; phone?: string; relation?: string } | null;
  metadata: { readiness_date?: string; preferences?: string } | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  home: "#34D399", on_board: "#60A5FA",
  in_transit: "#FBBF24", at_airport: "#F97316", at_port: "#A78BFA",
};
const STATUS_LABELS: Record<string, string> = {
  home: "At Home", on_board: "On Board",
  in_transit: "In Transit", at_airport: "At Airport", at_port: "At Port",
};

const DOC_CATEGORY: Record<string, "identity" | "visa" | "certificate"> = {
  passport: "identity", cdc: "identity",
  visa: "visa", flag_endorsement: "visa",
  stcw_basic: "certificate", stcw_advanced: "certificate",
  gmdss: "certificate", medical_fitness: "certificate",
  medical_first_aid: "certificate", proficiency_survival: "certificate",
  advanced_firefighting: "certificate", security_awareness: "certificate",
  yellow_fever: "certificate", drug_alcohol_test: "certificate",
  tanker_familiarization: "certificate", lng_tanker: "certificate",
  igs_tanker: "certificate", other: "certificate",
};

const DOC_LABELS: Record<string, string> = {
  passport: "Passport",
  cdc: "Continuous Discharge Certificate",
  visa: "Visa",
  flag_endorsement: "Flag State Endorsement",
  stcw_basic: "STCW Basic Safety Training",
  stcw_advanced: "STCW Advanced Training",
  gmdss: "GMDSS General Operator",
  medical_fitness: "ENG1 Medical Certificate",
  medical_first_aid: "Medical First Aid",
  proficiency_survival: "Proficiency in Survival Craft",
  advanced_firefighting: "Advanced Fire Fighting",
  security_awareness: "Security Awareness",
  yellow_fever: "Yellow Fever Vaccination",
  drug_alcohol_test: "Drug & Alcohol Test",
  tanker_familiarization: "Tanker Familiarization",
  lng_tanker: "LNG Tanker Certificate",
  igs_tanker: "IGS Tanker Certificate",
  other: "Other Document",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function expiryBadge(expiryDate: string | null) {
  if (!expiryDate) {
    return { label: "No expiry", textColor: "#7a8ba8", bg: "rgba(122,139,168,0.08)", border: "rgba(122,139,168,0.2)", icon: null };
  }
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0)
    return { label: "EXPIRED", textColor: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.35)", icon: "expired" };
  if (days <= 30)
    return { label: `${days}d left — critical`, textColor: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.35)", icon: "critical" };
  if (days <= 90)
    return { label: `${days}d left — expiring soon`, textColor: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.35)", icon: "warning" };
  return {
    label: `Valid · ${Math.floor(days / 30)} months`,
    textColor: "#34d399", bg: "rgba(52,211,153,0.07)", border: "rgba(52,211,153,0.25)", icon: "valid",
  };
}

function ExpiryIcon({ icon }: { icon: string | null }) {
  if (icon === "expired")   return <AlertTriangle className="w-3 h-3" style={{ color: "#ef4444" }} />;
  if (icon === "critical")  return <Clock className="w-3 h-3" style={{ color: "#f97316" }} />;
  if (icon === "warning")   return <Clock className="w-3 h-3" style={{ color: "#fbbf24" }} />;
  if (icon === "valid")     return <CheckCircle className="w-3 h-3" style={{ color: "#34d399" }} />;
  return null;
}

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border-divider last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-bg-elevated/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-[11px] font-mono font-semibold uppercase tracking-widest text-text-secondary">
          {icon}
          {title}
        </div>
        {open
          ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
          : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DocRow({ doc }: { doc: CrewDocument }) {
  const badge = expiryBadge(doc.expiry_date);
  const label = DOC_LABELS[doc.document_type] ?? doc.document_name;

  return (
    <div
      className="rounded-lg p-3 mb-2 last:mb-0"
      style={{ background: badge.bg, border: `1px solid ${badge.border}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold text-text-primary truncate">{label}</span>
            {doc.is_verified && (
              <span className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }}>
                Verified
              </span>
            )}
          </div>
          {doc.document_number && (
            <div className="text-[10px] font-mono text-text-secondary">{doc.document_number}</div>
          )}
          {doc.issuing_authority && (
            <div className="text-[10px] text-text-muted mt-0.5 truncate">{doc.issuing_authority}</div>
          )}
          {doc.issue_date && doc.expiry_date && (
            <div className="text-[10px] font-mono text-text-muted mt-1">
              {format(parseISO(doc.issue_date), "dd MMM yyyy")} — {format(parseISO(doc.expiry_date), "dd MMM yyyy")}
            </div>
          )}
        </div>
        {/* Expiry badge */}
        <div
          className="flex items-center gap-1 shrink-0 text-[10px] font-mono font-semibold rounded px-2 py-1"
          style={{ color: badge.textColor, background: "rgba(0,0,0,0.15)", border: `1px solid ${badge.border}` }}
        >
          <ExpiryIcon icon={badge.icon} />
          <span>{badge.label}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  crewId: string | null;
  onClose: () => void;
}

export function CrewProfilePanel({ crewId, onClose }: Props) {
  const [crew, setCrew] = useState<ExtendedCrew | null>(null);
  const [documents, setDocuments] = useState<CrewDocument[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!crewId) { setCrew(null); setDocuments([]); return; }
    setLoading(true);

    const fetchAll = async () => {
      const [crewRes, docsRes] = await Promise.all([
        supabase
          .from("crew_with_coords")
          .select("*")
          .eq("id", crewId)
          .single(),
        supabase
          .from("crew_documents")
          .select("id, document_type, document_name, document_number, issuing_authority, issue_date, expiry_date, is_verified")
          .eq("crew_member_id", crewId)
          .order("document_type"),
      ]);

      if (crewRes.data) setCrew(crewRes.data as unknown as ExtendedCrew);
      if (docsRes.data) setDocuments(docsRes.data as CrewDocument[]);
      setLoading(false);
    };
    fetchAll();
  }, [crewId]);

  const identity = documents.filter((d) => DOC_CATEGORY[d.document_type] === "identity");
  const visas    = documents.filter((d) => DOC_CATEGORY[d.document_type] === "visa");
  const certs    = documents.filter((d) => DOC_CATEGORY[d.document_type] === "certificate");

  // Document compliance summary
  const expired  = documents.filter((d) => d.expiry_date && differenceInDays(parseISO(d.expiry_date), new Date()) < 0).length;
  const critical = documents.filter((d) => d.expiry_date && differenceInDays(parseISO(d.expiry_date), new Date()) <= 30 && differenceInDays(parseISO(d.expiry_date), new Date()) >= 0).length;
  const warning  = documents.filter((d) => d.expiry_date && differenceInDays(parseISO(d.expiry_date), new Date()) <= 90 && differenceInDays(parseISO(d.expiry_date), new Date()) > 30).length;

  const statusColor = crew ? STATUS_COLORS[crew.current_status] : "#60A5FA";
  const initials = crew?.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2) ?? "";

  const contractDays = crew?.contract_end_date
    ? differenceInDays(parseISO(crew.contract_end_date), new Date())
    : null;

  const readinessDate = (crew?.metadata as { readiness_date?: string } | null)?.readiness_date;
  const preferences  = (crew?.metadata as { preferences?: string } | null)?.preferences;
  const emergencyContact = crew?.emergency_contact as { name?: string; phone?: string; relation?: string } | null;

  return (
    <AnimatePresence>
      {crewId && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.4)" }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden shadow-2xl"
            style={{
              width: "440px",
              background: "#0a1120",
              borderLeft: "1px solid #162240",
            }}
          >
            {loading || !crew ? (
              <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
                {loading ? "Loading…" : "No data"}
              </div>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">

                {/* ── Profile Header ──────────────────────── */}
                <div
                  className="px-5 pt-5 pb-4 shrink-0"
                  style={{
                    background: `linear-gradient(135deg, #0d1a30 0%, #0a1120 100%)`,
                    borderBottom: "1px solid #162240",
                  }}
                >
                  <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-4 mb-4">
                    {/* Avatar */}
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-display font-bold shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${statusColor}25, ${statusColor}10)`,
                        border: `2px solid ${statusColor}40`,
                        color: statusColor,
                      }}
                    >
                      {initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-display font-bold text-text-primary leading-tight truncate">
                        {crew.full_name}
                      </h2>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {crew.rank}{crew.department ? ` · ${crew.department}` : ""}
                      </div>
                      <div className="text-[10px] font-mono text-text-muted mt-0.5">
                        {crew.employee_id}{crew.nationality ? ` · ${crew.nationality}` : ""}
                      </div>
                    </div>
                  </div>

                  {/* Status + compliance row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider"
                      style={{ background: `${statusColor}18`, border: `1px solid ${statusColor}40`, color: statusColor }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                      {STATUS_LABELS[crew.current_status]}
                    </span>

                    {expired > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono"
                        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
                        <AlertTriangle className="w-2.5 h-2.5" /> {expired} expired
                      </span>
                    )}
                    {critical > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono"
                        style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#f97316" }}>
                        <Clock className="w-2.5 h-2.5" /> {critical} critical
                      </span>
                    )}
                    {warning > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-mono"
                        style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24" }}>
                        <Clock className="w-2.5 h-2.5" /> {warning} expiring
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Scrollable body ─────────────────────── */}
                <div className="flex-1 overflow-y-auto">

                  {/* ── Key Dates Card ──────────────────────── */}
                  <div className="px-5 py-4 border-b border-border-divider">
                    <div className="grid grid-cols-2 gap-3">

                      {/* Readiness / Sign-off */}
                      {crew.current_status === "home" ? (
                        <div className="rounded-xl p-3 col-span-1"
                          style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)" }}>
                          <div className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "#34d399" }}>
                            Readiness Date
                          </div>
                          <div className="text-sm font-bold text-text-primary">
                            {readinessDate
                              ? format(parseISO(readinessDate), "dd MMM yyyy")
                              : "Not set"}
                          </div>
                          {readinessDate && (
                            <div className="text-[10px] text-text-muted mt-0.5">
                              {differenceInDays(parseISO(readinessDate), new Date())} days away
                            </div>
                          )}
                        </div>
                      ) : crew.current_status === "on_board" && crew.contract_end_date ? (
                        <div className="rounded-xl p-3 col-span-1"
                          style={{
                            background: contractDays! <= 30 ? "rgba(249,115,22,0.07)" : "rgba(96,165,250,0.07)",
                            border: `1px solid ${contractDays! <= 30 ? "rgba(249,115,22,0.25)" : "rgba(96,165,250,0.2)"}`,
                          }}>
                          <div className="text-[9px] font-mono uppercase tracking-wider mb-1"
                            style={{ color: contractDays! <= 30 ? "#f97316" : "#60a5fa" }}>
                            Sign-off Date
                          </div>
                          <div className="text-sm font-bold text-text-primary">
                            {format(parseISO(crew.contract_end_date), "dd MMM yyyy")}
                          </div>
                          <div className="text-[10px] text-text-muted mt-0.5">
                            {contractDays! < 0
                              ? `${Math.abs(contractDays!)} days overdue`
                              : `${contractDays} days remaining`}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl p-3 col-span-1"
                          style={{ background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)" }}>
                          <div className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "#60a5fa" }}>
                            Current Assignment
                          </div>
                          <div className="text-sm font-bold text-text-primary">
                            {crew.vessel_name || STATUS_LABELS[crew.current_status]}
                          </div>
                        </div>
                      )}

                      {/* Home */}
                      <div className="rounded-xl p-3 col-span-1"
                        style={{ background: "rgba(15,26,46,0.8)", border: "1px solid #162240" }}>
                        <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-1">Home</div>
                        <div className="text-sm font-semibold text-text-primary">
                          {[crew.home_city, crew.home_country].filter(Boolean).join(", ") || "Not recorded"}
                        </div>
                      </div>

                      {/* Vessel / Location */}
                      <div className="rounded-xl p-3 col-span-1"
                        style={{ background: "rgba(15,26,46,0.8)", border: "1px solid #162240" }}>
                        <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-1">
                          {crew.vessel_name ? "Vessel" : "Location"}
                        </div>
                        <div className="text-sm font-semibold text-text-primary truncate">
                          {crew.vessel_name || crew.current_location_label || "Unknown"}
                        </div>
                      </div>

                      {/* Contract */}
                      {crew.contract_start_date && (
                        <div className="rounded-xl p-3 col-span-1"
                          style={{ background: "rgba(15,26,46,0.8)", border: "1px solid #162240" }}>
                          <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-1">Contract Start</div>
                          <div className="text-sm font-semibold text-text-primary">
                            {format(parseISO(crew.contract_start_date), "dd MMM yyyy")}
                          </div>
                          {crew.contract_duration_months && (
                            <div className="text-[10px] text-text-muted">{crew.contract_duration_months} month contract</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Identity Documents ──────────────────── */}
                  <Section title="Identity Documents" icon={<User className="w-3.5 h-3.5" />}>
                    {identity.length === 0 ? (
                      <p className="text-[11px] text-text-muted">No identity documents on file</p>
                    ) : (
                      identity.map((d) => <DocRow key={d.id} doc={d} />)
                    )}
                    {/* Show raw passport/CDC numbers from crew record if no doc entry */}
                    {!identity.find(d => d.document_type === "passport") && crew.passport_number && (
                      <div className="text-[10px] font-mono text-text-muted mt-2">
                        Passport on file: {crew.passport_number}
                      </div>
                    )}
                  </Section>

                  {/* ── Visas & Endorsements ────────────────── */}
                  <Section title="Visas & Endorsements" icon={<MapPin className="w-3.5 h-3.5" />} defaultOpen={visas.some(v => v.expiry_date && differenceInDays(parseISO(v.expiry_date), new Date()) <= 90)}>
                    {visas.length === 0 ? (
                      <p className="text-[11px] text-text-muted">No visa records on file</p>
                    ) : (
                      visas.map((d) => <DocRow key={d.id} doc={d} />)
                    )}
                  </Section>

                  {/* ── Certificates ────────────────────────── */}
                  <Section title={`Certificates (${certs.length})`} icon={<Shield className="w-3.5 h-3.5" />} defaultOpen={certs.some(c => c.expiry_date && differenceInDays(parseISO(c.expiry_date), new Date()) <= 90)}>
                    {certs.length === 0 ? (
                      <p className="text-[11px] text-text-muted">No certificate records on file</p>
                    ) : (
                      certs.map((d) => <DocRow key={d.id} doc={d} />)
                    )}
                  </Section>

                  {/* ── Personal & Contact ──────────────────── */}
                  <Section title="Personal & Contact" icon={<Phone className="w-3.5 h-3.5" />} defaultOpen={false}>
                    <div className="space-y-3">
                      {crew.phone && (
                        <div>
                          <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-0.5">Phone</div>
                          <div className="text-sm text-text-primary">{crew.phone}</div>
                        </div>
                      )}
                      {emergencyContact && (emergencyContact.name || emergencyContact.phone) && (
                        <div className="p-3 rounded-lg" style={{ background: "rgba(15,26,46,0.8)", border: "1px solid #162240" }}>
                          <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
                            <Heart className="w-3 h-3" /> Emergency Contact
                          </div>
                          {emergencyContact.name && <div className="text-sm font-semibold text-text-primary">{emergencyContact.name}</div>}
                          {emergencyContact.relation && <div className="text-xs text-text-secondary">{emergencyContact.relation}</div>}
                          {emergencyContact.phone && <div className="text-xs font-mono text-text-secondary mt-1">{emergencyContact.phone}</div>}
                        </div>
                      )}
                      {!crew.phone && !emergencyContact?.name && (
                        <p className="text-[11px] text-text-muted">No contact details on file</p>
                      )}
                    </div>
                  </Section>

                  {/* ── Preferences ─────────────────────────── */}
                  {preferences && (
                    <Section title="Preferences" icon={<Star className="w-3.5 h-3.5" />} defaultOpen={false}>
                      <div className="p-3 rounded-lg text-sm text-text-secondary"
                        style={{ background: "rgba(43,108,255,0.06)", border: "1px solid rgba(43,108,255,0.15)" }}>
                        {preferences}
                      </div>
                    </Section>
                  )}

                  {/* ── Footer spacer ───────────────────────── */}
                  <div className="h-6" />
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
