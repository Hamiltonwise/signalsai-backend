import { useState } from "react";
import { LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LogoutButtonProps {
  onLogout: () => void;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({ onLogout }) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleLogout = () => {
    setShowConfirm(false);
    onLogout();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowConfirm(true)}
        className="w-full rounded-xl px-3 py-2 text-sm flex items-center gap-3 bg-white/30 backdrop-blur-sm border border-white/40 text-gray-700 hover:bg-white/40 transition-all"
      >
        <LogOut className="h-4 w-4" />
        <span>Log Out</span>
      </button>

      {/* Animated Confirmation Tooltip */}
      <AnimatePresence>
        {showConfirm && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirm(false)}
              className="fixed inset-0 z-40"
            />

            {/* Confirmation Popup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50"
            >
              <div className="bg-white rounded-lg shadow-2xl border border-gray-200 p-4 min-w-[200px]">
                <p className="text-sm text-gray-700 font-medium mb-3 text-center">
                  Sign out of your account?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-2 border-8 border-transparent border-t-white"></div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
