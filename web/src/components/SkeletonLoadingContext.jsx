import { createContext, useContext } from "react";

const SkeletonLoadingContext = createContext(false);

export const SkeletonLoadingProvider = ({ loading = false, children }) => (
  <SkeletonLoadingContext.Provider value={Boolean(loading)}>
    {children}
  </SkeletonLoadingContext.Provider>
);

export const useSkeletonLoading = (loading) => {
  const groupedLoading = useContext(SkeletonLoadingContext);
  return Boolean(loading || groupedLoading);
};
