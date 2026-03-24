/**
 * CaseStudies -- Admin table for capturing verified outcome stories.
 *
 * Artful Orthodontics moved from #5 to #2. That is the only verified
 * outcome story Alloro has. Revenue impact is missing until next call.
 * This screen lets Corey capture and publish case studies from client calls.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  Plus,
  Check,
  X,
  Eye,
  EyeOff,
  DollarSign,
} from "lucide-react";

interface CaseStudy {
  id: string;
  practice_name: string;
  specialty: string | null;
  city: string | null;
  state: string | null;
  starting_position: number | null;
  ending_position: number | null;
  starting_review_count: number | null;
  ending_review_count: number | null;
  timeframe_weeks: number | null;
  revenue_impact: string | null;
  doctor_quote: string | null;
  is_published: boolean;
  is_anonymous: boolean;
  created_at: string;
}

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

async function fetchCaseStudies(): Promise<CaseStudy[]> {
  const token = getToken();
  const res = await fetch("/api/admin/case-studies", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch case studies");
  const json = await res.json();
  return json.case_studies || [];
}

async function createCaseStudy(data: Record<string, unknown>): Promise<CaseStudy> {
  const token = getToken();
  const res = await fetch("/api/admin/case-studies", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create case study");
  const json = await res.json();
  return json.case_study;
}

async function updateCaseStudy(id: string, data: Record<string, unknown>): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/admin/case-studies/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update case study");
}

async function publishCaseStudy(id: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/admin/case-studies/${id}/publish`, {
    method: "PATCH",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to publish case study");
}

// ── Position Change Badge ────────────────────────────────────────

function PositionChange({
  start,
  end,
}: {
  start: number | null;
  end: number | null;
}) {
  if (start == null || end == null) return <span className="text-gray-400">--</span>;
  const improved = end < start;
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-bold ${
        improved ? "text-emerald-600" : "text-gray-500"
      }`}
    >
      #{start}
      <TrendingUp className={`w-3.5 h-3.5 ${improved ? "" : "rotate-180"}`} />
      #{end}
    </span>
  );
}

// ── Add Form ─────────────────────────────────────────────────────

function AddCaseStudyForm({
  onAdd,
}: {
  onAdd: (data: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [startPos, setStartPos] = useState("");
  const [endPos, setEndPos] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({
      practice_name: name.trim(),
      specialty: specialty.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      starting_position: startPos ? parseInt(startPos, 10) : null,
      ending_position: endPos ? parseInt(endPos, 10) : null,
    });
    setName("");
    setSpecialty("");
    setCity("");
    setState("");
    setStartPos("");
    setEndPos("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-[#212D40] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#212D40]/90 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add case study
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-[#212D40]">New Case Study</p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Practice name"
          className="col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
        />
        <input
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          placeholder="Specialty"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
        />
        <div className="flex gap-2">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
          />
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="ST"
            className="w-16 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
          />
        </div>
        <input
          value={startPos}
          onChange={(e) => setStartPos(e.target.value)}
          placeholder="Starting position"
          type="number"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
        />
        <input
          value={endPos}
          onChange={(e) => setEndPos(e.target.value)}
          placeholder="Ending position"
          type="number"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!name.trim()}
        className="mt-3 w-full rounded-lg bg-[#212D40] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#212D40]/90 transition-colors disabled:opacity-40"
      >
        Create
      </button>
    </div>
  );
}

// ── Inline Edit Cell ─────────────────────────────────────────────

function EditableCell({
  value,
  field,
  studyId,
  onSave,
  placeholder,
}: {
  value: string | null;
  field: string;
  studyId: string;
  onSave: (id: string, data: Record<string, unknown>) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");

  const handleSave = () => {
    onSave(studyId, { [field]: val.trim() || null });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-28 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#212D40]/20"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
        <button onClick={handleSave} className="text-emerald-500">
          <Check className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-left group flex items-center gap-1"
    >
      <span className={value ? "text-sm text-[#212D40]" : "text-xs text-gray-400 italic"}>
        {value || placeholder}
      </span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
        <DollarSign className="w-3 h-3 text-gray-300" />
      </span>
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function CaseStudies() {
  const queryClient = useQueryClient();

  const { data: studies = [], isLoading } = useQuery({
    queryKey: ["admin-case-studies"],
    queryFn: fetchCaseStudies,
    staleTime: 5 * 60_000,
  });

  const addMutation = useMutation({
    mutationFn: createCaseStudy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-case-studies"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateCaseStudy(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-case-studies"] }),
  });

  const publishMutation = useMutation({
    mutationFn: publishCaseStudy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-case-studies"] }),
  });

  const handleUpdate = (id: string, data: Record<string, unknown>) => {
    updateMutation.mutate({ id, data });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#212D40]">
            Case Studies
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Verified outcome stories from real clients.
          </p>
        </div>
        <AddCaseStudyForm onAdd={(data) => addMutation.mutate(data)} />
      </div>

      {isLoading && (
        <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
      )}

      {!isLoading && studies.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <TrendingUp className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No case studies yet.</p>
        </div>
      )}

      {!isLoading && studies.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Practice
                </th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Position
                </th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Revenue Impact
                </th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Published
                </th>
              </tr>
            </thead>
            <tbody>
              {studies.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-[#212D40]">
                      {s.is_anonymous ? "Anonymous Practice" : s.practice_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {[s.specialty, s.city, s.state].filter(Boolean).join(" / ")}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <PositionChange start={s.starting_position} end={s.ending_position} />
                  </td>
                  <td className="px-5 py-4">
                    <EditableCell
                      value={s.revenue_impact}
                      field="revenue_impact"
                      studyId={s.id}
                      onSave={handleUpdate}
                      placeholder="Add revenue impact"
                    />
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => {
                        if (s.is_published) {
                          handleUpdate(s.id, { is_published: false });
                        } else {
                          publishMutation.mutate(s.id);
                        }
                      }}
                      className={`flex items-center gap-1 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors ${
                        s.is_published
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {s.is_published ? (
                        <>
                          <Eye className="w-3 h-3" /> Published
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3" /> Draft
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// T1 adds /admin/case-studies to App.tsx
// T2 registers routes in src/index.ts
