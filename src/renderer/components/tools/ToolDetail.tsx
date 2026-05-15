import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import type { ToolRecord } from '../../../shared/types';
import ToolBasicForm from './ToolBasicForm';
import ToolParamsEditor from './ToolParamsEditor';
import ToolTester from './ToolTester';
import ToolStats from './ToolStats';

interface ToolDetailProps {
  tool: ToolRecord;
  onUpdate: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}

export default function ToolDetail({ tool, onUpdate, onDelete, onToggleEnabled }: ToolDetailProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">{tool.display_name}</h2>
            <Badge variant="secondary" className="text-xs">{tool.implementation_type}</Badge>
            {tool.category && <Badge variant="outline" className="text-xs">{tool.category}</Badge>}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Enabled</span>
              <Switch checked={tool.is_enabled} onCheckedChange={onToggleEnabled} />
            </div>
            <button
              onClick={onDelete}
              className="text-sm text-muted-foreground hover:text-destructive transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="basic" className="h-full flex flex-col">
          <div className="px-6 pt-3 border-b border-[hsl(var(--border))]">
            <TabsList className="bg-transparent p-0 h-auto gap-4">
              <TabsTrigger value="basic" className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2">Basic Info</TabsTrigger>
              <TabsTrigger value="params" className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2">Parameters</TabsTrigger>
              <TabsTrigger value="test" className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2">Test</TabsTrigger>
              <TabsTrigger value="stats" className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2">Stats</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="basic" className="mt-0 p-6">
              <ToolBasicForm tool={tool} onUpdate={onUpdate} />
            </TabsContent>
            <TabsContent value="params" className="mt-0 p-6">
              <ToolParamsEditor tool={tool} onUpdate={onUpdate} />
            </TabsContent>
            <TabsContent value="test" className="mt-0 p-6">
              <ToolTester tool={tool} />
            </TabsContent>
            <TabsContent value="stats" className="mt-0 p-6">
              <ToolStats tool={tool} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
