export function PilotBanner() {
  const isPilotMode =
    typeof window !== "undefined" &&
    sessionStorage.getItem("pilot_mode") === "true";

  if (!isPilotMode) return null;

  const handleEndSession = () => {
    // Clear all pilot session data
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("pilot_mode");
    sessionStorage.removeItem("user_role");

    // Close the pilot window
    window.close();

    // Fallback if window.close() is blocked (e.g. not opened by script)
    // Redirect to signin or show message
    if (!window.closed) {
      window.location.href = "/signin";
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-amber-500 text-black px-4 py-3 flex items-center justify-between z-[9999] shadow-lg">
      <div className="flex items-center gap-3">
        <div className="bg-black text-amber-500 rounded-full p-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        </div>
        <div>
          <span className="font-bold text-lg">Pilot Mode Active</span>
          <span className="ml-2 text-sm opacity-90 hidden sm:inline">
            You are viewing the application as another user. Changes made here
            will affect the actual user account.
          </span>
        </div>
      </div>
      <button
        onClick={handleEndSession}
        className="bg-black text-white px-5 py-2 rounded-md font-medium hover:bg-gray-800 transition-colors shadow-sm flex items-center gap-2"
      >
        <span>End Session</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-4 h-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
