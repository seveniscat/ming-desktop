import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import ComposerParameterCard from "@/components/chat/ComposerParameterCard";
import ComposerVariableCard from "@/components/chat/ComposerVariableCard";
import type { PendingParameterSkill, PendingVariablePrompt } from "@/components/chat/assistant-ui/AssistantThread";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/assistant-ui/reasoning";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "@/components/assistant-ui/tool-group";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  getMcpAppFromToolPart,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  unstable_useSlashCommandAdapter,
  type Unstable_SlashCommand,
  useAuiState,
} from "@assistant-ui/react";
import type { Unstable_TriggerItem } from "@assistant-ui/core";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { FC } from "react";

export interface QuickAction {
  id: string;
  label: string;
  icon?: string;
  onClick: () => void;
}

interface ThreadProps {
  commands?: Unstable_SlashCommand[];
  pendingParameterSkill?: PendingParameterSkill | null;
  pendingVariablePrompt?: PendingVariablePrompt | null;
  quickActions?: QuickAction[];
  onApplySkillParameters?: (values: Record<string, string>) => void;
  onCancelSkillParameters?: () => void;
  onApplyVariableValues?: (values: Record<string, string>) => void;
  onCancelVariableFill?: () => void;
}

export const Thread: FC<ThreadProps> = ({
  commands,
  pendingParameterSkill,
  pendingVariablePrompt,
  quickActions,
  onApplySkillParameters,
  onCancelSkillParameters,
  onApplyVariableValues,
  onCancelVariableFill,
}) => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root flex h-full flex-col bg-background"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-radius" as string]: "24px",
        ["--composer-padding" as string]: "10px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-1 flex-col px-4 pt-4">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <ThreadWelcome />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className="mb-10 flex flex-col gap-y-6 empty:hidden"
          >
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mt-auto flex flex-col gap-4 overflow-visible rounded-t-[var(--composer-radius)] bg-background pb-4 md:pb-6">
            <ThreadScrollToBottom />
            <Composer
              commands={commands}
              pendingParameterSkill={pendingParameterSkill}
              pendingVariablePrompt={pendingVariablePrompt}
              quickActions={quickActions}
              onApplySkillParameters={onApplySkillParameters}
              onCancelSkillParameters={onCancelSkillParameters}
              onApplyVariableValues={onApplyVariableValues}
              onCancelVariableFill={onCancelVariableFill}
            />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === "user") return <UserMessage />;
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:border-border dark:bg-background dark:hover:bg-accent"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root my-auto flex grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-4">
          <h1 className="aui-thread-welcome-message-inner font-semibold text-2xl">
            Hello there!
          </h1>
          <p className="aui-thread-welcome-message-inner text-muted-foreground text-xl">
            How can I help you today?
          </p>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions grid w-full gap-2 pb-4 md:grid-cols-2">
      <ThreadPrimitive.Suggestions>
        {() => <ThreadSuggestionItem />}
      </ThreadPrimitive.Suggestions>
    </div>
  );
};

const ThreadSuggestionItem: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestion-display">
      <SuggestionPrimitive.Trigger send asChild>
        <Button
          variant="ghost"
          className="aui-thread-welcome-suggestion h-auto w-full flex-col flex-wrap items-start justify-start gap-1 rounded-3xl border bg-background px-4 py-3 text-start text-sm transition-colors hover:bg-muted md:flex"
        >
          <SuggestionPrimitive.Title className="aui-thread-welcome-suggestion-text-1 font-medium" />
          <SuggestionPrimitive.Description className="aui-thread-welcome-suggestion-text-2 text-muted-foreground empty:hidden" />
        </Button>
      </SuggestionPrimitive.Trigger>
    </div>
  );
};

const SlashCommandItem: FC<{
  item: Unstable_TriggerItem;
}> = ({ item }) => {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new MutationObserver(() => {
      if (el.hasAttribute("data-highlighted")) {
        el.scrollIntoView({ block: "nearest" });
      }
    });
    obs.observe(el, { attributes: true, attributeFilter: ["data-highlighted"] });
    return () => obs.disconnect();
  }, []);

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverItem
      ref={ref}
      key={item.id}
      item={item}
      className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground cursor-pointer"
    >
      <span className="font-medium">{item.label ?? item.id}</span>
      {item.description && (
        <span className="text-muted-foreground text-xs truncate">{item.description}</span>
      )}
    </ComposerPrimitive.Unstable_TriggerPopoverItem>
  );
};

