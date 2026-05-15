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
    <div className="relative h-full overflow-hidden bg-gradient-to-br from-muted/30 via-background to-muted/20">
      {/* Content */}
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto">
          {/* Greeting */}
          <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={smoothTransition}
            className="mb-16"
          >
            <h1 className="text-3xl font-light text-foreground mb-2">
              Welcome to 铭
            </h1>
            <p className="text-muted-foreground text-sm">
              {format(new Date(), 'yyyy/MM/dd EEEE')}
            </p>
          </motion.div>

          {/* Info Cards */}
          <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={{ ...smoothTransition, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Git User */}
            {gitUser.name && (
              <div className="p-5 rounded-lg border border-border bg-card/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <User size={16} className="text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{gitUser.name}</div>
                    {gitUser.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Mail size={10} />
                        {gitUser.email}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Repos */}
            <div className="p-5 rounded-lg border border-border bg-card/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-md bg-emerald-500/10">
                  <Folder size={16} className="text-emerald-500" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{repoCount}</div>
                  <div className="text-xs text-muted-foreground">Git Repositories</div>
                </div>
              </div>
            </div>

            {/* Date */}
            <div className="p-5 rounded-lg border border-border bg-card/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Calendar size={16} className="text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {format(new Date(), 'HH:mm')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(), 'yyyy/MM/dd')}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
