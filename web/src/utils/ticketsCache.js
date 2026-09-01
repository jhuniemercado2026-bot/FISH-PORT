const getManilaDateString = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const normalizeDateString = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  }

  return raw.slice(0, 10);
};

const getTicketDate = (ticket) => normalizeDateString(ticket?.ticket_date ?? ticket?.rawTicketDate);

const parseMoneyValue = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTicketFee = (ticket) => parseMoneyValue(ticket?.ticket_fee ?? ticket?.ticketFee);

const adjustStatValue = (value, delta) => Math.max(0, parseMoneyValue(value) + parseMoneyValue(delta));

const normalizeTicketType = (ticketType) =>
  String(ticketType ?? "").trim().toLowerCase();

const isTicketAnnual = (ticket) => normalizeTicketType(ticket?.ticket_type ?? ticket?.ticketType) === "annual";

const isTodaysTicket = (ticket) => getTicketDate(ticket) === getManilaDateString();

const mergeTicket = (existing, nextTicket) => ({
  ...existing,
  ...nextTicket,
});

const upsertTicketArray = (tickets = [], ticket) => {
  const nextId = String(ticket?.ticket_id ?? ticket?.id ?? "");
  if (!nextId) return tickets;

  const existingIndex = tickets.findIndex((item) => String(item?.ticket_id ?? item?.id ?? "") === nextId);
  if (existingIndex >= 0) {
    const nextTickets = [...tickets];
    nextTickets[existingIndex] = mergeTicket(nextTickets[existingIndex], ticket);
    return nextTickets;
  }

  return [ticket, ...tickets];
};

const updateTicketStats = (stats = {}, ticket, action) => {
  const isAnnual = isTicketAnnual(ticket);
  const delta = action === "remove" ? -1 : 1;
  const ticketFee = getTicketFee(ticket);
  const nextStats = { ...stats };

  if (isAnnual) {
    nextStats.annual_tickets = adjustStatValue(nextStats.annual_tickets, delta);
  } else {
    nextStats.daily_tickets = adjustStatValue(nextStats.daily_tickets, delta);
  }

  if (isTodaysTicket(ticket)) {
    if (isAnnual) {
      nextStats.annual_tickets_today = adjustStatValue(nextStats.annual_tickets_today, delta);
      nextStats.annual_collections_today = adjustStatValue(nextStats.annual_collections_today, delta * ticketFee);
    } else {
      nextStats.daily_tickets_today = adjustStatValue(nextStats.daily_tickets_today, delta);
      nextStats.daily_collections_today = adjustStatValue(nextStats.daily_collections_today, delta * ticketFee);
    }
    nextStats.today_collections = adjustStatValue(nextStats.today_collections, delta * ticketFee);
  }

  return nextStats;
};

const buildTicketOverviewStats = (data, ticket) => {
  const nextData = { ...data };
  if (!nextData.stats) return data;

  nextData.stats = updateTicketStats(nextData.stats, ticket, "add");
  return nextData;
};

export const upsertVehicleTicketInCache = (queryClient, ticket, options = {}) => {
  if (!ticket?.ticket_id) return;

  const { insertIfMissing = false } = options;

  queryClient.getQueriesData({ queryKey: ["vehicle-tickets-data"] }).forEach(([queryKey, previous]) => {
    if (!previous) return;
    if (!Array.isArray(previous.tickets)) return;

    const filters = queryKey?.[1] ?? {};
    const queryTicketType = normalizeTicketType(filters?.ticketType ?? filters?.filters?.ticketType ?? "all");
    const isTicketQueryType = queryTicketType === "all" || queryTicketType === normalizeTicketType(ticket?.ticket_type ?? ticket?.ticketType);

    if (!isTicketQueryType) return;

    const nextTickets = upsertTicketArray(previous.tickets, ticket);
    const nextData = { ...previous, tickets: nextTickets };

    if (previous.stats) {
      nextData.stats = updateTicketStats(previous.stats, ticket, "add");
    }

    if (insertIfMissing) {
      const isFilteredSearch = String(filters?.search ?? "") !== "";
      const isPaginated = filters?.paginated !== false;
      if (isFilteredSearch || isPaginated) {
        queryClient.setQueryData(queryKey, nextData);
        return;
      }
    }

    queryClient.setQueryData(queryKey, nextData);
  });
};

