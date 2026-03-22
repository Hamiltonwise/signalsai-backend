import type { PropsWithChildren } from "react";
import { motion } from "framer-motion";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminTopBar";
import { LoadingIndicator } from "./LoadingIndicator";
import { SidebarProvider, useSidebar } from "./SidebarContext";

export interface AdminLayoutProps extends PropsWithChildren {}

function AdminLayoutInner({ children }: AdminLayoutProps) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-gray-50 font-body text-gray-900">
      <LoadingIndicator />
      <AdminTopBar />
      <div className="flex">
        <AdminSidebar />
        <motion.main
          initial={false}
          animate={{ marginLeft: collapsed ? 72 : 288 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="flex-1 p-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-[1400px] mx-auto"
          >
            {children}
          </motion.div>
        </motion.main>
      </div>
    </div>
  );
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <SidebarProvider defaultCollapsed={true}>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </SidebarProvider>
  );
}
