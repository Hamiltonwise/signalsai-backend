import React, { useState, useContext } from "react";
import {
  HelpCircle,
  Mail,
  Send,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { AuthContext } from "../contexts/authContext";
const Help = () => {
  const authContext = useContext(AuthContext);
  const userProfile = authContext?.userProfile;
  const selectedDomain = authContext?.selectedDomain;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    userName: "",
    userEmail: "",
    subject: "General Support",
    urgency: "Normal Protocol",
    message: "",
  });

  // Pre-fill name and email from user profile
  React.useEffect(() => {
    if (userProfile) {
      const fullName = [userProfile.firstName, userProfile.lastName]
        .filter(Boolean)
        .join(" ");
      setFormData((prev) => ({
        ...prev,
        ...(fullName && { userName: fullName }),
        ...(userProfile.email && { userEmail: userProfile.email }),
      }));
    }
  }, [userProfile]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/support/inquiry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userName: formData.userName,
          userEmail: formData.userEmail,
          practiceName:
            userProfile?.practiceName || selectedDomain?.displayName || null,
          subject: `[${formData.urgency}] ${formData.subject}`,
          message: formData.message,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to send message");
      }

      setSubmitted(true);
      // Reset form
      setFormData({
        userName: "",
        userEmail: "",
        subject: "General Support",
        urgency: "Normal Protocol",
        message: "",
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(errorMessage || "Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark">
      {/* Header */}
      <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
              <HelpCircle size={20} />
            </div>
            <div className="flex flex-col text-left">
              <h1 className="text-xs font-semibold font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
                Help Center
              </h1>
              <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
                Answers and guidance
              </span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-black/5 shadow-inner-soft">
            <ShieldCheck size={14} className="text-green-500" />
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest leading-none">
              Verified Channel
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[1100px] mx-auto px-6 lg:px-10 py-10 lg:py-16 space-y-12 lg:space-y-20">
        {/* Hero Section */}
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 text-left pt-2">
          <div className="flex items-center gap-4 mb-3">
            <div className="px-3 py-1.5 bg-alloro-orange/5 rounded-lg text-alloro-orange text-xs font-semibold uppercase tracking-widest border border-alloro-orange/10 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-alloro-orange"></span>
              Alloro is here to help
            </div>
          </div>
          <h1 className="text-5xl lg:text-6xl font-semibold font-heading text-alloro-navy tracking-tight leading-none mb-4">
            How can Alloro help?
          </h1>
          <p className="text-xl lg:text-2xl text-slate-500 font-medium tracking-tight leading-relaxed max-w-4xl">
            Talk to your{" "}
            <span className="text-alloro-orange underline underline-offset-8 font-semibold">
              Alloro Strategist
            </span>{" "}
            for help with your business growth.
          </p>
        </section>

        {/* Inquiry Form & Side Panel */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-7 space-y-10">
            <div className="bg-white rounded-[2.5rem] border border-black/5 shadow-premium p-10 lg:p-14 text-left relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-80 h-80 bg-alloro-orange/[0.02] rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none group-hover:bg-alloro-orange/[0.05] transition-all duration-700"></div>

              {submitted ? (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in duration-500">
                  <div className="w-20 h-20 bg-green-500 text-white rounded-3xl flex items-center justify-center shadow-2xl shadow-green-500/20">
                    <CheckCircle2 size={40} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-3xl font-semibold font-heading text-alloro-navy tracking-tight">
                      Message Received.
                    </h3>
                    <p className="text-slate-500 font-bold max-w-sm">
                      Your strategist has been alerted and will respond via your
                      registered email shortly.
                    </p>
                  </div>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="text-xs font-semibold uppercase tracking-[0.2em] text-alloro-orange hover:underline underline-offset-4"
                  >
                    Send another inquiry
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="space-y-8 relative z-10"
                >
                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold font-heading text-alloro-navy tracking-tight leading-none">
                      Submit an Inquiry
                    </h2>
                    <p className="text-slate-400 font-bold text-sm tracking-tight leading-none">
                      Bypass the email queue and reach us directly.
                    </p>
                  </div>

                  {error && (
                    <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
                      <AlertCircle size={18} />
                      <span className="text-sm font-bold">{error}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 text-left">
                      <label className="text-xs font-semibold text-alloro-textDark/30 uppercase tracking-[0.2em] ml-1">
                        Your Name
                      </label>
                      <input
                        type="text"
                        name="userName"
                        value={formData.userName}
                        onChange={handleInputChange}
                        required
                        placeholder="John Doe"
                        className="w-full bg-alloro-bg border border-black/5 rounded-2xl px-6 py-4 text-alloro-navy font-bold text-sm focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all"
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-xs font-semibold text-alloro-textDark/30 uppercase tracking-[0.2em] ml-1">
                        Your Email
                      </label>
                      <input
                        type="email"
                        name="userEmail"
                        value={formData.userEmail}
                        onChange={handleInputChange}
                        required
                        placeholder="john@practice.com"
                        className="w-full bg-alloro-bg border border-black/5 rounded-2xl px-6 py-4 text-alloro-navy font-bold text-sm focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 text-left">
                      <label className="text-xs font-semibold text-alloro-textDark/30 uppercase tracking-[0.2em] ml-1">
                        Subject Matter
                      </label>
                      <select
                        name="subject"
                        value={formData.subject}
                        onChange={handleInputChange}
                        className="w-full bg-alloro-bg border border-black/5 rounded-2xl px-6 py-4 text-alloro-navy font-bold text-sm focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all appearance-none cursor-pointer"
                      >
                        <option>General Support</option>
                        <option>Technical Issue</option>
                        <option>Marketing Strategy</option>
                        <option>Revenue Attribution</option>
                      </select>
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-xs font-semibold text-alloro-textDark/30 uppercase tracking-[0.2em] ml-1">
                        Urgency Tier
                      </label>
                      <select
                        name="urgency"
                        value={formData.urgency}
                        onChange={handleInputChange}
                        className="w-full bg-alloro-bg border border-black/5 rounded-2xl px-6 py-4 text-alloro-navy font-bold text-sm focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all appearance-none cursor-pointer"
                      >
                        <option>Normal Protocol</option>
                        <option>High Priority</option>
                        <option>Immediate Assistance Required</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 text-left">
                    <label className="text-xs font-semibold text-alloro-textDark/30 uppercase tracking-[0.2em] ml-1">
                      Directive Details
                    </label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      required
                      placeholder="Please describe your challenge or question in detail..."
                      className="w-full h-40 bg-alloro-bg border border-black/5 rounded-3xl px-6 py-5 text-alloro-navy font-bold text-sm focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto px-12 py-5 bg-alloro-navy text-white rounded-2xl text-xs font-semibold uppercase tracking-[0.25em] shadow-2xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-4 group disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      "Transmitting Intelligence..."
                    ) : (
                      <>
                        DISPATCH TO STRATEGY TEAM{" "}
                        <Send
                          size={16}
                          className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"
                        />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-10">
            <div className="bg-white rounded-[2.5rem] border border-black/5 shadow-premium p-10 lg:p-14 text-left space-y-10">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold font-heading text-alloro-navy tracking-tight leading-none">
                  Instant Channels
                </h3>
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest leading-none">
                  Real-time reach protocol
                </p>
              </div>

              <div className="space-y-8">
                <div className="flex items-center gap-6 group cursor-pointer">
                  <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center border border-black/5 shadow-inner-soft group-hover:bg-alloro-navy group-hover:text-white transition-all duration-500 group-hover:-rotate-6">
                    <Mail size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-alloro-textDark/30 uppercase tracking-[0.2em] mb-1">
                      Direct Strategy Email
                    </p>
                    <p className="text-xl font-semibold text-alloro-navy tracking-tight group-hover:text-alloro-navy transition-colors">
                      info@getalloro.com
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-black/[0.03] space-y-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-green-500" />
                  <span className="text-sm font-bold text-slate-500 tracking-tight">
                    Average response: {"<"} 2 hours
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-green-500" />
                  <span className="text-sm font-bold text-slate-500 tracking-tight">
                    Expert orthodonic strategists
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-10 pb-12 flex flex-col items-center gap-10 text-center">
          <img
            src="/logo.png"
            alt="Alloro"
            className="w-16 h-16 rounded-2xl shadow-2xl"
          />
          <p className="text-xs text-alloro-textDark/20 font-semibold tracking-[0.4em] uppercase">
            Alloro Support
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Help;
