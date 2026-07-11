import { useMutation } from "@tanstack/react-query";
import api from "../api/axios";

// Login mutation hook keeps request logic out of the page component.
export const useLoginMutation = () =>
  useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post("/login", payload);
      return data;
    },
  });
