import { useState, useEffect } from 'react';
import { User, Mail, Folder, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { fadeInUp, smoothTransition } from '@/lib/motion';

export default function Welcome() {
  const [gitUser, setGitUser] = useState({ name: '', email: '' });
  const [repoCount, setRepoCount] = useState(0);

  useEffect(() => {
    window.electronAPI.git.getUser().then(setGitUser).catch(() => {});
    window.electronAPI.git.scanRepos().then(repos => setRepoCount(repos?.length || 0)).catch(() => {});
  }, []);

  return (
    <div className="relative h-full overflow-hidden">
      {/* Content */}
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto">
          {/* Greeting */}
          <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={smoothTransition}
            className="mb-10"
          >
            <h1 className="text-4xl font-bold mb-2 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
              Welcome to 铭
            </h1>
            <p className="text-[var(--text-secondary)] text-lg drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
              {format(new Date(), 'yyyy/MM/dd EEEE')}
            </p>
          </motion.div>

          {/* Info Cards */}
          <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={{ ...smoothTransition, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {/* Git User */}
            {gitUser.name && (
              <div className="p-5 rounded-xl bg-[var(--surface)]/80 border border-[hsl(var(--border))] backdrop-blur-md">
                <div className="p-2.5 rounded-xl bg-primary/10 w-fit mb-4">
                  <User size={20} className="text-primary" />
                </div>
                <div className="text-base font-semibold text-foreground">{gitUser.name}</div>
                {gitUser.email && (
                  <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                    <Mail size={12} />
                    {gitUser.email}
                  </div>
                )}
              </div>
            )}

            {/* Repos */}
            <div className="p-5 rounded-xl bg-[var(--surface)]/80 border border-[hsl(var(--border))] backdrop-blur-md">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 w-fit mb-4">
                <Folder size={20} className="text-emerald-400" />
              </div>
              <div className="text-base font-semibold text-foreground">{repoCount}</div>
              <div className="text-sm text-muted-foreground">Git Repositories</div>
            </div>

            {/* Date */}
            <div className="p-5 rounded-xl bg-[var(--surface)]/80 border border-[hsl(var(--border))] backdrop-blur-md">
              <div className="p-2.5 rounded-xl bg-primary/10 w-fit mb-4">
                <Calendar size={20} className="text-primary" />
              </div>
              <div className="text-base font-semibold text-foreground">
                {format(new Date(), 'HH:mm')}
              </div>
              <div className="text-sm text-muted-foreground">
                {format(new Date(), 'yyyy/MM/dd')}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
