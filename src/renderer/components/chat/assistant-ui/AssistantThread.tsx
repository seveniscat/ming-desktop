import { ThreadPrimitive, MessagePrimitive } from '@assistant-ui/react';

const SUGGESTIONS = [
  'Explain this code to me',
  'Write a unit test',
  'Help me debug an issue',
];

/**
 * Thread component built from assistant-ui primitives.
 *
 * Uses the headless primitives (ThreadPrimitive.*, MessagePrimitive.*)
 * to assemble a chat thread with:
 * - Viewport with auto-scroll
 * - Message list with user/assistant bubbles
 * - Empty state with suggestion buttons
 *
 * Note: The composer is NOT included here. Render AssistantComposer
 * separately below this component in the layout for full control.
 */
export function AssistantThread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full w-full">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-4">
        {/* Empty state */}
        <ThreadPrimitive.Empty>
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-12 text-center">
            <div className="text-4xl">💬</div>
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
              How can I help you?
            </h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Start a conversation by typing a message below.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              {SUGGESTIONS.map((text) => (
                <ThreadPrimitive.Suggestion
                  key={text}
                  className="inline-flex items-center border border-[hsl(var(--border))] rounded-[var(--radius)] px-4 py-2 text-sm text-[hsl(var(--foreground))] bg-[hsl(var(--background))] cursor-pointer hover:bg-[var(--surface-hover)] hover:border-[hsl(var(--primary)/0.3)] transition-colors"
                  prompt={text}
                  send={false}
                  clearComposer={true}
                >
                  {text}
                </ThreadPrimitive.Suggestion>
              ))}
            </div>
          </div>
        </ThreadPrimitive.Empty>

        {/* Message list */}
        <ThreadPrimitive.Messages>
          {() => (
            <MessagePrimitive.Root className="mb-3">
              <MessagePrimitive.Content
                components={{
                  Text: ({ text }) => (
                    <p className="text-sm leading-relaxed text-[hsl(var(--foreground))] m-0 whitespace-pre-wrap">
                      {text}
                    </p>
                  ),
                }}
              />
            </MessagePrimitive.Root>
          )}
        </ThreadPrimitive.Messages>

        {/* Scroll to bottom button */}
        <ThreadPrimitive.ScrollToBottom className="sticky bottom-2 flex justify-center">
          <button
            type="button"
            className="rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-3 py-1 text-xs shadow-md hover:opacity-90 transition-opacity"
          >
            Scroll to bottom
          </button>
        </ThreadPrimitive.ScrollToBottom>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
