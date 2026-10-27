import { buildApiHeaders, getApiBaseUrl } from "./axios";
import { useHomeStore } from "../store/homeStore";
import { useHistoryStore } from "../store/historyStore";
import { useProfileStore } from "../store/profileStore";
import { useMasterDataStore } from "../store/masterDataStore";

export type AuthUser = {
  user_id?: number;
  email?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  contact_number?: string;
  address?: string;
  birthday?: string;
  role?: string;
  profile_image?: string;
  profile_image_url?: string;
  profile_image_uri?: string;
  password?: string;
  password_confirmation?: string;
};

type AuthSession = {
  token: string;
  user: AuthUser;
};

let authSession: AuthSession | null = null;

export function setAuthSession(session: AuthSession | null) {
  const previousUserId = authSession?.user?.user_id;
  const nextUserId = session?.user?.user_id;
  authSession = session;
  useProfileStore.getState().initProfile(session?.user ?? null);

  if (!session || (previousUserId && nextUserId && previousUserId !== nextUserId)) {
    useHistoryStore.getState().clearTransactionLock();
  }

  if (!session) {
    useHistoryStore.setState({
      syncedTransactions: [],
      transactionDetailCache: {},
      refreshKey: Date.now(),
      offlineSyncProgress: null,
      offlineSyncModalVisible: false,
    });
    useMasterDataStore.getState().triggerRefresh();
    useHomeStore.getState().clearHomeData();
    return;
  }

  useHomeStore.getState().setHomeData({
    userFullName: session?.user?.full_name?.trim() ?? "",
    userEmail: session?.user?.email?.trim() ?? "",
    userId: session?.user?.user_id ?? null,
  });
}

export function getAuthSession() {
  return authSession;
}

export function getAuthToken() {
  return authSession?.token ?? null;
}

export async function updateAuthUser(updates: Partial<AuthUser>) {
  if (!authSession) {
    return { success: false, message: "Not authenticated." };
  }

  const userId = authSession.user.user_id;
  if (!userId) {
    return { success: false, message: "Unable to determine authenticated user." };
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/users/${userId}`, {
      method: "PUT",
      headers: buildApiHeaders(authSession.token),
      body: JSON.stringify(updates),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        success: false,
        message: data?.message ?? "Unable to update user profile.",
        errors: data?.errors,
      };
    }

    const updatedUser = data?.data ?? authSession.user;
    authSession = {
      ...authSession,
      user: {
        ...authSession.user,
        ...updatedUser,
      },
    };

    useProfileStore.getState().setProfile(updatedUser);
    useHomeStore.getState().setHomeData({
      userFullName: updatedUser.full_name?.trim() ?? "",
      userEmail: updatedUser.email?.trim() ?? "",
      userId: updatedUser.user_id ?? authSession.user.user_id,
    });

    return { success: true, user: updatedUser };
  } catch {
    return { success: false, message: "Unable to reach the server." };
  }
}
