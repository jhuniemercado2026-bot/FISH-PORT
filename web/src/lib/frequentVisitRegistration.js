export const getFrequentVisitRegistrationTarget = (notification) => {
  const type = String(notification?.related_type || "").toLowerCase();
  const source = type === "frequent_visiting_docking" ? "docking"
    : type === "frequent_visiting_banyera" ? "banyera" : null;
  const id = Number(notification?.related_id);
  if (!source || !Number.isSafeInteger(id) || id <= 0) return null;
  return { pathname: "/add-boat", search: "", state: { registrationVisit: { source, id } } };
};

export const getVisitingBoatRegistrationData = (visit) => {
  if (visit?.boat_category !== "visiting" || visit?.boat_id || visit?.voided_at) return null;
  const name = String(visit.visiting_boat_name || "").trim();
  if (!name) return null;
  return { boat_name: name.toUpperCase(), boat_type_id: visit.visiting_boat_type_id || "" };
};
