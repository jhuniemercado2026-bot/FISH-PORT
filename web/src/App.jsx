import React, { useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Login from "./pages/login/user-login";
import HomePage from "./pages/landing_page/home";
import AboutPage from "./pages/landing_page/about";
import ContactPage from "./pages/landing_page/contact";
import BottomToast from "./components/BottomToast";
import { useSidebarStore } from "./store/sidebarStore";
import {
  clearStoredAuth,
  getDefaultRouteForUser,
  getStoredUser,
  hasAllowedWebRole,
  isAuthenticated,
} from "./pages/login/auth";
import RbacDashboard from "./pages/rbac/dashboard";
import BoatManagement from "./pages/rbac/boat-management";
import SuperDocking from "./pages/rbac/docking";
import SuperBanyera from "./pages/rbac/banyera";
import SuperVehicleTickets from "./pages/rbac/vehicle-tickets";
import SuperBilling from "./pages/rbac/billing";
import SuperCollections from "./pages/rbac/collection";
import SuperStatementOfAccount from "./pages/rbac/statement-of-account";
import SuperReports from "./pages/rbac/reports";
import NotificationsPage from "./pages/rbac/notifications";
import SuperSettings from "./pages/rbac/settings";
import SuperArchived from "./pages/rbac/archived";
import SuperManageAccounts from "./pages/rbac/manage-accounts";
import SuperActivityLogs from "./pages/rbac/activity-logs";
import SuperSetFees from "./pages/rbac/set-fees";

const RequireAuth = ({ children, allowedRoles }) => {
  const user = getStoredUser();
  const role = user?.role;

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(role)) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  return children;
};

const RedirectWithSearch = ({ to }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
};

