import { createContext, useContext } from 'react';

interface ToolApprovalContextType {
  /** Store of pending approvals: toolCallId → requestId */
  pendingApprovals: Map<string, string>;
  respondApproval: (approvalId: string, approved: boolean) => void;
}

const ToolApprovalContext = createContext<ToolApprovalContextType>({
  pendingApprovals: new Map(),
  respondApproval: () => {},
});

export const ToolApprovalProvider = ToolApprovalContext.Provider;

export function useToolApproval() {
  return useContext(ToolApprovalContext);
}
