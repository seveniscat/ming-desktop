import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface Identity {
  name: string;
  email: string;
}

interface IdentityContextType {
  identities: Identity[];
  setIdentities: (identities: Identity[]) => Promise<void>;
  loading: boolean;
}

const IdentityContext = createContext<IdentityContextType>({
  identities: [],
  setIdentities: async () => {},
  loading: true,
});

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [identities, setIdentitiesState] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.git.getMyIdentities()
      .then((ids: Identity[]) => {
        setIdentitiesState(ids || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setIdentities = useCallback(async (newIdentities: Identity[]) => {
    await window.electronAPI.git.setMyIdentities(newIdentities);
    setIdentitiesState(newIdentities);
  }, []);

  return (
    <IdentityContext.Provider value={{ identities, setIdentities, loading }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentities() {
  return useContext(IdentityContext);
}