const Composer: FC<{
  commands?: Unstable_SlashCommand[];
  pendingParameterSkill?: PendingParameterSkill | null;
  pendingVariablePrompt?: PendingVariablePrompt | null;
  quickActions?: QuickAction[];
  onApplySkillParameters?: (values: Record<string, string>) => void;
  onCancelSkillParameters?: () => void;
  onApplyVariableValues?: (values: Record<string, string>) => void;
  onCancelVariableFill?: () => void;
}> = ({
  commands,
  pendingParameterSkill,
  pendingVariablePrompt,
  quickActions,
  onApplySkillParameters,
  onCancelSkillParameters,
  onApplyVariableValues,
  onCancelVariableFill,
}) => {
  const slash = unstable_useSlashCommandAdapter({
    commands: commands ?? [],
    removeOnExecute: true,
  });

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      {commands && commands.length > 0 && (
        <ComposerPrimitive.Unstable_TriggerPopover
          char="/"
          {...slash}
          className="z-50 max-h-64 w-96 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ComposerPrimitive.Unstable_TriggerPopover.Action {...slash.action} />
          <ComposerPrimitive.Unstable_TriggerPopoverItems
            className="grid gap-0.5"
          >
            {(items: readonly Unstable_TriggerItem[]) =>
              items.map((item) => (
                <SlashCommandItem key={item.id} item={item} />
              ))
            }
          </ComposerPrimitive.Unstable_TriggerPopoverItems>
        </ComposerPrimitive.Unstable_TriggerPopover>
      )}
      <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
        <ComposerPrimitive.AttachmentDropzone asChild>
          <div
            data-slot="aui_composer-shell"
            className="flex w-full flex-col gap-2 rounded-[var(--composer-radius)] border bg-background p-[var(--composer-padding)] transition-shadow focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20 data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50"
          >
            <ComposerAttachments />
            {quickActions && quickActions.length > 0 && (
              <div className="flex items-center gap-1.5 px-1">
                {quickActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={action.onClick}
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    <FileTextIcon className="size-3" />
                    {action.label}
                  </button>
                ))}
              </div>
            )}
            {pendingParameterSkill && (
              <ComposerParameterCard
                skillName={pendingParameterSkill.skillName}
                parameters={pendingParameterSkill.parameters}
                onConfirm={onApplySkillParameters ?? (() => {})}
                onCancel={onCancelSkillParameters ?? (() => {})}
              />
            )}
            {pendingVariablePrompt && (
              <ComposerVariableCard
                variables={pendingVariablePrompt.variables}
                onConfirm={onApplyVariableValues ?? (() => {})}
                onCancel={onCancelVariableFill ?? (() => {})}
              />
            )}
            <ComposerPrimitive.Input
              placeholder="Send a message... (type / for commands)"
              className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-1.75 py-1 text-sm outline-none placeholder:text-muted-foreground/80"
              rows={1}
              autoFocus
              aria-label="Message input"
            />
            <ComposerAction />
          </div>
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
};

const ComposerAction: FC = () => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      <ComposerAddAttachment />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send message"
            side="bottom"
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-send size-8 rounded-full"
            aria-label="Send message"
          >
            <ArrowUpIcon className="aui-composer-send-icon size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-8 rounded-full"
            aria-label="Stop generating"
          >
            <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const TypingIndicator: FC = () => {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="aui-typing-dot size-1.5 rounded-full bg-muted-foreground/60" />
      <span className="aui-typing-dot size-1.5 rounded-full bg-muted-foreground/60 [animation-delay:0.15s]" />
      <span className="aui-typing-dot size-1.5 rounded-full bg-muted-foreground/60 [animation-delay:0.3s]" />
    </div>
  );
};

const AssistantMessage: FC = () => {
  const createdAt = useAuiState((s) => s.message.createdAt);
  const status = useAuiState((s) => s.message.status?.type);
  const isRunning = status === "running";

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="relative [contain-intrinsic-size:auto_300px] [content-visibility:auto]"
    >
      <div
        data-slot="aui_assistant-message-bubble"
        className="aui-assistant-bubble rounded-2xl bg-muted/50 px-4 py-3"
      >
        <div
          data-slot="aui_assistant-message-content"
          className="wrap-break-word text-foreground leading-relaxed"
        >
          <MessagePrimitive.GroupedParts
            groupBy={(part) => {
              if (part.type === "reasoning")
                return ["group-chainOfThought", "group-reasoning"];
              if (part.type === "tool-call") {
                if (getMcpAppFromToolPart(part)) return null;
                return ["group-chainOfThought", "group-tool"];
              }
              return null;
            }}
          >
            {({ part, children }) => {
              switch (part.type) {
                case "group-chainOfThought":
                  return <div data-slot="aui_chain-of-thought">{children}</div>;
                case "group-reasoning": {
                  const running = part.status.type === "running";
                  return (
                    <ReasoningRoot defaultOpen={running}>
                      <ReasoningTrigger active={running} />
                      <ReasoningContent aria-busy={running}>
                        <ReasoningText>{children}</ReasoningText>
                      </ReasoningContent>
                    </ReasoningRoot>
                  );
                }
                case "group-tool":
                  return (
                    <ToolGroupRoot>
                      <ToolGroupTrigger
                        count={part.indices.length}
                        active={part.status.type === "running"}
                      />
                      <ToolGroupContent>{children}</ToolGroupContent>
                    </ToolGroupRoot>
                  );
                case "text":
                  return <MarkdownText />;
                case "reasoning":
                  return <Reasoning {...part} />;
                case "tool-call":
                  return part.toolUI ?? <ToolFallback {...part} />;
                default:
                  return null;
              }
            }}
          </MessagePrimitive.GroupedParts>
          {isRunning && <TypingIndicator />}
          <MessageError />
        </div>

        <div
          data-slot="aui_assistant-message-footer"
          className="flex items-center gap-1 pt-1.5"
        >
          <BranchPicker />
          <AssistantActionBar />
          <span className="ml-auto text-muted-foreground text-xs">
            {createdAt instanceof Date
              ? createdAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
              : null}
          </span>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root col-start-3 row-start-2 -ms-1 flex gap-1 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip="More"
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          className="aui-action-bar-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
              <DownloadIcon className="size-4" />
              Export as Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  const createdAt = useAuiState((s) => s.message.createdAt);

  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="flex flex-col items-end gap-1 px-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative min-w-0 flex items-start gap-2">
        <div className="aui-user-action-bar-wrapper pt-1 peer-empty:hidden">
          <UserActionBar />
        </div>
        <div className="aui-user-message-content wrap-break-word peer rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground empty:hidden">
          <MessagePrimitive.Parts />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <BranchPicker
          data-slot="aui_user-branch-picker"
          className="-me-1 justify-end"
        />
        <span className="text-muted-foreground text-xs">
          {createdAt instanceof Date
            ? createdAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
            : null}
        </span>
      </div>
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root ms-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-muted">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">Update</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root -ms-2 me-2 inline-flex items-center text-muted-foreground text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
