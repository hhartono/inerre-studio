import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { api, setTokenGetter } from "@/lib/api";
import type { Me } from "@/types";

interface MeState {
  me: Me | null;
  loading: boolean;
  signedIn: boolean;
}

const MeCtx = createContext<MeState>({ me: null, loading: true, signedIn: false });

export function MeProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  setTokenGetter(() => getToken());

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    if (!isSignedIn) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get("/me")
      .then((r) => setMe(r.data))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn]);

  return <MeCtx.Provider value={{ me, loading: !isLoaded || loading, signedIn: !!isSignedIn }}>{children}</MeCtx.Provider>;
}

export const useMe = () => useContext(MeCtx);
