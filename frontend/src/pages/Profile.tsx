import React, { useState } from "react";
import { User, Lock, LogOut, Save, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSession } from "../contexts/sessionContext";
import { useNavigate } from "react-router-dom";

const Profile = () => {
  const { userProfile } = useAuth();
  const { disconnect } = useSession();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: userProfile?.firstName || "",
    lastName: userProfile?.lastName || "",
    email: userProfile?.email || "",
    practiceName: userProfile?.practiceName || "",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    // TODO: Implement save logic
    setIsEditing(false);
  };

  const handleLogout = () => {
    disconnect(); // Clears storage, cookies, and redirects to /signin
  };

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark">
      {/* Header */}
      <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
              <User size={20} />
            </div>
            <div className="flex flex-col text-left">
              <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
                Intelligence Ecosystem
              </h1>
              <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
                Your practice at a glance
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-alloro-textDark/40 hover:text-alloro-textDark"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[1100px] mx-auto px-6 lg:px-10 py-12 space-y-12">
        {/* Profile Avatar Section */}
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 text-left">
          <div className="flex items-center gap-6 mb-8">
            <div className="w-20 h-20 rounded-2xl bg-alloro-orange text-white flex items-center justify-center text-4xl font-black shadow-lg">
              {userProfile?.firstName?.charAt(0).toUpperCase()}
              {userProfile?.lastName?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-3xl font-black font-heading text-alloro-textDark tracking-tight">
                {userProfile?.firstName} {userProfile?.lastName}
              </h2>
              <p className="text-slate-500 mt-1">{userProfile?.email}</p>
              <div className="flex items-center gap-2 mt-3">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm font-black text-green-600 uppercase tracking-widest">
                  Active Account
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Account Information */}
        <section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden">
          <div className="px-8 lg:px-12 py-8 border-b border-black/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-alloro-bg flex items-center justify-center text-alloro-orange">
                <User size={20} />
              </div>
              <h3 className="text-xl font-black font-heading text-alloro-textDark tracking-tight">
                Account Information
              </h3>
            </div>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-5 py-2.5 bg-alloro-orange text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg transition-all active:scale-95"
              >
                Edit Profile
              </button>
            )}
          </div>

          <div className="p-8 lg:p-12 space-y-6">
            {isEditing ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black text-alloro-textDark/60 uppercase tracking-widest mb-2 block">
                      First Name
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-alloro-bg border border-black/5 rounded-2xl text-alloro-textDark font-bold focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-alloro-textDark/60 uppercase tracking-widest mb-2 block">
                      Last Name
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-alloro-bg border border-black/5 rounded-2xl text-alloro-textDark font-bold focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-alloro-textDark/60 uppercase tracking-widest mb-2 block">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-alloro-bg border border-black/5 rounded-2xl text-alloro-textDark font-bold focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-alloro-textDark/60 uppercase tracking-widest mb-2 block">
                    Practice Name
                  </label>
                  <input
                    type="text"
                    name="practiceName"
                    value={formData.practiceName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-alloro-bg border border-black/5 rounded-2xl text-alloro-textDark font-bold focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all"
                  />
                </div>

                <div className="flex gap-4 justify-end pt-4">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-6 py-3 bg-slate-100 text-alloro-textDark rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-6 py-3 bg-alloro-orange text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg transition-all flex items-center gap-2"
                  >
                    <Save size={16} /> Save Changes
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 rounded-xl bg-slate-50 border border-black/5">
                  <span className="text-[10px] font-black text-alloro-textDark/60 uppercase tracking-widest">
                    First Name
                  </span>
                  <span className="font-bold text-alloro-textDark">
                    {formData.firstName}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 rounded-xl bg-slate-50 border border-black/5">
                  <span className="text-[10px] font-black text-alloro-textDark/60 uppercase tracking-widest">
                    Last Name
                  </span>
                  <span className="font-bold text-alloro-textDark">
                    {formData.lastName}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 rounded-xl bg-slate-50 border border-black/5">
                  <span className="text-[10px] font-black text-alloro-textDark/60 uppercase tracking-widest">
                    Email
                  </span>
                  <span className="font-bold text-alloro-textDark">
                    {formData.email}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 rounded-xl bg-slate-50 border border-black/5">
                  <span className="text-[10px] font-black text-alloro-textDark/60 uppercase tracking-widest">
                    Practice
                  </span>
                  <span className="font-bold text-alloro-textDark">
                    {formData.practiceName}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Security Settings */}
        <section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden">
          <div className="px-8 lg:px-12 py-8 border-b border-black/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <Lock size={20} />
            </div>
            <h3 className="text-xl font-black font-heading text-alloro-textDark tracking-tight">
              Security & Logout
            </h3>
          </div>

          <div className="p-8 lg:p-12">
            <button
              onClick={handleLogout}
              className="w-full py-4 px-6 bg-red-50 border-2 border-red-200 rounded-2xl text-red-600 font-black text-sm uppercase tracking-widest hover:bg-red-100 transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              <LogOut size={18} />
              Logout from All Devices
            </button>
            <p className="text-[10px] text-alloro-textDark/40 font-bold uppercase tracking-widest mt-4 text-center">
              You will be logged out from this and all other active sessions
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Profile;
