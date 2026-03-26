/**
 * Locations -- Multi-location management for doctor dashboard.
 *
 * Shows all locations as cards with ranking, reviews, address, phone.
 * Add location form at bottom. "Coming Soon" badge support.
 * Directly supports One Endodontics adding Woodbridge without Dave.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin,
  Phone,
  Plus,
  Trash2,
  Star,
  Check,
  X,
  Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Location {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  place_id: string | null;
  is_primary: boolean;
  is_coming_soon: boolean;
  ranking_position: number | null;
  review_count: number | null;
}

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

async function fetchLocations(): Promise<Location[]> {
  const token = getToken();
  const res = await fetch("/api/locations", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch locations");
  const json = await res.json();
  return json.locations || [];
}

async function createLocation(data: Record<string, unknown>): Promise<Location> {
  const token = getToken();
  const res = await fetch("/api/locations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create location");
  }
  const json = await res.json();
  return json.location;
}

async function updateLocation(id: number, data: Record<string, unknown>): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/locations/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update location");
}

async function deleteLocation(id: number): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/locations/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to remove location");
  }
}

// ── Location Card ────────────────────────────────────────────────

function LocationCard({
  location,
  onSetPrimary,
  onRemove,
}: {
  location: Location;
  onSetPrimary: () => void;
  onRemove: () => void;
}) {
  const addressLine = [location.address, location.city, location.state, location.zip]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              location.is_primary ? "bg-emerald-50" : "bg-gray-100"
            }`}
          >
            <MapPin
              className={`w-5 h-5 ${
                location.is_primary ? "text-emerald-600" : "text-gray-400"
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-[#212D40] truncate">
                {location.name}
              </p>
              {location.is_primary && (
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase">
                  Primary
                </span>
              )}
              {location.is_coming_soon && (
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Coming Soon
                </span>
              )}
            </div>
            {addressLine && (
              <p className="text-xs text-gray-500 mt-1 truncate">{addressLine}</p>
            )}
            {location.phone && (
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {location.phone}
              </p>
            )}
          </div>
        </div>

        {/* Ranking + Reviews */}
        <div className="flex items-center gap-3 shrink-0">
          {location.ranking_position != null && (
            <div className="text-right">
              <p className="text-lg font-black text-[#212D40]">
                {location.ranking_position ? `#${location.ranking_position}` : "Unranked"}
              </p>
              <p className="text-[10px] text-gray-400 uppercase font-bold">
                Position
              </p>
            </div>
          )}
          {location.review_count != null && (
            <div className="text-right">
              <p className="text-lg font-black text-[#212D40] flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                {location.review_count}
              </p>
              <p className="text-[10px] text-gray-400 uppercase font-bold">
                Reviews
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
        {!location.is_primary && (
          <button
            onClick={onSetPrimary}
            className="text-xs text-gray-500 hover:text-[#212D40] font-medium flex items-center gap-1 transition-colors"
          >
            <Check className="w-3 h-3" />
            Set as primary
          </button>
        )}
        {!location.is_primary && (
          <button
            onClick={onRemove}
            className="text-xs text-gray-400 hover:text-red-500 font-medium flex items-center gap-1 transition-colors ml-auto"
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add Location Form ────────────────────────────────────────────

function AddLocationForm({ onAdd }: { onAdd: (data: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  const [comingSoon, setComingSoon] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      phone: phone.trim() || undefined,
      is_coming_soon: comingSoon,
      gbp: { locationId: "pending", displayName: name.trim() },
    });
    setName("");
    setAddress("");
    setCity("");
    setState("");
    setPhone("");
    setComingSoon(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-gray-200 bg-white p-6 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add a location
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-[#212D40]">New Location</p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Location name"
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
        />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street address"
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
          />
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="State"
            className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
          />
        </div>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#212D40]/20"
        />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={comingSoon}
            onChange={(e) => setComingSoon(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-600">Coming Soon</span>
        </label>
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="w-full rounded-lg bg-[#212D40] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#212D40]/90 transition-colors disabled:opacity-40"
        >
          Add Location
        </button>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function Locations() {
  const { userProfile: _userProfile } = useAuth();
  const queryClient = useQueryClient();

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["user-locations"],
    queryFn: fetchLocations,
    staleTime: 5 * 60_000,
  });

  const addMutation = useMutation({
    mutationFn: createLocation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-locations"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      updateLocation(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-locations"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLocation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-locations"] }),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:py-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#212D40]">
          Locations
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage all practice locations. Each location gets its own rankings, reviews, and PatientPath site.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-gray-200 bg-white" />
          ))}
        </div>
      )}

      {!isLoading && locations.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No locations added yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add your first location below.</p>
        </div>
      )}

      {locations.map((loc) => (
        <LocationCard
          key={loc.id}
          location={loc}
          onSetPrimary={() =>
            updateMutation.mutate({ id: loc.id, data: { is_primary: true } })
          }
          onRemove={() => {
            if (confirm(`Remove ${loc.name}? This cannot be undone.`)) {
              deleteMutation.mutate(loc.id);
            }
          }}
        />
      ))}

      <AddLocationForm
        onAdd={(data) => addMutation.mutate(data)}
      />

      {addMutation.isError && (
        <p className="text-xs text-red-500 text-center">
          {(addMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}

// T1 adds /dashboard/locations to App.tsx
