export function getStoredToken() {
  return localStorage.getItem("token");
}

export function clearStoredAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/^head of meeo$/, "head");
}

export function hasAllowedWebRole(user) {
  const roles = [normalizeRole(user?.role), normalizeRole(user?.role_label)];
  return roles.includes("head") || roles.includes("coordinator");
}

export function getDefaultRouteForUser(user) {
  if (hasAllowedWebRole(user)) return "/dashboard";
  return "/login";
}

export function isAuthenticated() {
  const token = getStoredToken();
  const user = getStoredUser();

  return Boolean(token) && hasAllowedWebRole(user);
}
