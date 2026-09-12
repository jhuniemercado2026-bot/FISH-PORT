export function getStoredToken() {
  localStorage.removeItem("token");
  return sessionStorage.getItem("token");
}

export function clearStoredAuth() {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function getStoredUser() {
  try {
    localStorage.removeItem("user");
    return JSON.parse(sessionStorage.getItem("user") || "null");
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
