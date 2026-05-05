import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LifeBuoy, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import type { CreateSupportTicketPayload } from "../api/support";
import { SupportTicketComposer } from "../components/support/SupportTicketComposer";
import { SupportTicketDetail } from "../components/support/SupportTicketDetail";
import { SupportTicketList } from "../components/support/SupportTicketList";
import { useLocationContext } from "../contexts/locationContext";
import {
  useCreateSupportTicket,
  useCreateSupportTicketMessage,
  useSupportTicket,
  useSupportTickets,
} from "../hooks/queries/useSupportQueries";

export default function Help() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [composerError, setComposerError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
    searchParams.get("ticket")
  );
  const { selectedLocation } = useLocationContext();
  const ticketsQuery = useSupportTickets({ limit: 50 });
  const detailQuery = useSupportTicket(selectedTicketId);
  const createTicket = useCreateSupportTicket();
  const createMessage = useCreateSupportTicketMessage(selectedTicketId);

  const tickets = useMemo(
    () => ticketsQuery.data?.tickets || [],
    [ticketsQuery.data?.tickets]
  );

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

  const handleSubmitTicket = (payload: CreateSupportTicketPayload) => {
    setComposerError(null);
    createTicket.mutate(payload, {
      onSuccess: (data) => {
        toast.success("Support ticket created");
        handleSelectTicket(data.ticket.id);
      },
      onError: (error) => {
        setComposerError(error.message);
      },
    });
  };

  const handleReply = (body: string) => {
    createMessage.mutate(body, {
      onSuccess: () => toast.success("Reply sent"),
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <div className="min-h-screen bg-[#F7F3E8] px-4 py-6 text-alloro-navy sm:px-6 lg:px-10 lg:py-10">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="mx-auto mb-6 flex max-w-[1400px] flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-[#EDE5C0] bg-[#FCFAED] px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-alloro-orange">
            <LifeBuoy className="h-4 w-4" />
            Support
          </div>
          <h1 className="font-display text-[34px] font-medium leading-tight tracking-tight text-alloro-navy sm:text-[42px]">
            Help desk
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Create support tickets, track status, and keep every Alloro reply in
            one place.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-[#EDE5C0] bg-[#FCFAED] px-4 py-3 text-xs font-bold text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Client-visible support history
        </div>
      </motion.header>

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: "easeOut" }}
        className="mx-auto grid max-w-[1400px] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="space-y-6">
          <SupportTicketComposer
            locationId={selectedLocation?.id ?? null}
            isSubmitting={createTicket.isPending}
            errorMessage={composerError}
            onCreateTicket={handleSubmitTicket}
          />
          <SupportTicketDetail
            ticket={detailQuery.data?.ticket}
            messages={detailQuery.data?.messages}
            isLoading={detailQuery.isLoading}
            isReplying={createMessage.isPending}
            onReply={handleReply}
          />
        </div>
        <SupportTicketList
          tickets={tickets}
          selectedTicketId={selectedTicketId}
          isLoading={ticketsQuery.isLoading}
          onSelectTicket={handleSelectTicket}
        />
      </motion.main>
    </div>
  );
}