export const updateVehicleTicketStatsInCache = (queryClient, ticket, action = "add") => {
  if (!ticket?.ticket_id) return;

  queryClient.getQueriesData({ queryKey: ["vehicle-tickets-data"] }).forEach(([queryKey, previous]) => {
    if (!previous?.stats) return;

    const filters = queryKey?.[1] ?? {};
    const queryTicketType = normalizeTicketType(filters?.ticketType ?? filters?.filters?.ticketType ?? "all");
    const isTicketQueryType = queryTicketType === "all" || queryTicketType === normalizeTicketType(ticket?.ticket_type ?? ticket?.ticketType);

    if (!isTicketQueryType) return;

    const nextData = { ...previous, stats: updateTicketStats(previous.stats, ticket, action) };
    queryClient.setQueryData(queryKey, nextData);
  });
};

export const syncVehicleTypeUsageInCache = (queryClient, ticket) => {
  if (!ticket?.vehicle_type_id) return;

  const vehicleTypeId = String(ticket.vehicle_type_id);
  const isAnnual = isTicketAnnual(ticket);

  queryClient.setQueriesData({ queryKey: ["vehicle-tickets-data", "vehicle-types"] }, (previous) => {
    if (!previous?.vehicleTypes) return previous;

    const nextVehicleTypes = previous.vehicleTypes.map((type) => {
      if (String(type.vehicle_type_id) !== vehicleTypeId) return type;
      return {
        ...type,
        daily_tickets_using: isAnnual
          ? Number(type.daily_tickets_using ?? 0)
          : Number(type.daily_tickets_using ?? 0) + 1,
        annual_tickets_using: isAnnual
          ? Number(type.annual_tickets_using ?? 0) + 1
          : Number(type.annual_tickets_using ?? 0),
      };
    });

    return { ...previous, vehicleTypes: nextVehicleTypes };
  });

  queryClient.setQueryData(["vehicle-tickets-lookups"], (previous) => {
    if (!previous?.vehicleTypes) return previous;

    const nextVehicleTypes = previous.vehicleTypes.map((type) => {
      if (String(type.vehicle_type_id) !== vehicleTypeId) return type;
      return {
        ...type,
        daily_tickets_using: isAnnual
          ? Number(type.daily_tickets_using ?? 0)
          : Number(type.daily_tickets_using ?? 0) + 1,
        annual_tickets_using: isAnnual
          ? Number(type.annual_tickets_using ?? 0) + 1
          : Number(type.annual_tickets_using ?? 0),
      };
    });

    return { ...previous, vehicleTypes: nextVehicleTypes };
  });
};

export const removeVehicleTicketFromCache = (queryClient, ticket) => {
  if (!ticket?.ticket_id) return;

  const ticketId = String(ticket.ticket_id);

  queryClient.getQueriesData({ queryKey: ["vehicle-tickets-data"] }).forEach(([queryKey, previous]) => {
    if (!previous) return;
    if (!Array.isArray(previous.tickets)) return;

    const filters = queryKey?.[1] ?? {};
    const queryTicketType = normalizeTicketType(filters?.ticketType ?? filters?.filters?.ticketType ?? "all");
    const isTicketQueryType = queryTicketType === "all" || queryTicketType === normalizeTicketType(ticket?.ticket_type ?? ticket?.ticketType);

    if (!isTicketQueryType) return;

    const nextTickets = previous.tickets.filter((item) => String(item?.ticket_id ?? item?.id ?? "") !== ticketId);
    const nextData = { ...previous, tickets: nextTickets };

    if (previous.stats) {
      nextData.stats = updateTicketStats(previous.stats, ticket, "remove");
    }

    queryClient.setQueryData(queryKey, nextData);
  });
};
