import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import type { PromptTemplate } from '../../../shared/types';
import PromptBasicForm from './PromptBasicForm';
import PromptTester from './PromptTester';

interface PromptDetailProps {
  prompt: PromptTemplate;
  onUpdate: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}

export default function PromptDetail({ prompt, onUpdate, onDelete, onToggleEnabled }: PromptDetailProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">{prompt.name}</h2>
            <Badge
              variant={prompt.type === 'system' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {prompt.type}
            </Badge>
            {prompt.category && (
              <Badge variant="outline" className="text-xs">{prompt.category}</Badge>
            )}
            {prompt.variables.length > 0 && (
              <Badge variant="outline" className="text-xs">{prompt.variables.length} vars</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Enabled</span>
              <Switch checked={prompt.enabled} onCheckedChange={onToggleEnabled} />
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
              <TabsTrigger
                value="basic"
                className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2"
              >
                Basic Info
              </TabsTrigger>
              <TabsTrigger
                value="test"
                className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2"
              >
                Test
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="basic" className="mt-0 p-6">
              <PromptBasicForm prompt={prompt} onUpdate={onUpdate} />
            </TabsContent>
            <TabsContent value="test" className="mt-0 p-6">
              <PromptTester prompt={prompt} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
