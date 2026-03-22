import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  RotateCw,
  Square,
  CheckSquare,
  Plus,
  Clock,
  Users,
  Target,
  Zap,
  Layout,
  ChevronRight,
  ChevronDown,
  HelpCircle,
  Send,
  Eye,
  EyeOff
} from 'lucide-react';
import { TASKS_DATA } from '../constants';
import { Task } from '../types';

const SectionHeader = ({ title }: { title: string }) => (
  <div className="flex items-center gap-4 px-1">
    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-700 whitespace-nowrap">{title}</h3>
    <div className="h-px w-full bg-black/10"></div>
  </div>
);

interface TaskCardProps {
    task: Task;
    isReadOnly: boolean;
    onToggle?: () => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, isReadOnly, onToggle }) => {
    const [showHelp, setShowHelp] = useState(false);
    const [comment, setComment] = useState("");
    const [sent, setSent] = useState(false);
    const isDone = task.status === 'Done';

    const handleHelpSubmit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!comment.trim()) return;
        setSent(true);
        setTimeout(() => {
            setShowHelp(false);
            setComment("");
            setSent(false);
        }, 1500);
    };

    return (
        <div 
            onClick={!isReadOnly ? onToggle : undefined}
            className={`
            group relative bg-white rounded-3xl p-8 border transition-all duration-500 select-none text-left h-full
            ${isDone ? 'border-green-100 bg-green-50/20 opacity-60 shadow-none' : 'border-black/5 shadow-premium hover:shadow-2xl hover:border-alloro-orange/20 hover:-translate-y-1'}
            ${!isReadOnly ? 'cursor-pointer active:scale-[0.98]' : ''}
        `}>
            <div className="flex flex-row gap-8 items-start">
                <div className="shrink-0 mt-1">
                    {isDone ? (
                         <div className="w-8 h-8 rounded-xl bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-500/20">
                            <CheckSquare size={20} />
                         </div>
                    ) : (
                         <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all duration-300 ${
                            isReadOnly ? 'bg-alloro-navy/5 text-alloro-navy border-transparent' : 'bg-white border-slate-200 group-hover:border-alloro-orange group-hover:bg-alloro-orange/5 text-slate-200 group-hover:text-alloro-orange'
                         }`}>
                            {isReadOnly ? <Zap size={18} /> : <Square size={18} />}
                         </div>
                    )}
                </div>
                
                <div className="flex-1 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <h3 className={`font-black text-xl text-alloro-navy font-heading tracking-tight leading-tight transition-all ${isDone ? 'line-through opacity-30' : ''}`}>
                                {task.title}
                            </h3>
                            {task.priority === 'High' && !isDone && (
                                <span className="px-3 py-1 bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest rounded-lg border border-red-100 leading-none">High Priority</span>
                            )}
                        </div>
                        {!isDone && !isReadOnly && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShowHelp(!showHelp); }}
                                className={`p-2 rounded-xl transition-all duration-300 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${showHelp ? 'bg-alloro-orange text-white' : 'bg-alloro-bg text-slate-400 hover:text-alloro-orange hover:bg-alloro-orange/5'}`}
                            >
                                <HelpCircle size={14} /> {showHelp ? 'Close' : 'Ask Question'}
                            </button>
                        )}
                    </div>

                    {showHelp ? (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300 py-4 space-y-4 border-t border-black/5 mt-4" onClick={(e) => e.stopPropagation()}>
                            <div className="relative">
                                <textarea 
                                    autoFocus
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Ask your strategist a question..."
                                    className="w-full h-24 bg-alloro-bg border border-black/5 rounded-2xl px-5 py-4 text-alloro-navy font-bold text-sm focus:outline-none focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/5 transition-all resize-none"
                                />
                                <button 
                                    onClick={handleHelpSubmit}
                                    disabled={!comment.trim() || sent}
                                    className="absolute bottom-4 right-4 p-2.5 bg-alloro-navy text-white rounded-xl shadow-lg hover:bg-black transition-all active:scale-95 disabled:opacity-30"
                                >
                                    {sent ? <CheckCircle2 size={16} /> : <Send size={16} />}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">We'll get back to you shortly.</p>
                        </div>
                    ) : (
                        <>
                            <p className={`text-[16px] leading-relaxed font-bold tracking-tight transition-all ${isDone ? 'opacity-30' : 'text-slate-500'}`}>
                                {task.description}
                            </p>
                            
                            <div className="flex flex-wrap items-center gap-x-10 gap-y-3 pt-6 border-t border-black/5 text-[10px] font-black text-alloro-textDark/30 uppercase tracking-[0.2em]">
                                <span className="flex items-center gap-2.5">
                                    <Clock size={16} className="text-alloro-orange/40" /> {isDone ? `Done: ${task.completedDate}` : `Due: ${task.dueDate}`}
                                </span>
                                <span className="flex items-center gap-2.5">
                                    <Users size={16} className="text-alloro-orange/40" /> {task.assignee}
                                </span>
                                <div className="flex items-center gap-2">
                                <Layout size={14} className="opacity-40" />
                                <span className="text-slate-500">{task.category}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>(TASKS_DATA);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [completionPct, setCompletionPct] = useState(0);
  const [showAlloroTasks, setShowAlloroTasks] = useState(false);

  const alloroTasks = tasks.filter(t => t.source === 'Alloro');
  const userTasks = tasks.filter(t => t.source === 'User');

  useEffect(() => {
      const total = tasks.length;
      const done = tasks.filter(t => t.status === 'Done').length;
      setCompletionPct(Math.round((done / total) * 100));
  }, [tasks]);

  const handleToggleTask = (taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const newStatus = t.status === 'Done' ? 'Todo' : 'Done';
        const newCompletedDate = newStatus === 'Done' 
          ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
          : undefined;
        return { ...t, status: newStatus, completedDate: newCompletedDate };
      }
      return t;
    }));
  };

  const handleSync = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1200);
  };

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      <div className="max-w-[1400px] mx-auto relative flex flex-col">
        
        <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
          <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
                <Target size={20} />
              </div>
              <div className="flex flex-col text-left">
                <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">To-Do List</h1>
                <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">Tasks for your team</span>
              </div>
            </div>
            <button 
                onClick={handleSync}
                className="flex items-center gap-3 px-6 py-3.5 bg-white border border-black/5 text-alloro-navy rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-alloro-orange/20 transition-all shadow-premium active:scale-95"
            >
                <RotateCw size={14} className={isRefreshing ? 'animate-spin' : ''} /> 
                <span className="hidden sm:inline">{isRefreshing ? 'Updating...' : 'Update To-Do List'}</span>
            </button>
          </div>
        </header>

        <main className="w-full max-w-[1100px] mx-auto px-6 lg:px-10 py-10 lg:py-16 space-y-12 lg:space-y-16">
          
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 text-left pt-2">
            <div className="flex items-center gap-4 mb-3">
               <div className="px-3 py-1.5 bg-alloro-orange/5 rounded-lg text-alloro-orange text-[10px] font-black uppercase tracking-widest border border-alloro-orange/10 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-alloro-orange"></span>
                  Actionable Growth
               </div>
            </div>
            <h1 className="text-5xl lg:text-6xl font-black font-heading text-alloro-navy tracking-tight leading-none mb-4">
              Practice Roadmap.
            </h1>
            <p className="text-xl lg:text-2xl text-slate-500 font-medium tracking-tight leading-relaxed max-w-4xl">
              Complete these <span className="text-alloro-orange underline underline-offset-8 font-black">Team Tasks</span> to capture high-value revenue leakage.
            </p>
          </section>

          {/* TEAM TASKS - MAIN VIEW */}
          <section className="space-y-10">
              <div className="flex items-center justify-between px-2">
                 <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-alloro-orange text-white rounded-2xl flex items-center justify-center shadow-xl">
                       <Layout size={24} />
                    </div>
                    <div className="text-left">
                       <h2 className="text-2xl font-black font-heading text-alloro-navy tracking-tight leading-none">Team Tasks</h2>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">Action items for practice staff</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="hidden sm:flex flex-col items-end mr-4">
                       <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Total Completion</span>
                       <span className="text-base font-black text-alloro-navy font-sans leading-none">{completionPct}%</span>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-white border border-black/5 flex items-center justify-center shadow-inner-soft relative">
                       <svg className="absolute inset-0 w-full h-full -rotate-90">
                          <circle cx="50%" cy="50%" r="40%" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-50" />
                          <circle cx="50%" cy="50%" r="40%" stroke="currentColor" strokeWidth="3" fill="transparent" strokeDasharray="100" strokeDashoffset={100 - completionPct} strokeLinecap="round" className="text-alloro-orange transition-all duration-700" />
                       </svg>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {userTasks.map(task => (
                      <TaskCard 
                          key={task.id} 
                          task={task} 
                          isReadOnly={false} 
                          onToggle={() => handleToggleTask(task.id)}
                      />
                  ))}
                  <button className="h-full min-h-[280px] border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-4 text-slate-400 font-black uppercase tracking-[0.4em] text-[9px] hover:border-alloro-orange hover:text-alloro-orange hover:bg-white transition-all group shadow-inner-soft active:scale-[0.99]">
                      <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:scale-110 group-hover:shadow-premium transition-all">
                          <Plus size={24} />
                      </div>
                      Add Task
                  </button>
              </div>
          </section>

          {/* ALLORO TASKS - COLLAPSIBLE */}
          <section className="pt-8">
              <div className="w-full">
                  <button 
                      onClick={() => setShowAlloroTasks(!showAlloroTasks)}
                      className={`w-full flex items-center justify-between p-8 rounded-[2rem] border transition-all duration-500 group shadow-premium ${
                          showAlloroTasks ? 'bg-alloro-navy border-alloro-navy text-white' : 'bg-white border-black/5 text-alloro-navy hover:border-alloro-orange/20 hover:shadow-2xl'
                      }`}
                  >
                      <div className="flex items-center gap-6">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-inner ${
                              showAlloroTasks ? 'bg-white/10 text-alloro-orange border border-white/10' : 'bg-alloro-navy/5 text-alloro-navy'
                          }`}>
                              <Zap size={22} className={showAlloroTasks ? 'animate-pulse' : ''} />
                          </div>
                          <div className="text-left">
                              <h3 className={`text-xl font-black font-heading tracking-tight leading-none ${showAlloroTasks ? 'text-white' : 'text-alloro-navy'}`}>Alloro System Intelligence</h3>
                              <p className={`text-[9px] font-black uppercase tracking-widest mt-1.5 ${showAlloroTasks ? 'text-white/40' : 'text-slate-300'}`}>
                                  {alloroTasks.length} background tasks running
                              </p>
                          </div>
                      </div>
                      <div className={`transition-transform duration-700 ${showAlloroTasks ? 'rotate-180 text-alloro-orange' : 'text-slate-300 group-hover:translate-y-1'}`}>
                          <ChevronDown size={24} />
                      </div>
                  </button>

                  {showAlloroTasks && (
                      <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {alloroTasks.map(task => (
                                <TaskCard key={task.id} task={task} isReadOnly={true} />
                            ))}
                          </div>
                          <div className="p-8 bg-alloro-navy rounded-3xl text-center border border-white/5 shadow-2xl relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-48 h-48 bg-alloro-orange/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                              <p className="text-blue-100/40 text-sm font-bold tracking-tight relative z-10">
                                  Alloro is automatically managing <span className="text-white">Reputation Monitoring, Rank Tracking, and Lead Flow Integrity</span> in the background. No team interaction required.
                              </p>
                          </div>
                      </div>
                  )}
              </div>
          </section>

          <footer className="pt-16 pb-12 flex flex-col items-center gap-10 text-center">
             <div className="w-16 h-16 bg-alloro-orange text-white rounded-2xl flex items-center justify-center text-3xl font-black shadow-2xl">A</div>
             <p className="text-[11px] text-alloro-textDark/20 font-black tracking-[0.4em] uppercase">
               Alloro Roadmap • v2.6.0
             </p>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default Tasks;