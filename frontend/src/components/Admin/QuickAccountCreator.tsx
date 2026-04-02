/**
 * Quick Account Creator
 *
 * Paste a GBP link or search for a business, preview the data,
 * then create a full account with one click.
 */

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  MapPin,
  Star,
  MessageSquare,
  Globe,
  Phone,
  Check,
  Copy,
  Loader2,
  Zap,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  searchPlaces,
  getPlaceDetails,
  type PlaceSuggestion,
  type PlaceDetails,
} from "../../api/places";
import {
  adminQuickCreate,
  type AccountType,
  type QuickCreateResponse,
} from "../../api/admin-organizations";

const ACCOUNT_TYPES: { value: AccountType; label: string; color: string }[] = [
  { value: "prospect", label: "Prospect", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "paying", label: "Paying", color: "bg-green-50 text-green-700 border-green-200" },
  { value: "partner", label: "Partner", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "foundation", label: "Foundation", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "case_study", label: "Case Study", color: "bg-pink-50 text-pink-700 border-pink-200" },
  { value: "internal", label: "Internal", color: "bg-gray-50 text-gray-700 border-gray-200" },
];

interface CreatedAccount extends QuickCreateResponse {}

export function QuickAccountCreator({ onCreated }: { onCreated: () => void }) {
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("prospect");
  const [trialDays, setTrialDays] = useState(30);
  const [skipTrialEmails, setSkipTrialEmails] = useState(false);

  // Create state
  const [creating, setCreating] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<CreatedAccount | null>(null);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedPlace(null);
    setCreatedAccount(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await searchPlaces(query);
        setSuggestions(result.suggestions || []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const handleSelectPlace = async (suggestion: PlaceSuggestion) => {
    setSuggestions([]);
    setSearchQuery(suggestion.mainText);
    setLoadingDetails(true);

    try {
      const result = await getPlaceDetails(suggestion.placeId);
      setSelectedPlace(result.place);
    } catch {
      toast.error("Failed to load business details");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedPlace || !email.trim()) {
      toast.error("Select a business and enter an email");
      return;
    }

    setCreating(true);
    try {
      const result = await adminQuickCreate({
        placeId: selectedPlace.placeId,
        email: email.trim(),
        accountType,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        skipTrialEmails,
        trialDays,
      });

      setCreatedAccount(result);
      toast.success(`Account created for ${result.orgName}`);
      onCreated();
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || "Failed to create account";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const reset = () => {
    setSearchQuery("");
    setSuggestions([]);
    setSelectedPlace(null);
    setEmail("");
    setFirstName("");
    setLastName("");
    setAccountType("prospect");
    setTrialDays(30);
    setSkipTrialEmails(false);
    setCreatedAccount(null);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 bg-gradient-to-r from-alloro-navy/5 to-transparent px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-alloro-orange/10">
            <Zap className="h-5 w-5 text-alloro-orange" />
          </div>
          <div>
            <h3 className="font-semibold text-[#1A1D23]">Quick Account Creator</h3>
            <p className="text-sm text-gray-500">Search for a business, create a full account in one click</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Success State */}
        {createdAccount ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 text-green-700">
              <Check className="h-5 w-5" />
              <span className="font-semibold">Account created for {createdAccount.orgName}</span>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Email</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#1A1D23]">{createdAccount.email}</span>
                  <button onClick={() => copyToClipboard(createdAccount.email, "Email")} className="p-1 text-gray-400 hover:text-gray-600">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Temp Password</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-medium text-[#1A1D23] bg-white px-2 py-0.5 rounded border">{createdAccount.tempPassword}</code>
                  <button onClick={() => copyToClipboard(createdAccount.tempPassword, "Password")} className="p-1 text-gray-400 hover:text-gray-600">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {createdAccount.websitePreviewUrl && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Website Preview</span>
                  <a href={createdAccount.websitePreviewUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-alloro-orange hover:underline">
                    {createdAccount.websitePreviewUrl}
                  </a>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Account Type</span>
                <span className="text-sm font-medium capitalize">{createdAccount.accountType.replace("_", " ")}</span>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              Welcome email sent with credentials. Data hydration running in background (website, rankings, intelligence).
            </p>

            <button
              onClick={reset}
              className="text-sm font-semibold text-alloro-orange hover:text-alloro-navy transition-colors"
            >
              Create another account
            </button>
          </motion.div>
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search for a business by name..."
                  className="w-full rounded-xl border border-gray-300 pl-10 pr-10 py-2.5 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                )}
                {searchQuery && !searching && (
                  <button
                    onClick={() => { setSearchQuery(""); setSuggestions([]); setSelectedPlace(null); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Suggestions dropdown */}
              <AnimatePresence>
                {suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
                  >
                    {suggestions.map((s) => (
                      <button
                        key={s.placeId}
                        onClick={() => handleSelectPlace(s)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="text-sm font-medium text-[#1A1D23]">{s.mainText}</div>
                        <div className="text-xs text-gray-500">{s.secondaryText}</div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Loading details */}
            {loadingDetails && (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading business details...
              </div>
            )}

            {/* Business preview */}
            {selectedPlace && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5"
              >
                <div className="rounded-xl bg-gray-50 p-4">
                  <h4 className="font-semibold text-[#1A1D23] text-base">{selectedPlace.name}</h4>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    {selectedPlace.formattedAddress && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {selectedPlace.formattedAddress}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                    {selectedPlace.rating && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {selectedPlace.rating}
                      </span>
                    )}
                    {selectedPlace.reviewCount > 0 && (
                      <span className="flex items-center gap-1 text-gray-600">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {selectedPlace.reviewCount} reviews
                      </span>
                    )}
                    {selectedPlace.phone && (
                      <span className="flex items-center gap-1 text-gray-600">
                        <Phone className="h-3.5 w-3.5" />
                        {selectedPlace.phone}
                      </span>
                    )}
                    {selectedPlace.websiteUri && (
                      <span className="flex items-center gap-1 text-gray-600">
                        <Globe className="h-3.5 w-3.5" />
                        {selectedPlace.domain || selectedPlace.websiteUri}
                      </span>
                    )}
                  </div>
                  {selectedPlace.category && (
                    <div className="mt-2">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-alloro-navy/10 text-alloro-navy">
                        {selectedPlace.category}
                      </span>
                    </div>
                  )}
                </div>

                {/* Account Details Form */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                      placeholder="owner@theirpractice.com"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                      <select
                        value={accountType}
                        onChange={(e) => setAccountType(e.target.value as AccountType)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                      >
                        {ACCOUNT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Trial (days)</label>
                      <input
                        type="number"
                        value={trialDays}
                        onChange={(e) => setTrialDays(parseInt(e.target.value) || 30)}
                        min={1}
                        max={365}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="skipTrialEmails"
                      checked={skipTrialEmails}
                      onChange={(e) => setSkipTrialEmails(e.target.checked)}
                      className="rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange/20"
                    />
                    <label htmlFor="skipTrialEmails" className="text-sm text-gray-600">
                      Skip automated trial emails
                    </label>
                  </div>
                </div>

                {/* Create Button */}
                <motion.button
                  onClick={handleCreate}
                  disabled={creating || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-alloro-orange px-5 py-3 text-sm font-semibold text-white hover:bg-alloro-navy transition-colors disabled:opacity-50"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating account + generating website...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Create Account
                    </>
                  )}
                </motion.button>

                <p className="text-xs text-gray-400 text-center">
                  Creates org, user (with temp password), website, rankings, and sends welcome email.
                </p>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
