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

export function hasAllowedWebRole(user) {
  return user?.role === "head" || user?.role === "coordinator";
}

export function getDefaultRouteForUser(user) {
  if (user?.role === "head") return "/dashboard";
  if (user?.role === "coordinator") return "/dashboard";
  return "/login";
}

export function isAuthenticated() {
  const token = getStoredToken();
  const user = getStoredUser();

  return Boolean(token) && hasAllowedWebRole(user);
}
