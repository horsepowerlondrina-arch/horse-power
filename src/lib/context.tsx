import { createContext, useContext } from "react";
import type { Workspace, Session } from "./types";
export const AppContext = createContext<{
  data: Workspace;
  session: Session;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}>(null!);
export const useApp = () => useContext(AppContext);
