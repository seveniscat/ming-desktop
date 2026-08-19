import { useState, useEffect, useCallback, type MutableRefObject } from 'react';
import type { ExecutionState, ExecutionStep } from '../types';

function compactDetail(value: unknown, maxLength = 220): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}...` : singleLine;
}

function formatExecutionStep(log: any, index: number): ExecutionStep | null {
  const data = log.data || {};
  const id = `${log.timestamp || Date.now()}-${log.type}-${index}`;
  const timestamp = log.timestamp || Date.now();

  if (log.type === 'request') {
    return {
      id,
      type: 'request',
      timestamp,
      title: `请求模型 ${data.model || ''}`.trim(),
      detail: data.tools?.length ? `可用工具：${data.tools.join(', ')}` : `消息数：${data.messages?.length || 0}`,
      status: 'active',
    };
  }

  if (log.type === 'tool') {
    const completed = Boolean(data.duration);
    return {
      id,
      type: 'tool',
      timestamp,
      title: completed ? `工具完成：${data.toolName}` : `调用工具：${data.toolName}`,
      detail: completed
        ? compactDetail(data.toolResult || data.content)
        : compactDetail(data.toolArgs || data.content),
      status: completed ? 'done' : 'active',
    };
  }

  if (log.type === 'response') {
    return {
      id,
      type: 'response',
      timestamp,
      title: data.tools?.length ? `模型选择工具：${data.tools.join(', ')}` : '模型返回结果',
      detail: compactDetail(data.content || data.usage),
      status: 'done',
    };
  }

  if (log.type === 'chunk') {
    const content = compactDetail(data.content, 120);
    if (!content) return null;
    return {
      id,
      type: 'chunk',
      timestamp,
      title: '接收模型输出',
      detail: content,
      status: 'active',
    };
  }

  if (log.type === 'error') {
    return {
      id,
      type: 'error',
      timestamp,
      title: '执行出错',
      detail: compactDetail(data.error || data.content),
      status: 'error',
    };
  }

  return null;
}

export function useExecutionState(activeConversationRef: MutableRefObject<string | null>) {
  const [executionState, setExecutionState] = useState<ExecutionState>({
    steps: [],
    collapsed: false,
    finished: false,
  });

  useEffect(() => {
    const removeDebug = window.electronAPI.debug?.onModelCall((data) => {
      if (data.conversationId && data.conversationId !== activeConversationRef.current) {
        return;
      }

      setExecutionState(prev => {
        const step = formatExecutionStep(data, prev.steps.length);
        if (!step) return prev;
        return {
          ...prev,
          steps: [...prev.steps.slice(-39), step],
        };
      });
    });

    const removeToolEvent = window.electronAPI.conversations?.onStreamToolEvent((data) => {
      if (!activeConversationRef.current || data.conversationId !== activeConversationRef.current) {
        return;
      }

      if (data.event === 'tool_start' && data.toolName) {
        setExecutionState(prev => ({
          ...prev,
          finished: false,
          steps: [
            ...prev.steps.slice(-39),
            {
              id: `tool-start-${data.toolName}-${data.timestamp}`,
              type: 'tool',
              timestamp: data.timestamp,
              title: `调用工具：${data.toolName}`,
              detail: compactDetail(data.args),
              status: 'active',
            },
          ],
        }));
        return;
      }

      if (data.event === 'tool_result' && data.toolName) {
        setExecutionState(prev => {
          const steps = [...prev.steps];
          const startStep = steps.findIndex(
            s => s.type === 'tool' && s.status === 'active' && s.title === `调用工具：${data.toolName}`,
          );
          if (startStep >= 0) {
            steps[startStep] = {
              ...steps[startStep],
              status: 'done',
              title: `工具完成：${data.toolName}`,
              detail: [
                steps[startStep].detail,
                data.duration != null ? `耗时：${data.duration}ms` : '',
                data.result ? `结果：${compactDetail(data.result, 300)}` : '',
              ].filter(Boolean).join('\n'),
            };
          }
          return { ...prev, steps };
        });
        return;
      }

      if (data.event === 'tool_error' && data.toolName) {
        setExecutionState(prev => {
          const steps = [...prev.steps];
          const startStep = steps.findIndex(
            s => s.type === 'tool' && s.status === 'active' && s.title === `调用工具：${data.toolName}`,
          );
          if (startStep >= 0) {
            steps[startStep] = {
              ...steps[startStep],
              status: 'error',
              title: `工具失败：${data.toolName}`,
              detail: data.error || 'Tool execution failed',
            };
          }
          return { ...prev, steps };
        });
      }
    });

    return () => {
      removeDebug?.();
      removeToolEvent?.();
    };
  }, [activeConversationRef]);

  const toggleCollapsed = useCallback(() => {
    setExecutionState(prev => ({ ...prev, collapsed: !prev.collapsed }));
  }, []);

  const resetExecution = useCallback(() => {
    setExecutionState({ steps: [], collapsed: false, finished: false });
  }, []);

  return {
    executionState,
    setExecutionState,
    toggleCollapsed,
    resetExecution,
  };
}
