import { useState, useEffect } from 'react';
import { User, Mail, Folder, Calendar } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { format } from 'date-fns';
import ParticleCanvas from './ParticleCanvas';

export default function Welcome() {
  const [gitUser, setGitUser] = useState({ name: '', email: '' });
  const [repoCount, setRepoCount] = useState(0);

  useEffect(() => {
    window.electronAPI.git.getUser().then(setGitUser).catch(() => {});
    window.electronAPI.git.scanRepos().then(repos => setRepoCount(repos?.length || 0)).catch(() => {});
  }, []);

  return (
    <div className="relative h-full overflow-hidden">
      <ParticleCanvas />

      {/* Content overlay */}
      <div className="relative z-10 h-full overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto">
          {/* Greeting */}
          <div className="mb-10">
            <h1 className="text-4xl font-bold mb-2 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
              Welcome to 銘
            </h1>
            <p className="text-blue-200/70 text-lg drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
              {format(new Date(), 'yyyy年MM月dd日 EEEE')}
            </p>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Git User */}
            {gitUser.name && (
              <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardContent className="pt-6">
                  <div className="p-3 rounded-lg bg-violet-500/20 w-fit mb-4">
                    <User size={24} className="text-violet-400" />
                  </div>
                  <div className="text-lg font-semibold text-white">{gitUser.name}</div>
                  {gitUser.email && (
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-blue-200/60">
                      <Mail size={12} />
                      {gitUser.email}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Repos */}
            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="p-3 rounded-lg bg-emerald-500/20 w-fit mb-4">
                  <Folder size={24} className="text-emerald-400" />
                </div>
                <div className="text-lg font-semibold text-white">{repoCount}</div>
                <div className="text-sm text-blue-200/60">Git Repositories</div>
              </CardContent>
            </Card>

            {/* Date */}
            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="p-3 rounded-lg bg-blue-500/20 w-fit mb-4">
                  <Calendar size={24} className="text-blue-400" />
                </div>
                <div className="text-lg font-semibold text-white">
                  {format(new Date(), 'HH:mm')}
                </div>
                <div className="text-sm text-blue-200/60">
                  {format(new Date(), 'yyyy/MM/dd')}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
