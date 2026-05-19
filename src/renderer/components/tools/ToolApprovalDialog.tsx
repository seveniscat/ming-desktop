import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';

interface ApprovalRequest {
  requestId: string;
  toolName: string;
  params: Record<string, any>;
}

export default function ToolApprovalDialog() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.tools?.onApprovalRequest) return;

    const unsubscribe = window.electronAPI.tools.onApprovalRequest((data: ApprovalRequest) => {
      setRequest(data);
      setResponding(false);
    });

    return unsubscribe;
  }, []);

  const handleRespond = useCallback((approved: boolean) => {
    if (!request) return;
    setResponding(true);
    window.electronAPI.tools.respondApproval(request.requestId, approved);
    setRequest(null);
    setResponding(false);
  }, [request]);

  const handleDeny = useCallback(() => handleRespond(false), [handleRespond]);
  const handleAllow = useCallback(() => handleRespond(true), [handleRespond]);

  if (!request) return null;

  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open) handleDeny(); }}>
      <DialogContent className="sm:max-w-[480px] border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-500/10 text-amber-500 text-xs">
              !
            </span>
            Tool Approval Required
          </DialogTitle>
          <DialogDescription>
            A tool is requesting permission to execute. Please review the details below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Tool</div>
            <div className="text-sm font-mono bg-muted/50 rounded px-3 py-1.5">
              {request.toolName}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Parameters</div>
            <pre className="text-xs font-mono bg-muted/50 rounded px-3 py-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(request.params, null, 2)}
            </pre>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleDeny}
            disabled={responding}
          >
            Deny
          </Button>
          <Button
            onClick={handleAllow}
            disabled={responding}
          >
            Allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
