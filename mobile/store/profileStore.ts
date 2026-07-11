import { create } from "zustand";
import type { AuthUser } from "../api/auth";

type ProfileUser = {
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
};

type ProfileStore = ProfileUser & {
  setProfile: (profile: Partial<AuthUser>) => void;
  initProfile: (profile: AuthUser | null) => void;
};

const emptyProfile: AuthUser = {
  user_id: undefined,
  email: "",
  full_name: "",
  first_name: "",
  last_name: "",
  gender: "",
  contact_number: "",
  address: "",
  birthday: "",
  role: "",
  profile_image: "",
  profile_image_url: "",
  profile_image_uri: "",
};

export const useProfileStore = create<ProfileStore>((set) => ({
  ...emptyProfile,
  setProfile: (profile) =>
    set((state) => ({
      ...state,
      ...profile,
    })),
  initProfile: (profile) =>
    set(profile ? { ...emptyProfile, ...profile } : { ...emptyProfile }),
}));
