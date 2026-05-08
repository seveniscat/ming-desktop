import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Bot, FileText, Plug, Settings, ArrowRight } from 'lucide-react';

export interface WelcomePageProps {
  onComplete: () => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: '欢迎来到 Ming',
      description: '你的 AI 驱动的开发桌面助手',
      icon: Bot,
    },
    {
      title: '智能日报',
      description: '自动扫描 Git 仓库，一键生成今日工作总结',
      icon: FileText,
    },
    {
      title: 'AI Agent',
      description: '代码助手、研究助手、多功能对话',
      icon: Bot,
    },
    {
      title: '插件系统',
      description: '轻松扩展更多强大功能',
      icon: Plug,
    },
  ];

  const current = steps[currentStep];

  return (
    <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center z-50">
      <div className="max-w-2xl w-full mx-4 bg-zinc-900 border border-zinc-700 rounded-3xl overflow-hidden shadow-2xl">
        {/* Hero */}
        <div className="px-12 py-16 text-center border-b border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-500 via-purple-500 to-violet-600 rounded-2xl flex items-center justify-center mb-8">
            <span className="text-5xl">🧠</span>
          </div>
          <h1 className="text-6xl font-bold tracking-tighter text-white mb-4">
            欢迎使用 <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">Ming</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-md mx-auto">
            让 AI 帮你更高效地工作
          </p>
        </div>

        {/* Steps */}
        <div className="p-12">
          <div className="flex justify-between mb-8">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`w-8 h-1 rounded-full transition-all ${idx <= currentStep ? 'bg-blue-500' : 'bg-zinc-700'}`}
              />
            ))}
          </div>

          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-6">
                {React.createElement(current.icon, { size: 32, className: 'text-blue-400' })}
              </div>
              <CardTitle className="text-3xl text-white">{current.title}</CardTitle>
              <CardDescription className="text-lg text-zinc-400 mt-3">
                {current.description}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Actions */}
        <div className="p-8 border-t border-zinc-800 flex gap-4 justify-end bg-zinc-950">
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep(currentStep - 1)}
            >
              上一步
            </Button>
          )}
          <Button
            onClick={() => {
              if (currentStep < steps.length - 1) {
                setCurrentStep(currentStep + 1);
              } else {
                onComplete();
              }
            }}
            className="gap-2"
          >
            {currentStep < steps.length - 1 ? '下一步' : '立即开始使用'}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
