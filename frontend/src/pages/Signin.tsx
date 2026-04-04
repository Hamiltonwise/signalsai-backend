import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import authPassword from "../api/auth-password";
import { isSuperAdminEmail } from "../constants/superAdmins";

export default function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  const handleLogin = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await authPassword.login(email, password, rememberMe);

      if (response.success) {
        // Clear stale onboarding state from any previous session
        localStorage.removeItem("onboardingCompleted");
        localStorage.removeItem("hasProperties");

        localStorage.setItem("auth_token", response.token);
        localStorage.setItem("user_email", email.toLowerCase());
        if (response.user?.role) {
          localStorage.setItem("user_role", response.user.role);
        }

        setMessage("Success! Redirecting...");

        // Deep link support: honor ?redirect= if present
        const redirectParam = searchParams.get("redirect");
        let destination: string;
        if (redirectParam && redirectParam.startsWith("/")) {
          destination = redirectParam;
        } else {
          // Super admins go to HQ Command Center, everyone else to dashboard
          destination = isSuperAdminEmail(email)
            ? "/hq/command"
            : "/home";
        }

        setTimeout(() => {
          window.location.href = destination;
        }, 800);
      } else if (response.requiresVerification) {
        // Email not verified — redirect to verification page
        navigate("/verify-email", { state: { email } });
      } else {
        setError(response.error || response.errorMessage || "Invalid email or password");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  const isFormValid =
    email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    password.length >= 8;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-alloro-bg font-body">
      <div className="max-w-md w-full">
        {/* Main Card */}
        <div className="relative p-8 rounded-2xl bg-gradient-to-br from-white to-[#FFF9F7] border border-[#D56753]/10 shadow-warm-lg">
          {/* Logo/Brand */}
          <div className="flex justify-center mb-6">
            <img
              src="/logo.png"
              alt="Alloro"
              className="w-14 h-14 rounded-xl shadow-warm"
            />
          </div>

          {/* Welcome Message */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold font-heading text-alloro-navy tracking-tight mb-2">
              Welcome to Alloro
            </h1>
            <p className="text-slate-500 text-sm">
              Growth you can see. Sign in to get started.
            </p>
          </div>

          {/* Error/Success Messages */}
          <AnimatePresence mode="wait">
            {(error || message) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`mb-4 p-3 rounded-lg text-center text-sm ${
                  error
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-green-50 text-green-700 border border-green-200"
                }`}
              >
                {error || message}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Login Form */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-alloro-navy mb-2"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Enter your work email"
                  className="w-full pl-10 pr-4 py-3 bg-white border border-[#D56753]/12 rounded-xl focus:ring-4 focus:ring-[#D56753]/10 focus:border-[#D56753] outline-none transition-all duration-200 placeholder:text-slate-400"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-alloro-navy mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-12 py-3 bg-white border border-[#D56753]/12 rounded-xl focus:ring-4 focus:ring-[#D56753]/10 focus:border-[#D56753] outline-none transition-all duration-200 placeholder:text-slate-400"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-alloro-orange focus:ring-alloro-orange/20"
              />
              <span className="text-sm text-slate-600">
                Keep me signed in for 30 days
              </span>
            </label>

            {/* Sign In Button */}
            <button
              onClick={handleLogin}
              disabled={isLoading || !isFormValid}
              className="btn-primary btn-press w-full py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>

            {/* Links */}
            <div className="text-center space-y-2 pt-2">
              <p className="text-sm text-slate-500">
                <Link
                  to="/forgot-password"
                  className="text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium"
                >
                  Forgot your password?
                </Link>
              </p>
              <p className="text-sm text-slate-500">
                Don't have an account?{" "}
                <Link
                  to="/signup"
                  className="text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </motion.div>
        </div>

        {/* Help Text */}
        <div className="text-center mt-6">
          <p className="text-slate-500 text-sm">
            By signing in, you agree to our{" "}
            <a
              href="https://getalloro.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-alloro-orange hover:underline"
            >
              Terms of Service
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
