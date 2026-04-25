import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Info } from "lucide-react";
import {
  fetchSystemNotifications,
  dismissSystemNotification,
  type SystemNotification,
} from "../../api/pms";

/**
 * Renders one-time system notifications for the practice (e.g. retroactive
 * cleanup notices). Each card is dismissable; dismissed state is stored
 * server-side so the banner doesn't reappear on reload.
 */
export const SystemNotificationsBanner: React.FC = () => {
  const [items, setItems] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSystemNotifications().then((res) => {
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        setItems(res.data);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleDismiss = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await dismissSystemNotification(id);
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <div className="space-y-3 mb-4">
      <AnimatePresence initial={false}>
        {items.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-[#D56753]/10 flex items-center justify-center flex-shrink-0">
              <Info className="w-4 h-4 text-[#D56753]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1A1D23]">{n.title}</p>
              <p className="text-sm text-[#1A1D23]/70 mt-1 leading-relaxed">{n.message}</p>
            </div>
            <button
              onClick={() => handleDismiss(n.id)}
              className="p-1 rounded-lg hover:bg-stone-200/60 transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4 text-[#1A1D23]/60" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