const AuthenticatedHistoryGuard = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();
  const seededHistoryRef = useRef(false);

  useEffect(() => {
    const targetRoute = getDefaultRouteForUser(user);
    const protectedRoutePrefixes = [
      "/dashboard",
      "/settings",
      "/registered-boats",
      "/add-boat",
      "/boat-type",
      "/boat-owners",
      "/docking",
      "/docking-calendar",
      "/banyera",
      "/fish-classification",
      "/vehicle-tickets",
      "/daily-vehicle-tickets",
      "/annual-vehicle-tickets",
      "/vehicle-types",
      "/billing",
      "/billing-payments",
      "/collections",
      "/payments",
      "/owner-statement",
      "/boat-statement",
      "/statement-of-account",
      "/reports",
      "/remittance",
      "/notification",
      "/archives",
      "/manage-accounts",
      "/activity-logs",
      "/set-fees",
      "/admin/dashboard",
      "/admin/settings",
      "/admin/registered-boats",
      "/admin/add-boat",
      "/admin/boat-type",
      "/admin/boat-owners",
      "/admin/docking",
      "/admin/docking-calendar",
      "/admin/banyera",
      "/admin/fish-classification",
      "/admin/vehicle-tickets",
      "/admin/daily-vehicle-tickets",
      "/admin/annual-vehicle-tickets",
      "/admin/vehicle-types",
      "/admin/billing",
      "/admin/billing-payments",
      "/admin/payments",
      "/admin/record-payment",
      "/admin/owner-statement",
      "/admin/boat-statement",
      "/admin/statement-of-account",
      "/admin/reports",
      "/admin/remittance",
      "/admin/archives",
      "/super-dashboard",
      "/super-registered-boats",
      "/super-add-boat",
      "/super-add-boat-type",
      "/super-boat-owners",
      "/super-docking",
      "/super-docking-calendar",
      "/super-banyera",
      "/super-fish-classification",
      "/super-vehicle-tickets",
      "/super-daily-vehicle-tickets",
      "/super-annual-vehicle-tickets",
      "/super-vehicle-types",
      "/super-billing",
      "/super-billing-payments",
      "/super-payments",
      "/super-record-payment",
      "/super-owner-statement",
      "/super-boat-statement",
      "/super-statement-of-account",
      "/super-reports",
      "/super-remittance",
      "/super-archived",
      "/super-manage-accounts",
      "/super-activity-logs",
      "/super-set-fees",
      "/super-settings",
    ];

    if (!seededHistoryRef.current) {
      const historyIndex = window.history.state?.idx;
      if (typeof historyIndex !== "number" || historyIndex <= 0) {
        window.history.pushState(
          { protectedRoute: true },
          "",
          `${location.pathname}${location.search}${location.hash}`
        );
      }
      seededHistoryRef.current = true;
    }

    const handlePopState = () => {
      const nextPath = window.location.pathname;
      const staysInsideProtectedRoutes = protectedRoutePrefixes.some(
        (prefix) => nextPath === prefix || nextPath.startsWith(`${prefix}?`) || nextPath.startsWith(`${prefix}/`)
      );

      if (staysInsideProtectedRoutes) {
        return;
      }

      window.history.pushState(
        { protectedRoute: true },
        "",
        `${location.pathname}${location.search}${location.hash}`
      );

      navigate(targetRoute, { replace: true });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [location.hash, location.pathname, location.search, navigate, user]);

  return children;
};

const PublicOnlyRoute = ({ children }) => {
  const location = useLocation();
  const user = getStoredUser();
  const searchParams = new URLSearchParams(location.search);
  const freshLogin = searchParams.get("fresh") === "1";

  if (freshLogin) {
    clearStoredAuth();
    return children;
  }

  if (user && !hasAllowedWebRole(user)) {
    clearStoredAuth();
    return children;
  }

  if (!isAuthenticated()) {
    return children;
  }

  return <Navigate to={getDefaultRouteForUser(user)} replace />;
};

const App = () => {
  // Keep responsive sidebar state in sync as the viewport changes.
  const syncSidebarViewport = useSidebarStore((state) => state.syncSidebarViewport);

  useEffect(() => {
    syncSidebarViewport();

    window.addEventListener("resize", syncSidebarViewport);
    return () => window.removeEventListener("resize", syncSidebarViewport);
  }, [syncSidebarViewport]);

  return (
    <Router>
      {/* Route pages stay focused on screen rendering and navigation. */}
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <RbacDashboard />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/notification"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <NotificationsPage />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperSettings />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/registered-boats"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <BoatManagement />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/add-boat"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <BoatManagement />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/boat-type"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <BoatManagement />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/boat-owners"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <BoatManagement />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/docking"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperDocking />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/docking-calendar"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperDocking />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/banyera"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperBanyera />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/fish-classification"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperBanyera />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/vehicle-tickets"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperVehicleTickets />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/daily-vehicle-tickets"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperVehicleTickets />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/annual-vehicle-tickets"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperVehicleTickets />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/vehicle-types"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperVehicleTickets />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/billing"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperBilling />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/billing-payments"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperBilling />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/create-billing"
          element={<Navigate to="/billing" replace />}
        />
        <Route
          path="/collections"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperCollections />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route path="/payments" element={<Navigate to="/collections" replace />} />
        <Route
          path="/record-payment"
          element={<RedirectWithSearch to="/billing-payments" />}
        />
        {["/owner-statement", "/boat-statement"].map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <AuthenticatedHistoryGuard>
                <RequireAuth allowedRoles={["head", "coordinator"]}>
                  <SuperStatementOfAccount />
                </RequireAuth>
              </AuthenticatedHistoryGuard>
            }
          />
        ))}
        <Route path="/statement-of-account" element={<Navigate to="/owner-statement" replace />} />
        <Route
          path="/reports"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperReports />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/remittance"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperCollections initialTab="remittance" />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/archives"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperArchived />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/manage-accounts"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head", "coordinator"]}>
                <SuperManageAccounts />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/activity-logs"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head"]}>
                <SuperActivityLogs />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route
          path="/set-fees"
          element={
            <AuthenticatedHistoryGuard>
              <RequireAuth allowedRoles={["head"]}>
                <SuperSetFees />
              </RequireAuth>
            </AuthenticatedHistoryGuard>
          }
        />
        <Route path="/admin/dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin/settings" element={<Navigate to="/settings" replace />} />
        <Route path="/admin-settings" element={<Navigate to="/settings" replace />} />
        <Route path="/admin_settings" element={<Navigate to="/settings" replace />} />
        <Route path="/admin/registered-boats" element={<Navigate to="/registered-boats" replace />} />
        <Route path="/admin-registered-boats" element={<Navigate to="/registered-boats" replace />} />
        <Route path="/admin_registered_boats" element={<Navigate to="/registered-boats" replace />} />
        <Route path="/admin/add-boat" element={<Navigate to="/add-boat" replace />} />
        <Route path="/admin-add-boat" element={<Navigate to="/add-boat" replace />} />
        <Route path="/admin_add_boat" element={<Navigate to="/add-boat" replace />} />
        <Route path="/admin/boat-type" element={<Navigate to="/boat-type" replace />} />
        <Route path="/admin-boat-type" element={<Navigate to="/boat-type" replace />} />
        <Route path="/admin_boat_type" element={<Navigate to="/boat-type" replace />} />
        <Route path="/admin/boat-owners" element={<Navigate to="/boat-owners" replace />} />
        <Route path="/admin-boat-owners" element={<Navigate to="/boat-owners" replace />} />
        <Route path="/admin_boat_owners" element={<Navigate to="/boat-owners" replace />} />
        <Route path="/admin/docking" element={<Navigate to="/docking" replace />} />
        <Route path="/admin-docking" element={<Navigate to="/docking" replace />} />
        <Route path="/admin_docking" element={<Navigate to="/docking" replace />} />
        <Route path="/admin/docking-calendar" element={<Navigate to="/docking-calendar" replace />} />
        <Route path="/admin-docking-calendar" element={<Navigate to="/docking-calendar" replace />} />
        <Route path="/admin_docking_calendar" element={<Navigate to="/docking-calendar" replace />} />
        <Route path="/admin/banyera" element={<Navigate to="/banyera" replace />} />
        <Route path="/admin-banyera" element={<Navigate to="/banyera" replace />} />
        <Route path="/admin_banyera" element={<Navigate to="/banyera" replace />} />
        <Route path="/admin/fish-classification" element={<Navigate to="/fish-classification" replace />} />
        <Route path="/admin-fish-classification" element={<Navigate to="/fish-classification" replace />} />
        <Route path="/admin_fish_classification" element={<Navigate to="/fish-classification" replace />} />
        <Route path="/admin/vehicle-tickets" element={<Navigate to="/vehicle-tickets" replace />} />
        <Route path="/admin-vehicle-tickets" element={<Navigate to="/vehicle-tickets" replace />} />
        <Route path="/admin_vehicle_tickets" element={<Navigate to="/vehicle-tickets" replace />} />
        <Route path="/admin/daily-vehicle-tickets" element={<Navigate to="/daily-vehicle-tickets" replace />} />
        <Route path="/admin-daily-vehicle-tickets" element={<Navigate to="/daily-vehicle-tickets" replace />} />
        <Route path="/admin_daily_vehicle_tickets" element={<Navigate to="/daily-vehicle-tickets" replace />} />
        <Route path="/admin/annual-vehicle-tickets" element={<Navigate to="/annual-vehicle-tickets" replace />} />
        <Route path="/admin-annual-vehicle-tickets" element={<Navigate to="/annual-vehicle-tickets" replace />} />
        <Route path="/admin_annual_vehicle_tickets" element={<Navigate to="/annual-vehicle-tickets" replace />} />
        <Route path="/admin/vehicle-types" element={<Navigate to="/vehicle-types" replace />} />
        <Route path="/admin-vehicle-types" element={<Navigate to="/vehicle-types" replace />} />
        <Route path="/admin_vehicle_types" element={<Navigate to="/vehicle-types" replace />} />
        <Route path="/admin/billing" element={<Navigate to="/billing" replace />} />
        <Route path="/admin-billing" element={<Navigate to="/billing" replace />} />
        <Route path="/admin_billing" element={<Navigate to="/billing" replace />} />
        <Route path="/admin/billing-payments" element={<Navigate to="/billing-payments" replace />} />
        <Route path="/admin-billing-payments" element={<Navigate to="/billing-payments" replace />} />
        <Route path="/admin_billing_payments" element={<Navigate to="/billing-payments" replace />} />
        <Route path="/admin/create-billing" element={<Navigate to="/billing" replace />} />
        <Route path="/admin-create-billing" element={<Navigate to="/billing" replace />} />
        <Route path="/admin_create_billing" element={<Navigate to="/billing" replace />} />
        <Route path="/admin/payments" element={<Navigate to="/collections" replace />} />
        <Route path="/admin-payments" element={<Navigate to="/collections" replace />} />
        <Route path="/admin_payments" element={<Navigate to="/collections" replace />} />
        <Route path="/admin/record-payment" element={<RedirectWithSearch to="/billing-payments" />} />
        <Route path="/admin-record-payment" element={<RedirectWithSearch to="/billing-payments" />} />
        <Route path="/admin_record_payment" element={<RedirectWithSearch to="/billing-payments" />} />
        <Route path="/admin/owner-statement" element={<Navigate to="/owner-statement" replace />} />
        <Route path="/admin/boat-statement" element={<Navigate to="/boat-statement" replace />} />
        <Route path="/admin/statement-of-account" element={<Navigate to="/owner-statement" replace />} />
        <Route path="/admin-statement-of-account" element={<Navigate to="/owner-statement" replace />} />
        <Route path="/admin_statement_of_account" element={<Navigate to="/owner-statement" replace />} />
        <Route path="/admin/reports" element={<Navigate to="/reports" replace />} />
        <Route path="/admin-reports" element={<Navigate to="/reports" replace />} />
        <Route path="/admin_reports" element={<Navigate to="/reports" replace />} />
        <Route path="/admin/remittance" element={<Navigate to="/remittance" replace />} />
        <Route path="/admin-remittance" element={<Navigate to="/remittance" replace />} />
        <Route path="/admin_remittance" element={<Navigate to="/remittance" replace />} />
        <Route path="/admin/archives" element={<Navigate to="/archives" replace />} />
        <Route path="/admin-archives" element={<Navigate to="/archives" replace />} />
        <Route path="/admin_archives" element={<Navigate to="/archives" replace />} />
        <Route path="/super-dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/superDashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/super_dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/super-registered-boats" element={<Navigate to="/registered-boats" replace />} />
        <Route path="/super_registeredboats" element={<Navigate to="/registered-boats" replace />} />
        <Route path="/superRegisteredBoats" element={<Navigate to="/registered-boats" replace />} />
        <Route path="/super-add-boat" element={<Navigate to="/add-boat" replace />} />
        <Route path="/super_addboat" element={<Navigate to="/add-boat" replace />} />
        <Route path="/super-add-boat-type" element={<Navigate to="/boat-type" replace />} />
        <Route path="/super_addboattype" element={<Navigate to="/boat-type" replace />} />
        <Route path="/super-boat-owners" element={<Navigate to="/boat-owners" replace />} />
        <Route path="/super_boatowners" element={<Navigate to="/boat-owners" replace />} />
        <Route path="/super-docking" element={<Navigate to="/docking" replace />} />
        <Route path="/super_docking" element={<Navigate to="/docking" replace />} />
        <Route path="/super-docking-calendar" element={<Navigate to="/docking-calendar" replace />} />
        <Route path="/super_docking_calendar" element={<Navigate to="/docking-calendar" replace />} />
        <Route path="/super-banyera" element={<Navigate to="/banyera" replace />} />
        <Route path="/super_banyera" element={<Navigate to="/banyera" replace />} />
        <Route path="/super-fish-classification" element={<Navigate to="/fish-classification" replace />} />
        <Route path="/super_fish_classification" element={<Navigate to="/fish-classification" replace />} />
        <Route path="/super-vehicle-tickets" element={<Navigate to="/vehicle-tickets" replace />} />
        <Route path="/super_vehicle_tickets" element={<Navigate to="/vehicle-tickets" replace />} />
        <Route path="/super-daily-vehicle-tickets" element={<Navigate to="/daily-vehicle-tickets" replace />} />
        <Route path="/super_daily_vehicle_tickets" element={<Navigate to="/daily-vehicle-tickets" replace />} />
        <Route path="/super-annual-vehicle-tickets" element={<Navigate to="/annual-vehicle-tickets" replace />} />
        <Route path="/super_annual_vehicle_tickets" element={<Navigate to="/annual-vehicle-tickets" replace />} />
        <Route path="/super-vehicle-types" element={<Navigate to="/vehicle-types" replace />} />
        <Route path="/super_vehicle_types" element={<Navigate to="/vehicle-types" replace />} />
        <Route path="/super-billing" element={<Navigate to="/billing" replace />} />
        <Route path="/super_billing" element={<Navigate to="/billing" replace />} />
        <Route path="/super-billing-payments" element={<Navigate to="/billing-payments" replace />} />
        <Route path="/super_billing_payments" element={<Navigate to="/billing-payments" replace />} />
        <Route path="/super-create-billing" element={<Navigate to="/billing" replace />} />
        <Route path="/super_create_billing" element={<Navigate to="/billing" replace />} />
        <Route path="/super-payments" element={<Navigate to="/collections" replace />} />
        <Route path="/super_payments" element={<Navigate to="/collections" replace />} />
        <Route path="/super-record-payment" element={<RedirectWithSearch to="/billing-payments" />} />
        <Route path="/super_record_payment" element={<RedirectWithSearch to="/billing-payments" />} />
        <Route path="/super-owner-statement" element={<Navigate to="/owner-statement" replace />} />
        <Route path="/super-boat-statement" element={<Navigate to="/boat-statement" replace />} />
        <Route path="/super-statement-of-account" element={<Navigate to="/owner-statement" replace />} />
        <Route path="/super_statement_of_account" element={<Navigate to="/owner-statement" replace />} />
        <Route path="/super-reports" element={<Navigate to="/reports" replace />} />
        <Route path="/super_reports" element={<Navigate to="/reports" replace />} />
        <Route path="/super-remittance" element={<Navigate to="/remittance" replace />} />
        <Route path="/super-archived" element={<Navigate to="/archives" replace />} />
        <Route path="/super-admin/archives" element={<Navigate to="/archives" replace />} />
        <Route path="/super_admin/archives" element={<Navigate to="/archives" replace />} />
        <Route path="/super-admin-archives" element={<Navigate to="/archives" replace />} />
        <Route path="/super_archives" element={<Navigate to="/archives" replace />} />
        <Route path="/super-manage-accounts" element={<Navigate to="/manage-accounts" replace />} />
        <Route path="/super_manageaccounts" element={<Navigate to="/manage-accounts" replace />} />
        <Route path="/super-activity-logs" element={<Navigate to="/activity-logs" replace />} />
        <Route path="/super_activitylogs" element={<Navigate to="/activity-logs" replace />} />
        <Route path="/super-set-fees" element={<Navigate to="/set-fees" replace />} />
        <Route path="/super_setfees" element={<Navigate to="/set-fees" replace />} />
        <Route path="/super-settings" element={<Navigate to="/settings" replace />} />
        <Route path="/super_settings" element={<Navigate to="/settings" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomToast />
    </Router>
  );
};

export default App;
