import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LifeBuoy, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import type { SupportTicket } from "../../api/support";
import { AdminSupportFilters } from "../../components/Admin/support/AdminSupportFilters";
import type { AdminSupportFiltersValue } from "../../components/Admin/support/AdminSupportFilters";
import { AdminSupportQueue } from "../../components/Admin/support/AdminSupportQueue";
import type { AdminSupportGroup } from "../../components/Admin/support/AdminSupportQueue";
import { AdminSupportTicketPanel } from "../../components/Admin/support/AdminSupportTicketPanel";
import {
  useAdminSupportTicket,
  useAdminSupportTickets,
  useCreateAdminSupportMessage,
  useUpdateAdminSupportTicket,
} from "../../hooks/queries/useSupportQueries";

const defaultFilters: AdminSupportFiltersValue = {
  q: "",
  status: "open",
  type: "",
};

export default function SupportDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] =
    useState<AdminSupportFiltersValue>(defaultFilters);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
    searchParams.get("ticket")
  );

  const listQuery = useAdminSupportTickets({
    limit: 100,
    q: filters.q || undefined,
    status: filters.status || undefined,
    type: filters.type || undefined,
  });
  const detailQuery = useAdminSupportTicket(selectedTicketId);
  const updateTicket = useUpdateAdminSupportTicket(selectedTicketId);
  const createMessage = useCreateAdminSupportMessage(selectedTicketId);

  const tickets = listQuery.data?.tickets || [];
  const groups = useMemo(() => groupTicketsByClient(tickets), [tickets]);

  useEffect(() => {
    const ticketFromUrl = searchParams.get("ticket");
    if (ticketFromUrl && ticketFromUrl !== selectedTicketId) {
      setSelectedTicketId(ticketFromUrl);
    }
  }, [searchParams, selectedTicketId]);

  useEffect(() => {
    if (!selectedTicketId && tickets.length > 0) {
      setSelectedTicketId(tickets[0].id);
    }
  }, [selectedTicketId, tickets]);

  const handleSelectTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setSearchParams({ ticket: ticketId });
  };

  return (
    <div className="min-h-[calc(100vh-104px)] bg-[#F7F3E8] px-5 py-6 text-alloro-navy lg:px-8 lg:py-8">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"
      >
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-[#EDE5C0] bg-[#FCFAED] px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-alloro-orange">
            <LifeBuoy className="h-4 w-4" />
            Support
          </div>
          <h1 className="font-display text-[38px] font-medium leading-tight tracking-tight text-alloro-navy">
            Client support queue
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Triage tickets grouped by client, send visible replies, and keep
            internal notes in one support ledger.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-[#EDE5C0] bg-[#FCFAED] px-4 py-3 text-xs font-bold text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Super-admin support workspace
        </div>
      </motion.header>

      <div className="mb-6">
        <AdminSupportFilters value={filters} onChange={setFilters} />
      </div>

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: "easeOut" }}
        className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]"
      >
        <AdminSupportQueue
          groups={groups}
          selectedTicketId={selectedTicketId}
          isLoading={listQuery.isLoading}
          onSelectTicket={handleSelectTicket}
        />
        <AdminSupportTicketPanel
          ticket={detailQuery.data?.ticket}
          messages={detailQuery.data?.messages}
          isLoading={detailQuery.isLoading}
          isUpdating={updateTicket.isPending}
          isMessaging={createMessage.isPending}
          onUpdate={(payload) =>
            updateTicket.mutate(payload, {
              onSuccess: () => toast.success("Ticket updated"),
              onError: (error) => toast.error(error.message),
            })
          }
          onMessage={(body, visibility) =>
            createMessage.mutate(
              { body, visibility },
              {
                onSuccess: () => toast.success("Message sent"),
                onError: (error) => toast.error(error.message),
              }
            )
          }
        />
      </motion.main>
    </div>
  );
}

function groupTicketsByClient(tickets: SupportTicket[]): AdminSupportGroup[] {
  const grouped = tickets.reduce<Record<string, SupportTicket[]>>((acc, ticket) => {
    const key = ticket.organizationName || `Organization ${ticket.organizationId}`;
    acc[key] = [...(acc[key] || []), ticket];
    return acc;
  }, {});

  return Object.entries(grouped).map(([organizationName, groupTickets]) => ({
    organizationName,
    tickets: groupTickets,
  }));
}
